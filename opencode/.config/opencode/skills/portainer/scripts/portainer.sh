#!/usr/bin/env bash
# portainer skill helper: read-only, GET-only Portainer queries.
#
# Emits exactly one JSON document on stdout, including failures, and exits
# non-zero on every error. Designed to be driven by an OpenCode agent through
# the accompanying SKILL.md. No write/state-changing request is ever sent: the
# only HTTP method used is GET.
#
# Testability: the curl binary can be overridden with PORTAINER_CURL_BIN so
# fixture-driven tests can supply a fake curl without touching the network.
set -euo pipefail

CURL_BIN="${PORTAINER_CURL_BIN:-curl}"
CONNECT_TIMEOUT="${PORTAINER_CONNECT_TIMEOUT:-10}"
READ_TIMEOUT="${PORTAINER_READ_TIMEOUT:-30}"

TMP_DIR=""
SECRET_KEY=""
BASE_URL=""
API_ROOT=""
ENDPOINT_ID=""
PROJECT_NAME=""
STACK_NAME=""
SERVICE_NAME=""
SERVICE_ID=""
PROJECT_STACKS="[]"
SERVICES_FILE=""
TASKS_FILE=""
ENV=""
QUERY=""
STACK=""
SERVICE=""
TAIL=""
SINCE=""
UNTIL=""
PT_BODY=""
PT_STATUS=""
PT_CURL_RC=0

cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

# ------------------------------------------------------------------- errors

redact() {
  # Defensive: the secret must never reach stdout/stderr, even if upstream
  # echoed it back. Quoting the pattern makes the replacement literal.
  local text="$1"
  if [[ -n "$SECRET_KEY" ]]; then
    text="${text//"$SECRET_KEY"/[REDACTED]}"
  fi
  printf '%s' "$text"
}

pt_fail() { # code message [http_status] [details_json]
  local code="$1" msg="$2" status="${3:-}" details="${4:-}"
  [[ -n "$details" ]] || details='{}'
  msg="$(redact "$msg")"
  jq -cn --arg c "$code" --arg m "$msg" --arg s "$status" --argjson d "$details" \
    '{error:{code:$c,message:$m,
             http_status:(if $s=="" then null else ($s|tonumber) end),
             details:$d}}'
  exit 1
}

upstream_details() {
  local snippet
  snippet="$(redact "$(head -c 500 "$PT_BODY" 2>/dev/null | LC_ALL=C tr -c '[:print:]' ' ')")"
  jq -cn --arg b "$snippet" --arg s "${PT_STATUS:-}" \
    '{upstream_status:(if $s=="" then null else ($s|tonumber) end), body:$b}'
}

usage_fail() {
  pt_fail USAGE "$1"
}

# ---------------------------------------------------------------- arguments

REJECT_STREAM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      [[ $# -ge 2 ]] || usage_fail "--env requires a value"
      ENV="$2"; shift 2 ;;
    --query)
      [[ $# -ge 2 ]] || usage_fail "--query requires a value"
      QUERY="$2"; shift 2 ;;
    --stack)
      [[ $# -ge 2 ]] || usage_fail "--stack requires a value"
      STACK="$2"; shift 2 ;;
    --service)
      [[ $# -ge 2 ]] || usage_fail "--service requires a value"
      SERVICE="$2"; shift 2 ;;
    --tail)
      [[ $# -ge 2 ]] || usage_fail "--tail requires a value"
      TAIL="$2"; shift 2 ;;
    --since)
      [[ $# -ge 2 ]] || usage_fail "--since requires a value"
      SINCE="$2"; shift 2 ;;
    --until)
      [[ $# -ge 2 ]] || usage_fail "--until requires a value"
      UNTIL="$2"; shift 2 ;;
    --follow|-f|--stream|--stream=true|--stream=false|--no-stream)
      REJECT_STREAM="y"; shift ;;
    -h|--help)
      usage_fail "usage: portainer.sh --env stg|prd --query stacks|services|logs|stats [--stack S] [--service S] [--tail N | --since T [--until T] | --until T]" ;;
    --*)
      usage_fail "unknown option: $1" ;;
    *)
      usage_fail "unexpected argument: $1" ;;
  esac
done

if [[ -n "$REJECT_STREAM" ]]; then
  pt_fail STREAM_UNSUPPORTED "streaming/follow mode is not supported; all queries are non-streaming"
fi
[[ -n "$ENV" ]] || usage_fail "--env is required (stg or prd)"
if [[ "$ENV" != "stg" && "$ENV" != "prd" ]]; then
  pt_fail UNSUPPORTED_ENV "unsupported environment '$ENV' (expected stg or prd)"
fi
[[ -n "$QUERY" ]] || usage_fail "--query is required"
case "$QUERY" in
  stacks|services|logs|stats) : ;;
  *) usage_fail "unsupported query '$QUERY' (expected stacks, services, logs or stats)" ;;
esac

case "$QUERY" in
  services|logs|stats)
    [[ -n "$STACK" ]] || pt_fail STACK_REQUIRED "--stack is required for query '$QUERY'" ;;
esac
case "$QUERY" in
  logs|stats)
    [[ -n "$SERVICE" ]] || pt_fail SERVICE_REQUIRED "--service is required for query '$QUERY'" ;;
  *)
    [[ -z "$SERVICE" ]] || pt_fail SERVICE_INVALID "--service is only valid for logs and stats" ;;
esac
if [[ -n "$TAIL" ]]; then
  [[ "$QUERY" == "logs" ]] || usage_fail "--tail is only valid for logs"
  [[ "$TAIL" =~ ^[0-9]+$ ]] || pt_fail INVALID_TAIL "--tail must be a non-negative integer (got '$TAIL')"
fi
if [[ -n "$SINCE" || -n "$UNTIL" ]]; then
  [[ "$QUERY" == "logs" ]] || usage_fail "--since/--until are only valid for logs"
fi
if [[ -n "$TAIL" && ( -n "$SINCE" || -n "$UNTIL" ) ]]; then
  usage_fail "--tail is mutually exclusive with --since/--until"
fi

# ------------------------------------------------------------------ config

config_path() {
  printf '%s/pytc/config.json\n' "${XDG_CONFIG_HOME:-$HOME/.config}"
}

load_global_config() {
  local cfg
  cfg="$(config_path)"
  if [[ ! -r "$cfg" ]]; then
    pt_fail CONFIG_MISSING "global config is not readable: $cfg"
  fi
  local mode
  mode="$(stat -c '%a' "$cfg" 2>/dev/null || true)"
  if [[ "$mode" != "600" ]]; then
    pt_fail CONFIG_PERMS "global config must be chmod 600 (got '${mode:-unknown}'): $cfg"
  fi
  if ! jq -e '(.portainer | type) == "object"' "$cfg" >/dev/null 2>&1; then
    pt_fail CONFIG_INVALID "global config is not valid JSON or lacks a portainer object: $cfg"
  fi
  BASE_URL="$(jq -r '(.portainer.base_url // empty) | if type=="number" then tostring else . end' "$cfg")"
  SECRET_KEY="$(jq -r '(.portainer.secret_key // empty) | if type=="number" then tostring else . end' "$cfg")"
  [[ -n "$BASE_URL" ]] \
    || pt_fail CONFIG_INVALID "missing non-empty portainer.base_url in $cfg"
  [[ -n "$SECRET_KEY" ]] \
    || pt_fail CONFIG_INVALID "missing non-empty portainer.secret_key in $cfg"

  while [[ "$BASE_URL" == */ ]]; do BASE_URL="${BASE_URL%/}"; done
  [[ "$BASE_URL" == */api ]] && BASE_URL="${BASE_URL%/api}"
  API_ROOT="$BASE_URL/api"
}

load_project_endpoint() {
  local pcfg=".pytc.json" key value
  if [[ ! -r "$pcfg" ]]; then
    pt_fail PROJECT_CONFIG_MISSING "project config not found or not readable: $(pwd)/$pcfg"
  fi
  if ! jq -e '(.portainer | type) == "object"' "$pcfg" >/dev/null 2>&1; then
    pt_fail PROJECT_CONFIG_INVALID "project config is not valid JSON or lacks a portainer object: $(pwd)/$pcfg"
  fi
  key="${ENV}_id"
  value="$(jq -r --arg k "$key" '(.portainer[$k] // empty) | if type=="number" then tostring else . end' "$pcfg")"
  if [[ -z "$value" ]]; then
    pt_fail PROJECT_CONFIG_INVALID "missing non-empty portainer.$key in $(pwd)/$pcfg"
  fi
  ENDPOINT_ID="$value"
}

extract_project_name() {
  [[ -f "pyproject.toml" ]] \
    || pt_fail PYPROJECT_MISSING "pyproject.toml not found in $(pwd); run from the project root"
  local result
  if command -v python3 >/dev/null 2>&1; then
    result="$(python3 - <<'PY'
import json, sys
try:
    import tomllib
    with open("pyproject.toml", "rb") as fh:
        data = tomllib.load(fh)
except Exception:
    print(json.dumps({"ok": False, "code": "PROJECT_INVALID",
                      "message": "pyproject.toml is not valid TOML"}))
    sys.exit(0)
project = data.get("project")
name = project.get("name") if isinstance(project, dict) else None
if not isinstance(name, str) or not name.strip():
    print(json.dumps({"ok": False, "code": "PROJECT_NAME_MISSING",
                      "message": "project.name is missing or empty in pyproject.toml"}))
    sys.exit(0)
print(json.dumps({"ok": True, "name": name}))
PY
)"
  else
    local name
    name="$(awk '
      /^[[:space:]]*\[/ { section=$0; gsub(/[\[\] ]/, "", section); next }
      section=="project" && /^[[:space:]]*name[[:space:]]*=/ {
        sub(/^[^=]*=[[:space:]]*/, ""); gsub(/["'"'"']/, ""); print; exit
      }' pyproject.toml)"
    if [[ -z "$name" ]]; then
      result='{"ok": false, "code": "PROJECT_NAME_MISSING", "message": "project.name is missing or empty in pyproject.toml"}'
    else
      result="$(jq -cn --arg n "$name" '{ok:true, name:$n}')"
    fi
  fi
  if [[ "$(jq -r '.ok' <<<"$result")" != "true" ]]; then
    pt_fail "$(jq -r '.code' <<<"$result")" "$(jq -r '.message' <<<"$result")"
  fi
  PROJECT_NAME="$(jq -r '.name' <<<"$result")"
}

normalize_time() {
  local t="$1"
  local dur_re='^[0-9]+(ns|us|µs|ms|s|m|h)([0-9]+(ns|us|µs|ms|s|m|h))*$'
  if [[ "$t" =~ $dur_re ]]; then
    printf '%s' "$t"
    return 0
  fi
  if date -u -d "$t" +%Y-%m-%dT%H:%M:%SZ >/dev/null 2>&1; then
    date -u -d "$t" +%Y-%m-%dT%H:%M:%SZ
    return 0
  fi
  return 1
}

load_time_options() {
  local out
  if [[ -n "$SINCE" ]]; then
    out="$(normalize_time "$SINCE")" || pt_fail INVALID_TIME "invalid --since value '$SINCE'"
    SINCE="$out"
  fi
  if [[ -n "$UNTIL" ]]; then
    out="$(normalize_time "$UNTIL")" || pt_fail INVALID_TIME "invalid --until value '$UNTIL'"
    UNTIL="$out"
  fi
}

# --------------------------------------------------------------------- http

pt_get() { # path -> sets PT_STATUS, PT_BODY, PT_CURL_RC; never fails
  local path="$1"
  local body_file status_file
  body_file="$TMP_DIR/body.$$.$RANDOM"
  status_file="$TMP_DIR/status.$$.$RANDOM"
  : > "$body_file"
  PT_BODY="$body_file"
  local rc=0
  set +e
  "$CURL_BIN" -sS -q \
    --connect-timeout "$CONNECT_TIMEOUT" \
    --max-time "$READ_TIMEOUT" \
    --max-redirs 0 \
    -H "X-API-KEY: $SECRET_KEY" \
    -H "Accept: application/json" \
    -o "$body_file" \
    -w '%{http_code}' \
    "$API_ROOT$path" > "$status_file" 2>"$TMP_DIR/curlerr"
  rc=$?
  set -e
  PT_CURL_RC="$rc"
  PT_STATUS="$(tr -d ' \n\r' < "$status_file" 2>/dev/null || true)"
}

require_http_ok() { # path -> fail on transport/redirect/HTTP error
  local path="$1"
  if [[ "$PT_CURL_RC" -eq 47 || "$PT_STATUS" == 3* ]]; then
    pt_fail API_ERROR "GET $path returned a redirect (HTTP ${PT_STATUS:-unknown}); redirects are not followed" "${PT_STATUS:-}" "$(upstream_details)"
  fi
  if [[ "$PT_CURL_RC" -ne 0 ]]; then
    case "$PT_CURL_RC" in
      28) pt_fail TIMEOUT "GET $path timed out" ;;
      6|7) pt_fail NETWORK "GET $path could not reach the server" ;;
      *) pt_fail NETWORK "GET $path failed (curl exit $PT_CURL_RC)" ;;
    esac
  fi
  case "$PT_STATUS" in
    2*) : ;;
    401) pt_fail AUTHENTICATION "authentication failed (HTTP 401)" "$PT_STATUS" "$(upstream_details)" ;;
    403) pt_fail AUTHORIZATION "authorization failed (HTTP 403)" "$PT_STATUS" "$(upstream_details)" ;;
    *) pt_fail API_ERROR "GET $path returned HTTP $PT_STATUS" "$PT_STATUS" "$(upstream_details)" ;;
  esac
}

pt_get_ok() { # path -> sets PT_BODY (validated JSON)
  local path="$1"
  pt_get "$path"
  require_http_ok "$path"
  if ! jq -e . "$PT_BODY" >/dev/null 2>&1; then
    pt_fail INVALID_JSON "upstream response for $path was not valid JSON" "$PT_STATUS" "$(upstream_details)"
  fi
}

pt_get_binary_ok() { # path -> sets PT_BODY (raw body, no JSON check)
  local path="$1"
  pt_get "$path"
  require_http_ok "$path"
}

# ------------------------------------------------------------ jq definitions

read -r -d '' JQ_DEFS <<'JQ' || true
def normts:
  if . == null then null
  elif type == "number" then (if . > 0 then todate else null end)
  elif type == "string" then
    (if test("^[0-9]+$") then (tonumber | if . > 0 then todate else null end)
     elif test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T") then
       (sub("\\.[0-9]+"; "")
        | if endswith("Z") then (try (fromdateiso8601 | todate) catch null) else null end)
     else null end)
  else null end;
def stackstatus:
  if type == "number" then
    (if . == 1 then "active" elif . == 2 then "inactive" else null end)
  elif type == "string" then .
  else null end;
def cpu_pct:
  ((.cpu_stats.cpu_usage.total_usage // 0) - (.precpu_stats.cpu_usage.total_usage // 0)) as $u
  | ((.cpu_stats.system_cpu_usage // 0) - (.precpu_stats.system_cpu_usage // 0)) as $s
  | (.cpu_stats.online_cpus // ((.cpu_stats.cpu_usage.percpu_usage // []) | length) // 1) as $n
  | if $s > 0 then ((($u / $s) * $n * 100) * 100 | round / 100) else 0 end;
def disk_io:
  (.blkio_stats.io_service_bytes_recursive // []) as $io
  | {read_bytes:  ([ $io[] | select(.op == "Read")  | .value ] | add // 0),
     write_bytes: ([ $io[] | select(.op == "Write") | .value ] | add // 0)};
def net_io:
  [ (.networks // {})[] ] as $n
  | {rx_bytes: ([ $n[] | .rx_bytes ] | add // 0),
     tx_bytes: ([ $n[] | .tx_bytes ] | add // 0)};
JQ

# ---------------------------------------------------------- stack resolution

resolve_project_stacks() {
  pt_get_ok "/stacks"
  PROJECT_STACKS="$(jq -cn \
    --slurpfile d "$PT_BODY" \
    --arg eid "$ENDPOINT_ID" --arg project "$PROJECT_NAME" \
    "$JQ_DEFS"'
    ($d[0] // []) as $raw
    | [ $raw[]
        | select((.EndpointId // "") | tostring == $eid)
        | select((.Name // "") | startswith($project + "_")) ]
    | sort_by(.Name)')"
  if [[ "$(jq -r 'type' <<<"$PROJECT_STACKS")" != "array" ]]; then
    pt_fail INVALID_JSON "could not parse stacks response"
  fi
}

select_stack() {
  local count
  count="$(jq --arg s "$STACK" '[ .[] | select(.Name == $s) ] | length' <<<"$PROJECT_STACKS")"
  if [[ "$count" -eq 0 ]]; then
    pt_fail STACK_NOT_FOUND "stack '$STACK' was not found for project '$PROJECT_NAME' in $ENV"
  fi
  if [[ "$count" -gt 1 ]]; then
    pt_fail STACK_AMBIGUOUS "stack '$STACK' matched more than one stack"
  fi
  STACK_NAME="$STACK"
}

fetch_services_and_tasks() {
  pt_get_ok "/endpoints/$ENDPOINT_ID/docker/services"
  if [[ "$(jq -r 'type' "$PT_BODY" 2>/dev/null)" != "array" ]]; then
    pt_fail INVALID_JSON "services response was not a JSON array" "$PT_STATUS" "$(upstream_details)"
  fi
  SERVICES_FILE="$TMP_DIR/services.json"
  cp "$PT_BODY" "$SERVICES_FILE"

  pt_get_ok "/endpoints/$ENDPOINT_ID/docker/tasks"
  if [[ "$(jq -r 'type' "$PT_BODY" 2>/dev/null)" != "array" ]]; then
    pt_fail INVALID_JSON "tasks response was not a JSON array" "$PT_STATUS" "$(upstream_details)"
  fi
  TASKS_FILE="$TMP_DIR/tasks.json"
  cp "$PT_BODY" "$TASKS_FILE"
}

select_service() {
  if [[ "$SERVICE" != "$STACK_NAME"_* ]]; then
    pt_fail SERVICE_INVALID "service '$SERVICE' does not start with the stack prefix '${STACK_NAME}_'"
  fi
  local count
  count="$(jq --arg s "$SERVICE" '[ .[] | select((.Spec.Name // "") == $s) ] | length' "$SERVICES_FILE")"
  if [[ "$count" -eq 0 ]]; then
    pt_fail SERVICE_NOT_FOUND "service '$SERVICE' was not found in stack '$STACK_NAME'"
  fi
  if [[ "$count" -gt 1 ]]; then
    pt_fail SERVICE_AMBIGUOUS "service '$SERVICE' matched more than one service"
  fi
  SERVICE_NAME="$SERVICE"
  SERVICE_ID="$(jq -r --arg s "$SERVICE" '[ .[] | select((.Spec.Name // "") == $s) ][0].ID' "$SERVICES_FILE")"
}

running_tasks_for_service() {
  jq -c --arg sid "$SERVICE_ID" \
    '[ .[] | select(.ServiceID == $sid and .DesiredState == "running" and (.Status.State // "") == "running") ]' \
    "$TASKS_FILE"
}

# ------------------------------------------------------------------ queries

query_stacks() {
  resolve_project_stacks
  jq -n --arg env "$ENV" --arg eid "$ENDPOINT_ID" --arg project "$PROJECT_NAME" \
    --argjson stacks "$PROJECT_STACKS" \
    "$JQ_DEFS"'
    {environment:$env, endpoint_id:$eid, project:$project,
     stacks: [ $stacks[]
               | {name: .Name,
                  status: (.Status | stackstatus),
                  created_at: (.CreationDate | normts),
                  updated_at: (.UpdateDate | normts)} ]}'
}

query_services() {
  resolve_project_stacks
  select_stack
  fetch_services_and_tasks

  jq -n --arg env "$ENV" --arg eid "$ENDPOINT_ID" --arg project "$PROJECT_NAME" \
    --arg stack "$STACK_NAME" \
    --slurpfile services "$SERVICES_FILE" --slurpfile tasks "$TASKS_FILE" \
    "$JQ_DEFS"'
    {environment:$env, endpoint_id:$eid, project:$project, stack:$stack,
     services: [
       $services[0][]
       | select((.Spec.Name // "") | startswith($stack + "_"))
       | . as $s
       | ([ $tasks[0][]
            | select(.ServiceID == $s.ID
                     and .DesiredState == "running"
                     and (.Status.State // "") == "running") ] | length) as $run
       | select($run > 0)
       | {name: $s.Spec.Name,
          state: "running",
          image: ($s.Spec.TaskTemplate.ContainerSpec.Image? // null),
          replicas: {running: $run,
                     desired: ($s.Spec.Mode.Replicated?.Replicas? // null)},
          ports: [ ($s.Spec.EndpointSpec?.Ports? // [])[]
                   | {p: (.PublishedPort // 0), t: (.TargetPort // null), pr: (.Protocol // "tcp")}
                   | (if .p != 0 and .t != null
                        then "0.0.0.0:\(.p)->\(.t)/\(.pr)"
                        elif .t != null then "\(.t)/\(.pr)"
                        else null end)
                   | select(. != null) ]} ] | sort_by(.name)}'
}

build_logs_query() {
  local q="stdout=true&stderr=true&details=true&timestamps=true"
  if [[ -n "$TAIL" ]]; then
    q="$q&tail=$TAIL"
  elif [[ -n "$SINCE" || -n "$UNTIL" ]]; then
    [[ -n "$SINCE" ]] && q="$q&since=$SINCE"
    [[ -n "$UNTIL" ]] && q="$q&until=$UNTIL"
  else
    q="$q&tail=100"
  fi
  printf '%s' "$q"
}

decode_logs() { # raw body file output json file
  python3 - "$1" "$2" <<'PY'
import json, re, sys, datetime

path = sys.argv[1]
out_path = sys.argv[2]
raw = open(path, "rb").read()

def framed(data):
    if len(data) < 8:
        return False
    if data[0] not in (0, 1, 2):
        return False
    if data[1] or data[2] or data[3]:
        return False
    length = int.from_bytes(data[4:8], "big")
    return 8 + length <= len(data)

if framed(raw):
    payloads = []
    i, n = 0, len(raw)
    while i + 8 <= n:
        length = int.from_bytes(raw[i+4:i+8], "big")
        chunk = raw[i+8:i+8+length]
        i += 8 + length
        if len(chunk) < length:
            break
        payloads.append(chunk)
    text = b"".join(payloads)
else:
    text = raw

TS_RE = re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s+(.*)$')
TASK_RE = re.compile(r'com\.docker\.swarm\.task\.id=([A-Za-z0-9]+)')
DETAILS_RE = re.compile(r'^(?:[A-Za-z0-9_.\-]+=\S*,\s*)*[A-Za-z0-9_.\-]+=\S*\s+(.*)$')

def norm_ts(value):
    v = value.replace("Z", "+00:00")
    try:
        dt = datetime.datetime.fromisoformat(v)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    dt = dt.astimezone(datetime.timezone.utc).replace(microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

records = []
current_task = ""
current_ts = ""
for line in text.decode("utf-8", "replace").split("\n"):
    if line == "":
        continue
    ts = None
    rest = line
    m = TS_RE.match(line)
    if m:
        ts = norm_ts(m.group(1))
        rest = m.group(2)
        current_ts = ts
    task = None
    tm = TASK_RE.search(rest)
    if tm:
        task = tm.group(1)
        current_task = task
        rest = DETAILS_RE.sub(r'\1', rest, count=1)
    records.append({"task": task if task is not None else current_task,
                    "ts": ts if ts is not None else current_ts,
                    "msg": rest})

with open(out_path, "w") as fh:
    json.dump(records, fh)
PY
}

query_logs() {
  resolve_project_stacks
  select_stack
  fetch_services_and_tasks
  select_service

  local running
  running="$(running_tasks_for_service)"
  if [[ "$(jq 'length' <<<"$running")" -eq 0 ]]; then
    pt_fail SERVICE_NOT_RUNNING "service '$SERVICE_NAME' is not running"
  fi

  local q
  q="$(build_logs_query)"
  pt_get_binary_ok "/endpoints/$ENDPOINT_ID/docker/services/$SERVICE_ID/logs?$q"

  local logs_file="$TMP_DIR/logs.json"
  local cmap_file="$TMP_DIR/containers.json"
  decode_logs "$PT_BODY" "$logs_file"
  jq -cn --arg svc "$SERVICE_NAME" --slurpfile tasks "$TASKS_FILE" '
    reduce ($tasks[0][]) as $t ({};
      .[$t.ID] = ($svc + "." + (($t.Slot // 1) | tostring) + "." + $t.ID))' > "$cmap_file"

  jq -n --arg env "$ENV" --arg eid "$ENDPOINT_ID" --arg project "$PROJECT_NAME" \
    --arg stack "$STACK_NAME" --arg service "$SERVICE_NAME" \
    --slurpfile records "$logs_file" --slurpfile cmap "$cmap_file" \
    '{environment:$env, endpoint_id:$eid, project:$project, stack:$stack, service:$service,
      logs: ( $records[0]
              | group_by(.task)
              | map(. as $g
                    | {container: ($cmap[0][$g[0].task] // ($g[0].task // "unknown")),
                       first_ts: ([ $g[].ts ] | map(select(. != "")) | min // ""),
                       lines: ($g | sort_by(.ts) | map(.msg))})
              | sort_by(.first_ts)
              | map({container, lines}) )}'
}

query_stats() {
  resolve_project_stacks
  select_stack
  fetch_services_and_tasks
  select_service

  local running
  running="$(running_tasks_for_service)"
  if [[ "$(jq 'length' <<<"$running")" -eq 0 ]]; then
    pt_fail SERVICE_NOT_RUNNING "service '$SERVICE_NAME' is not running"
  fi

  local replicas="[]" failures="[]"
  local row container task_id cid created stats_json rec code msg
  while IFS= read -r row; do
    task_id="$(jq -r '.ID' <<<"$row")"
    created="$(jq -r '.CreatedAt // ""' <<<"$row")"
    cid="$(jq -r '.Status.ContainerStatus.ContainerID // ""' <<<"$row")"
    container="$(jq -r --arg svc "$SERVICE_NAME" \
      '($svc + "." + ((.Slot // 1) | tostring) + "." + .ID)' <<<"$row")"

    if [[ -z "$cid" ]]; then
      failures="$(jq -cn --argjson f "$failures" --arg c "$container" \
        '$f + [{container:$c, error:{code:"REPLICA_FAILED", message:"container id unavailable"}}]')"
      continue
    fi

    pt_get "/endpoints/$ENDPOINT_ID/docker/containers/$cid/stats?stream=false"
    if [[ "$PT_CURL_RC" -eq 0 && "$PT_STATUS" == "502" ]]; then
      pt_get "/endpoints/$ENDPOINT_ID/docker/containers/$cid/stats?stream=false"
    fi

    if [[ "$PT_CURL_RC" -ne 0 || "$PT_STATUS" != 2* ]] || ! jq -e . "$PT_BODY" >/dev/null 2>&1; then
      code="REPLICA_FAILED"
      [[ "$PT_CURL_RC" -eq 28 ]] && code=TIMEOUT
      [[ "$PT_STATUS" == "502" ]] && code=API_ERROR
      [[ "$PT_CURL_RC" -eq 0 && "$PT_STATUS" == 2* ]] && code=INVALID_JSON
      msg="stats request failed (curl exit $PT_CURL_RC, HTTP ${PT_STATUS:-none})"
      failures="$(jq -cn --argjson f "$failures" --arg c "$container" --arg code "$code" --arg m "$msg" \
        '$f + [{container:$c, error:{code:$code, message:$m}}]')"
      continue
    fi

    stats_json="$(cat "$PT_BODY")"
    rec="$(jq -cn --arg container "$container" --arg created "$created" \
      --argjson stats "$stats_json" \
      "$JQ_DEFS"'(
        $stats
        | {container: $container,
           cpu_percent: (. | cpu_pct),
           memory: {usage_bytes: (.memory_stats.usage // null),
                    limit_bytes: (.memory_stats.limit // null)},
           disk_io: (. | disk_io),
           network_io: (. | net_io),
           uptime_seconds:
             ((.read | normts) as $r
              | ($created | normts) as $s
              | if $r == null or $s == null then null
                else (($r | fromdateiso8601) - ($s | fromdateiso8601)) end)}
      )')"
    replicas="$(jq -cn --argjson r "$replicas" --argjson x "$rec" '$r + [$x]')"
  done < <(jq -c '.[]' <<<"$running")

  local ok_count
  ok_count="$(jq 'length' <<<"$replicas")"
  if [[ "$ok_count" -eq 0 ]]; then
    pt_fail REPLICA_FAILED "statistics could not be collected for any replica of '$SERVICE_NAME'" "" \
      "$(jq -cn --argjson f "$failures" '{replica_failures:$f}')"
  fi

  jq -n --arg env "$ENV" --arg eid "$ENDPOINT_ID" --arg project "$PROJECT_NAME" \
    --arg stack "$STACK_NAME" --arg service "$SERVICE_NAME" \
    --argjson replicas "$replicas" --argjson failures "$failures" \
    '{environment:$env, endpoint_id:$eid, project:$project, stack:$stack, service:$service,
      replicas:$replicas, failures:$failures}'
}

# -------------------------------------------------------------------- main

main() {
  TMP_DIR="$(mktemp -d)"
  load_global_config
  load_project_endpoint
  extract_project_name
  load_time_options

  case "$QUERY" in
    stacks) query_stacks ;;
    services) query_services ;;
    logs) query_logs ;;
    stats) query_stats ;;
  esac
}

main "$@"