#!/usr/bin/env bash
# pytc skill helper: deterministic Herdr/PyTC orchestration protocol.
#
# Implements the command-envelope, quoting, marker parsing, and bounded-wait
# logic described in SKILL.md. All state is persisted per session so it
# survives across separate tool calls.
#
# Exit codes for wait-style commands:
#   0  completion known (see stdout)
#   3  unknown: bounded wait timed out
#   4  unknown: herdr/pane error
#   5  unexpected host return while container work was in flight
#   6  host return before READY during shell startup
set -euo pipefail

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/pytc-skill"
WAIT_SLICE_MS=10000
READ_LINES=400

die() { printf 'pytc: %s\n' "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }
for __t in bash jq herdr; do need_cmd "$__t"; done
unset __t

# ---------------------------------------------------------------- ids / state

new_id() {
  local n="${1:-12}" pool id=""
  while (( ${#id} < n )); do
    pool=$(head -c 512 /dev/urandom | tr -dc 'A-Za-z0-9' || true)
    id+="$pool"
  done
  printf '%s' "${id:0:n}"
}

state_file() { printf '%s/%s.json' "$STATE_DIR" "$1"; }

st_get() {
  local f
  f=$(state_file "$1")
  [[ -f "$f" ]] || die "unknown session: $1"
  jq -r --arg k "$2" '.[$k] // ""' "$f"
}

st_set() {
  local s="$1" k="$2" v="$3" f tmp
  f=$(state_file "$s")
  [[ -f "$f" ]] || die "unknown session: $s"
  tmp=$(mktemp)
  jq --arg k "$k" --arg v "$v" '.[$k] = $v' "$f" >"$tmp" && mv "$tmp" "$f"
}

require_state() {
  local v
  v=$(st_get "$1" "$2")
  [[ -n "$v" ]] || die "session $1: required state '$2' is not set"
  printf '%s' "$v"
}

# ------------------------------------------------------------------- herdr io

pane_wait() { # pane regex timeout_ms -> stdout json; rc 0 matched, 1 timeout, 2 other
  local pane="$1" regex="$2" ms="$3" out rc
  set +e
  out=$(herdr pane wait-output --regex "$regex" "$pane" \
    --source recent-unwrapped --lines "$READ_LINES" --timeout "$ms" 2>&1)
  rc=$?
  set -e
  printf '%s' "$out"
  return "$rc"
}

pane_read_text() {
  herdr pane read "$1" --source recent-unwrapped --lines "${2:-$READ_LINES}" --format text 2>/dev/null || true
}

host_shell_ready() { # pane pytc_dir -> 0 if foreground looks like an idle host shell
  local pane="$1" dir="$2" info name argv0 cwd
  info=$(herdr pane process-info --pane "$pane" 2>/dev/null) || return 1
  name=$(jq -r '.result.process_info.foreground_processes[0].name // empty' <<<"$info")
  argv0=$(jq -r '.result.process_info.foreground_processes[0].argv[0] // empty' <<<"$info")
  cwd=$(jq -r '.result.process_info.foreground_processes[0].cwd // empty' <<<"$info")
  local base="${argv0##*/}"
  [[ ( "$base" == zsh || "$base" == bash || "$name" == zsh || "$name" == bash ) \
     && "$cwd" == "$dir" ]]
}

# ------------------------------------------------------------------ envelopes

quote_join() { # argv -> safely quoted command string
  local out="" t
  for t in "$@"; do
    printf -v t '%q' "$t"
    out+="$t "
  done
  printf '%s' "${out% }"
}

submit_text() { # session kind cmdtext -> prints command id
  local s="$1" kind="$2" cmdtext="$3" pane cid
  pane=$(require_state "$s" pane)
  cid=$(new_id 12)
  local envelope
  envelope="builtin printf '\\n__PYTC_BEGIN_${cid}__\\n'; if ${cmdtext}; then rc=0; else rc=\$?; fi; builtin printf '\\n__PYTC_DONE_%s_RC_%s__\\n' '${cid}' \"\$rc\""
  herdr pane run "$pane" "$envelope" >/dev/null || die "herdr pane run failed for pane $pane"
  st_set "$s" command_id "$cid"
  st_set "$s" kind "$kind"
  if [[ "$kind" == "container" ]]; then
    st_set "$s" lifecycle "container-command-running"
  elif [[ "$kind" == "host" ]]; then
    st_set "$s" lifecycle "host-command-running"
  fi
  printf '%s' "$cid"
}

# ------------------------------------------------------------------- commands

usage() {
  cat <<'EOF'
Usage: pytc.sh <command> [options]

Session / pane:
  session-new [--pytc-dir DIR] [--path PROJECT]        create session, print id
  pane-new <session> <label>                           create+label owned pane
  state <session>                                      print session state
  close <session>                                      close owned pane

Host Herdr context:
  preflight <action> [--path P] [--pytc-dir D] [-E env] [-N tenancy] [-R]
  container-name [--path P]
  env-check <session> [tool ...]                       default tools: vault docker

Shell lifecycle:
  shell-launch <session> [-- extra run.sh args...]     submit wrapped run.sh launch
  wait-ready <session> [--timeout SECS]                wait READY or HOST_RETURN (default 300)
  submit <session> --host|--container -- CMD...        submit command, print command id
  wait <session> <command-id> [--timeout SECS]         wait DONE marker (default 300)
  container-exit <session>                             submit 'exit' from ready state
  wait-host <session> [--timeout SECS]                 wait HOST_RETURN + host readiness (default 120)
  read <session> [command-id]                          read pane (or command evidence)
  send <session> <TEXT>                                type text + Enter (interactive answers)
  send-keys <session> <KEY>...                         send key presses
  interrupt <session>                                  send ctrl+c to owned pane
  reset <session>                                      recover lifecycle after cancelled command
EOF
}

[[ $# -ge 1 ]] || { usage >&2; exit 1; }
CMD="$1"
shift

cmd_session_new() {
  local pytc_dir="${PYTC_DIR:-$HOME/workspace/pytc}" path="" sid
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pytc-dir) pytc_dir="$2"; shift 2 ;;
      --path) path="$2"; shift 2 ;;
      *) die "session-new: unknown argument: $1" ;;
    esac
  done
  [[ -d "$pytc_dir" ]] || die "pytc dir not found: $pytc_dir (set --pytc-dir or PYTC_DIR)"
  pytc_dir=$(realpath "$pytc_dir")
  [[ -z "$path" ]] || { [[ -d "$path" ]] || die "project path not found: $path"; path=$(realpath "$path"); }
  sid=$(new_id 12)
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR" 2>/dev/null || true
  jq -n --arg session "$sid" --arg pytc_dir "$pytc_dir" --arg path "$path" \
    '{session:$session, pytc_dir:$pytc_dir, path:$path, pane:"", label:"",
      command_id:"", kind:"", lifecycle:"init", created:(now|floor|tostring)}' \
    > "$(state_file "$sid")"
  echo "$sid"
}

cmd_pane_new() {
  [[ $# -ge 2 ]] || die "pane-new <session> <label>"
  local s="$1" label="$2" dir layout cur w h direction out pane
  dir=$(require_state "$s" pytc_dir)
  layout=$(herdr pane layout --current 2>/dev/null) \
    || die "no herdr host context: 'herdr pane layout --current' failed"
  cur=$(jq -r '.result.layout.focused_pane_id // empty' <<<"$layout")
  [[ -n "$cur" ]] || die "could not identify current pane"
  read -r w h < <(jq -r --arg p "$cur" \
    '.result.layout.panes[] | select(.pane_id==$p) | "\(.rect.width) \(.rect.height)"' <<<"$layout")
  if (( ${w:-0} >= 100 )); then direction=right; else direction=down; fi
  out=$(herdr pane split --current --direction "$direction" --cwd "$dir" --no-focus 2>/dev/null) \
    || die "herdr pane split failed"
  pane=$(jq -r '.result.pane.pane_id // empty' <<<"$out")
  [[ -n "$pane" ]] || die "herdr pane split returned no pane id"
  herdr pane rename "$pane" "pytc-$label" >/dev/null 2>&1 || true
  st_set "$s" pane "$pane"
  st_set "$s" label "$label"
  st_set "$s" lifecycle "init"
  st_set "$s" command_id ""
  echo "$pane"
}

cmd_state() {
  [[ $# -eq 1 ]] || die "state <session>"
  local f; f=$(state_file "$1")
  [[ -f "$f" ]] || die "unknown session: $1"
  jq '.' "$f"
}

cmd_close() {
  [[ $# -eq 1 ]] || die "close <session>"
  local s="$1" pane
  pane=$(st_get "$s" pane)
  if [[ -n "$pane" ]]; then
    herdr pane close "$pane" >/dev/null 2>&1 || true
  fi
  st_set "$s" pane ""
  st_set "$s" lifecycle "closed"
  echo "closed"
}

cmd_shell_launch() {
  local s="$1"; shift
  if [[ "${1:-}" == "--" ]]; then shift; fi
  local pane path sid extras="" t
  pane=$(require_state "$s" pane)
  path=$(require_state "$s" path)
  sid=$(require_state "$s" session)
  host_shell_ready "$pane" "$(require_state "$s" pytc_dir)" \
    || die "owned pane $pane is not an idle host shell in $(require_state "$s" pytc_dir)"
  local quoted_path quoted_sid
  printf -v quoted_path '%q' "$path"
  printf -v quoted_sid '%q' "$sid"
  for t in "$@"; do
    printf -v t '%q' "$t"
    extras+="$t "
  done
  local cmdtext
  cmdtext="if PYTC_SKILL_SESSION=${quoted_sid} ./run.sh --action shell --path ${quoted_path} ${extras}; then rc=0; else rc=\$?; fi; builtin printf '\\n__PYTC_HOST_RETURN_%s_RC_%s__\\n' '${sid}' \"\$rc\""
  st_set "$s" lifecycle "starting-container"
  herdr pane run "$pane" "$cmdtext" >/dev/null || die "herdr pane run failed for pane $pane"
  echo "submitted"
}

wait_alternation() { # pane regex timeout_secs -> echoes matched line (rc 0) or "unknown ..." (rc 3/4)
  local pane="$1" regex="$2" timeout="$3" start end out rc_wait code matched
  start=$(date +%s)
  end=$(( start + timeout ))
  while :; do
    rc_wait=0
    out=$(pane_wait "$pane" "$regex" "$WAIT_SLICE_MS") || rc_wait=$?
    if (( rc_wait != 0 )); then
      code=$(jq -r '.error.code // empty' <<<"$out" 2>/dev/null || true)
      if [[ "$code" == "timeout" ]]; then
        if (( $(date +%s) >= end )); then
          echo "unknown reason=timeout"
          return 3
        fi
        continue
      fi
      echo "unknown reason=herdr-error"
      return 4
    fi
    matched=$(jq -r '.result.matched_line // empty' <<<"$out")
    printf '%s' "$matched"
    return 0
  done
}

cmd_wait_ready() {
  local s="$1" timeout=300
  if [[ "${2:-}" == "--timeout" ]]; then timeout="$3"; fi
  local pane sid regex matched rc_wait=0
  pane=$(require_state "$s" pane)
  sid=$(require_state "$s" session)
  regex="(?m)^(__PYTC_READY_${sid}__|__PYTC_HOST_RETURN_${sid}_RC_[0-9]+__)\\r?$"
  matched=$(wait_alternation "$pane" "$regex" "$timeout") || rc_wait=$?
  if (( rc_wait != 0 )); then
    printf '%s\n' "$matched"
    exit "$rc_wait"
  fi
  if [[ "$matched" == "__PYTC_READY_${sid}__" ]]; then
    # If the container has already returned, READY alone must not grant input.
    if pane_read_text "$pane" | grep -Eq "^__PYTC_HOST_RETURN_${sid}_RC_[0-9]+__$"; then
      st_set "$s" lifecycle "host-returned"
      echo "host-return rc=unknown (READY already followed by HOST_RETURN)"
      exit 6
    fi
    st_set "$s" lifecycle "container-ready"
    echo "ready"
  else
    local rc="${matched#__PYTC_HOST_RETURN_${sid}_RC_}"; rc="${rc%__}"
    st_set "$s" lifecycle "host-returned"
    echo "host-return rc=${rc:-unknown}"
    exit 6
  fi
}

cmd_submit() {
  local s="$1" kind="${2#--}"; shift 2
  if [[ "${1:-}" == "--" ]]; then shift; fi
  [[ $# -ge 1 ]] || die "submit: no command given"
  local lifecycle
  lifecycle=$(st_get "$s" lifecycle)
  if [[ "$kind" == "container" ]]; then
    [[ "$lifecycle" == "container-ready" ]] \
      || die "submit --container requires lifecycle container-ready (got: $lifecycle)"
  elif [[ "$kind" == "host" ]]; then
    [[ "$lifecycle" == "host-ready" || "$lifecycle" == "init" ]] \
      || die "submit --host requires lifecycle host-ready/init (got: $lifecycle)"
  else
    die "submit: kind must be --host or --container"
  fi
  local cid
  cid=$(submit_text "$s" "$kind" "$(quote_join "$@")")
  echo "$cid"
}

cmd_wait() {
  local s="$1" cid="$2" timeout=300
  if [[ "${3:-}" == "--timeout" ]]; then timeout="$4"; fi
  local pane sid kind regex matched rc_wait=0
  pane=$(require_state "$s" pane)
  sid=$(require_state "$s" session)
  kind=$(st_get "$s" kind)
  st_set "$s" deadline "$(( $(date +%s) + timeout ))"
  # Only container work can be aborted by an unexpected host return; a plain
  # host command must never match a (possibly stale) HOST_RETURN line.
  if [[ "$kind" == "container" ]]; then
    regex="(?m)^(__PYTC_DONE_${cid}_RC_[0-9]+__|__PYTC_HOST_RETURN_${sid}_RC_[0-9]+__)\\r?$"
  else
    regex="(?m)^__PYTC_DONE_${cid}_RC_[0-9]+__\\r?$"
  fi
  matched=$(wait_alternation "$pane" "$regex" "$timeout") || rc_wait=$?
  if (( rc_wait != 0 )); then
    printf '%s\n' "$matched"
    exit "$rc_wait"
  fi
  if [[ "$matched" == "__PYTC_DONE_${cid}_RC_"* ]]; then
    local rc="${matched#__PYTC_DONE_${cid}_RC_}"; rc="${rc%__}"
    st_set "$s" command_id ""
    local kind; kind=$(st_get "$s" kind)
    if [[ "$kind" == "container" ]]; then st_set "$s" lifecycle "container-ready"
    else st_set "$s" lifecycle "host-ready"; fi
    echo "rc=${rc:-unknown}"
  else
    local rc="${matched#__PYTC_HOST_RETURN_${sid}_RC_}"; rc="${rc%__}"
    st_set "$s" lifecycle "host-returned"
    echo "host-return-early rc=${rc:-unknown}"
    exit 5
  fi
}

cmd_container_exit() {
  local s="$1" lifecycle pane
  lifecycle=$(st_get "$s" lifecycle)
  [[ "$lifecycle" == "container-ready" ]] \
    || die "container-exit requires lifecycle container-ready (got: $lifecycle)"
  pane=$(require_state "$s" pane)
  herdr pane run "$pane" "exit" >/dev/null || die "herdr pane run failed for pane $pane"
  st_set "$s" lifecycle "returning-host"
  echo "submitted"
}

cmd_wait_host() {
  local s="$1" timeout=120
  if [[ "${2:-}" == "--timeout" ]]; then timeout="$3"; fi
  local pane sid regex matched rc rc_wait=0 dir
  pane=$(require_state "$s" pane)
  sid=$(require_state "$s" session)
  dir=$(require_state "$s" pytc_dir)
  regex="(?m)^__PYTC_HOST_RETURN_${sid}_RC_[0-9]+__\\r?$"
  matched=$(wait_alternation "$pane" "$regex" "$timeout") || rc_wait=$?
  if (( rc_wait != 0 )); then
    printf '%s\n' "$matched"
    exit "$rc_wait"
  fi
  rc="${matched#__PYTC_HOST_RETURN_${sid}_RC_}"; rc="${rc%__}"
  # give the host shell a moment to redraw its prompt
  local i
  for i in 1 2 3 4 5; do
    host_shell_ready "$pane" "$dir" && break
    sleep 1
  done
  if host_shell_ready "$pane" "$dir"; then
    st_set "$s" lifecycle "host-ready"
    echo "host-ready rc=${rc:-unknown}"
  else
    st_set "$s" lifecycle "host-returned"
    echo "unknown reason=host-shell-not-ready rc=${rc:-unknown}"
    exit 4
  fi
}

cmd_reset() {
  # Recovery after cancellation/unknown state: only call after inspecting the
  # pane (read/process-info) and confirming the shell is idle at a prompt.
  [[ $# -eq 1 ]] || die "reset <session>"
  local s="$1" lc
  lc=$(st_get "$s" lifecycle)
  case "$lc" in
    container-command-running|container-ready) st_set "$s" lifecycle "container-ready" ;;
    host-command-running|host-ready|host-returned) st_set "$s" lifecycle "host-ready" ;;
    *) die "reset: nothing to recover from lifecycle '$lc'" ;;
  esac
  st_set "$s" command_id ""
  echo "reset lifecycle=$(st_get "$s" lifecycle)"
}

cmd_read() {
  local s="$1" cid="${2:-}" pane text
  pane=$(require_state "$s" pane)
  if [[ -z "$cid" ]]; then
    pane_read_text "$pane"
  else
    pane_read_text "$pane" "$READ_LINES" | awk -v b="__PYTC_BEGIN_${cid}__" -v e="^__PYTC_DONE_${cid}_RC_[0-9]+__$" '
      { sub(/\r$/, "") }
      $0 == b { f = 1; next }
      $0 ~ e { f = 0 }
      f { print }
    '
  fi
}

cmd_send() {
  [[ $# -ge 2 ]] || die "send <session> <TEXT>"
  local s="$1" pane; shift
  pane=$(require_state "$s" pane)
  herdr pane run "$pane" "$*" >/dev/null || die "herdr pane run failed for pane $pane"
  echo "sent"
}

cmd_send_keys() {
  [[ $# -ge 2 ]] || die "send-keys <session> <KEY>..."
  local s="$1" pane; shift
  pane=$(require_state "$s" pane)
  herdr pane send-keys "$pane" "$@" >/dev/null || die "herdr pane send-keys failed for pane $pane"
  echo "sent"
}

cmd_interrupt() {
  [[ $# -eq 1 ]] || die "interrupt <session>"
  local s="$1" pane
  pane=$(require_state "$s" pane)
  herdr pane send-keys "$pane" ctrl+c >/dev/null || die "herdr pane send-keys failed for pane $pane"
  echo "interrupted"
}

cmd_env_check() {
  [[ $# -ge 1 ]] || die "env-check <session> [tool ...]"
  local s="$1"; shift
  local tools=()
  if [[ $# -ge 1 ]]; then tools=("$@"); else tools=(vault docker); fi
  local checks="" t need_token=0
  for t in "${tools[@]}"; do
    checks+="command -v ${t} >/dev/null 2>&1 && "
    if [[ "$t" == "vault" ]]; then need_token=1; fi
  done
  if (( need_token )); then
    checks+='test -n "${VAULT_TOKEN:-}"'
  else
    checks="${checks% && }"
  fi
  local cid out rc=0
  cid=$(submit_text "$s" "host" "$checks")
  out=$(cmd_wait "$s" "$cid" 60) || rc=$?
  if [[ "$rc" -eq 0 && "$out" == "rc=0" ]]; then
    echo "ok"
  else
    echo "missing-host-environment: ${out:-unknown} (establish credentials/tools in the owned pane's shell through normal host setup)" >&2
    exit 1
  fi
}

# ------------------------------------------------------------------ preflight

project_info() { # sets PJ_NAME PJ_VERSION PJ_BRANCH from --path
  [[ -n "$OPT_PATH" ]] || die "--path is required for action $ACTION"
  [[ -d "$OPT_PATH" ]] || die "path is not a directory: $OPT_PATH"
  OPT_PATH=$(realpath "$OPT_PATH")
  local pj="$OPT_PATH/pyproject.toml"
  [[ -f "$pj" ]] || die "missing $pj (expected a uv-based Python project)"
  PJ_NAME=$(grep '^name' "$pj" | head -1 | sed 's/.*"\(.*\)".*/\1/')
  PJ_VERSION=$(grep '^version' "$pj" | head -1 | sed 's/.*"\(.*\)".*/\1/')
  [[ -n "$PJ_NAME" && -n "$PJ_VERSION" ]] || die "could not read name/version from $pj"
  PJ_BRANCH=$(git -C "$OPT_PATH" branch --show-current 2>/dev/null || true)
  [[ -n "$PJ_BRANCH" ]] || die "could not determine git branch of $OPT_PATH"
}

check_docker_daemon() { docker info >/dev/null 2>&1 || die "docker daemon not reachable"; }
check_vault() {
  command -v vault >/dev/null 2>&1 || die "missing required command: vault"
  [[ -n "${VAULT_TOKEN:-}" ]] || die "VAULT_TOKEN is not set (never printed by this tool)"
}
check_image() {
  docker image inspect "$1" >/dev/null 2>&1 || echo "pytc: warning: image $1 not found locally" >&2
}
warn() { printf 'pytc: warning: %s\n' "$*" >&2; }

resolve_oc_port() {
  local p=9998
  if [[ -f "$OPT_PATH/.pytc.json" ]]; then
    p=$(jq -r '.tools.oc_port // 9998' "$OPT_PATH/.pytc.json")
  fi
  echo "$p"
}

check_port_collision() {
  local port="$1" hit
  hit=$(docker ps --format '{{.Ports}}' 2>/dev/null | grep -Eo "(^|[ ,])[^ ,]*:${port}->" | head -1 || true)
  [[ -z "$hit" ]] || die "port $port already published by another container (${hit# }); resolve the collision or use explicit port overrides"
}

check_opencode_pytc() {
  if [[ -d "$HOME/.config/opencode" && ! -d "$HOME/.config/pytc" ]]; then
    die "host opencode config present but ~/.config/pytc is missing; run './run.sh --action install' to fix"
  fi
}

cmd_container_name() {
  local OPT_PATH="${PYTC_PROJECT_PATH:-}" ACTION=container-name PJ_NAME PJ_VERSION PJ_BRANCH
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --path) OPT_PATH="$2"; shift 2 ;;
      *) die "container-name: unknown argument: $1" ;;
    esac
  done
  project_info
  echo "${PJ_NAME}_${PJ_BRANCH}"
}

cmd_preflight() {
  local ACTION="${1:-}"; shift || true
  [[ -n "$ACTION" ]] || die "preflight <action> [...]"
  local OPT_PATH="${PYTC_PROJECT_PATH:-}" OPT_PYTC_DIR="${PYTC_DIR:-$HOME/workspace/pytc}" \
        PJ_NAME="" PJ_VERSION="" PJ_BRANCH="" REPLAY_FLAG=""

  # host Herdr caller context: hard guard
  [[ "${HERDR_ENV:-}" == "1" ]] \
    || die "not in a host Herdr context (HERDR_ENV is not set); the pytc skill runs on the host inside Herdr only"
  herdr pane layout --current >/dev/null 2>&1 \
    || die "herdr context not reachable ('herdr pane layout --current' failed)"

  local t
  for t in bash jq docker herdr; do
    command -v "$t" >/dev/null 2>&1 || die "missing required command: $t"
  done

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --path) OPT_PATH="$2"; shift 2 ;;
      --pytc-dir) OPT_PYTC_DIR="$2"; shift 2 ;;
      -E|-N) shift 2 ;;
      -R) REPLAY_FLAG="yes"; shift ;;
      *) die "preflight: unknown argument: $1" ;;
    esac
  done

  [[ -d "$OPT_PYTC_DIR" ]] || die "pytc dir not found: $OPT_PYTC_DIR (set --pytc-dir or PYTC_DIR)"
  OPT_PYTC_DIR=$(realpath "$OPT_PYTC_DIR")
  [[ -x "$OPT_PYTC_DIR/run.sh" ]] || die "run.sh not executable at $OPT_PYTC_DIR/run.sh"

  local container_name=""
  case "$ACTION" in
    shell)
      project_info; check_docker_daemon; check_vault; check_opencode_pytc
      container_name="${PJ_NAME}_${PJ_BRANCH}"
      [[ "$container_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] \
        || die "derived container name '$container_name' is not a valid Docker name (branch '$PJ_BRANCH' contains invalid characters such as '/')"
      if docker ps -a --format '{{.Names}}' | grep -Fxq "$container_name"; then
        die "container '$container_name' already exists; refusing to adopt or remove it automatically"
      fi
      check_image local/pytc
      check_port_collision "$(resolve_oc_port)"
      [[ -f "$OPT_PATH/.python-version" ]] || warn "no .python-version in project; container startup prechecks may fail"
      ;;
    run)
      project_info; check_docker_daemon; check_vault; check_image local/pytc; check_opencode_pytc
      ;;
    publish)
      project_info; check_docker_daemon; check_vault; check_image local/pytc
      local images_dir="$OPT_PATH/infrastructure/images" found=0 f
      [[ -d "$images_dir" ]] || die "images directory not found at $images_dir"
      for f in "$images_dir"/Dockerfile*; do if [[ -f "$f" ]]; then found=1; fi; done
      (( found )) || die "no Dockerfile* under $images_dir; nothing to publish"
      [[ -z "$(git -C "$OPT_PATH" status --porcelain 2>/dev/null)" ]] \
        || warn "working tree is dirty; publish will refuse until it is clean"
      ;;
    deploy)
      project_info; check_docker_daemon; check_vault
      command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 \
        || die "docker compose is required for deploy"
      [[ -f "$OPT_PATH/infrastructure/templates/stack/cookiecutter.json" ]] \
        || die "stack template not found at $OPT_PATH/infrastructure/templates/stack/cookiecutter.json"
      if [[ -n "$REPLAY_FLAG" ]]; then
        [[ -f "$OPT_PATH/.cookiecutter_replay/stack.json" ]] \
          || die "replay file not found at $OPT_PATH/.cookiecutter_replay/stack.json (run an interactive deploy first)"
      fi
      ;;
    devstack)
      project_info; check_docker_daemon; check_vault; check_opencode_pytc
      [[ -f "$OPT_PATH/Dockerfile" ]] || die "Dockerfile not found at $OPT_PATH/Dockerfile"
      [[ -f "$OPT_PATH/compose.yaml" ]] || die "compose.yaml not found at $OPT_PATH/compose.yaml"
      local builder_ref builder_suffix builder_line
      builder_line=$(grep '^ARG BUILDER_IMAGE=' "$OPT_PATH/Dockerfile" | head -1 || true)
      [[ -n "$builder_line" ]] || die "ARG BUILDER_IMAGE not found in $OPT_PATH/Dockerfile"
      builder_ref="${builder_line#*=}"; builder_suffix="${builder_ref#*:}"
      [[ -f "$OPT_PYTC_DIR/builders/Dockerfile_${builder_suffix}" ]] \
        || die "builder image file not found: $OPT_PYTC_DIR/builders/Dockerfile_${builder_suffix}"
      ;;
    install)
      [[ -z "$OPT_PATH" ]] || warn "--path ignored for action install"
      check_vault
      ;;
    upgrade|pubself)
      check_docker_daemon; check_vault
      command -v git >/dev/null 2>&1 || die "missing required command: git"
      if [[ -n "$OPT_PATH" ]]; then
        project_info
        [[ -f "$OPT_PATH/Dockerfile.pytc" ]] || die "Dockerfile.pytc required in project path for $ACTION: $OPT_PATH/Dockerfile.pytc"
      fi
      ;;
    rollback)
      command -v systemctl >/dev/null 2>&1 || warn "systemctl not found; rollback needs it"
      command -v sudo >/dev/null 2>&1 || warn "sudo not found; rollback needs it"
      ;;
    build)
      die "action 'build' appears in usage text but has no implementation; do not use it"
      ;;
    *)
      die "unsupported action: $ACTION"
      ;;
  esac
  echo "ok${container_name:+ container=${container_name}}"
}

# --------------------------------------------------------------------- dispatch

case "$CMD" in
  session-new) cmd_session_new "$@" ;;
  pane-new) cmd_pane_new "$@" ;;
  state) cmd_state "$@" ;;
  close) cmd_close "$@" ;;
  preflight) cmd_preflight "$@" ;;
  container-name) cmd_container_name "$@" ;;
  env-check) cmd_env_check "$@" ;;
  shell-launch) cmd_shell_launch "$@" ;;
  wait-ready) cmd_wait_ready "$@" ;;
  submit) cmd_submit "$@" ;;
  wait) cmd_wait "$@" ;;
  container-exit) cmd_container_exit "$@" ;;
  wait-host) cmd_wait_host "$@" ;;
  read) cmd_read "$@" ;;
  send) cmd_send "$@" ;;
  send-keys) cmd_send_keys "$@" ;;
  interrupt) cmd_interrupt "$@" ;;
  reset) cmd_reset "$@" ;;
  -h|--help|help) usage ;;
  *) usage >&2; die "unknown command: $CMD" ;;
esac
