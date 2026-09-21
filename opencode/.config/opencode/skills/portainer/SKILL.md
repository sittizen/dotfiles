---
name: portainer
description: "Read-only Docker Swarm deployment queries against the internal
  Portainer server. Use to answer stack, service, log, and container stats
  questions for the stg and prd environments."
---

# Portainer state queries

Answer read-only questions about Docker Swarm deployments managed by the
internal Portainer server. The human consumes your explanation; the helper is a
deterministic, machine-readable CLI you drive on their behalf.

Helper: `scripts/portainer.sh` inside this skill directory
(`~/.config/opencode/skills/portainer/scripts/portainer.sh` when installed).

```text
human -> you (OpenCode agent) -> SKILL.md -> portainer.sh -> Portainer API
```

## Hard rules

- **Environment is mandatory.** Always pass `--env stg` or `--env prd`. Never
  assume a default; `stg` and `prd` are the only accepted values.
- **Read-only.** Only the four queries below exist. Never attempt to deploy,
  redeploy, restart, stop, create, delete, exec, update, or prune. The helper
  sends `GET` requests only.
- **JSON only.** All stdout is a single JSON document, including failures.
  Everyday execution exits `0`; every error exits non-zero. Interpret the JSON
  error object and the exit status — never infer success from partial text or
  from an empty result.
- **Use exact names.** First resolve stacks with `--query stacks` when the stack
  identity is unknown, then use the exact `name` values returned. Never guess or
  fuzzy-match.
- **Never expose secrets.** Do not print, echo, log, or include the API key or
  any configuration file contents in your answer.
- **Keep log requests bounded.** Always bound output with `--tail`,
  `--since`, or `--until`. There is no streaming/follow mode.

## Invocation

```sh
PORT=$HOME/.config/opencode/skills/portainer/scripts/portainer.sh

# 1. which stacks belong to this project in the environment
"$PORT" --env stg --query stacks

# 2. running services inside one exact stack
"$PORT" --env stg --stack findata_staging_mi --query services

# 3. logs for one running service (aggregated across replicas)
"$PORT" --env stg --stack findata_staging_mi \
  --service findata_staging_mi_findatami --query logs --tail 100

# 4. one-shot stats for one running service (per replica)
"$PORT" --env prd --stack findata_production_mi \
  --service findata_production_mi_findatami --query stats
```

Options:

| Option | Applies to | Notes |
| --- | --- | --- |
| `--env stg\|prd` | all | Mandatory, no default |
| `--query stacks\|services\|logs\|stats` | all | Mandatory |
| `--stack NAME` | services, logs, stats | Exact stack name |
| `--service NAME` | logs, stats | Must start with `<stack>_` |
| `--tail N` | logs | Default `100`; mutually exclusive with `--since`/`--until` |
| `--since T` / `--until T` | logs | Relative duration (`30m`, `1h`) or ISO timestamp; may be combined |
| `--follow`/`--stream` | none | Rejected: `STREAM_UNSUPPORTED` |

Query-specific requirements: `services` needs `--stack`; `logs` and `stats` need
both `--stack` and `--service`.

## Reading results

- `stacks`: `{environment, endpoint_id, project, stacks[]}` with
  `name`, `status`, `created_at`, `updated_at`. Empty `stacks` is success.
- `services`: `{..., stack, services[]}` with `name`, `state`, `image`,
  `replicas` (`running`/`desired`), `ports`. Only running services appear; a
  service that is running but unhealthy is still returned.
- `logs`: `{..., stack, service, logs[]}` where each record has a `container`
  label and `lines` (strings). Multiple replicas are kept separate; never sum or
  merge their values. Tell the human which container produced which lines.
- `stats`: `{..., stack, service, replicas[], failures[]}`. Each replica has
  `cpu_percent`, `memory` (`usage_bytes`/`limit_bytes`), `disk_io`
  (`read_bytes`/`write_bytes`), `network_io` (`rx_bytes`/`tx_bytes`), and
  `uptime_seconds`. Values are snapshots per replica; never sum them.
- All timestamps are normalised to UTC ISO-8601 (`2026-09-21T12:34:56Z`).
  Missing metadata is `null` or `[]`, never invented.

## Errors

Every failure is `{"error":{"code","message","http_status","details"}}` with a
non-zero exit. Report the `code` and `message` to the human; do not retry a
query that failed validation or authentication. Common codes:

```text
USAGE, CONFIG_MISSING, CONFIG_INVALID, CONFIG_PERMS,
PROJECT_CONFIG_MISSING, PROJECT_CONFIG_INVALID,
PYPROJECT_MISSING, PROJECT_NAME_MISSING, PROJECT_INVALID,
UNSUPPORTED_ENV, STACK_REQUIRED, STACK_NOT_FOUND, STACK_AMBIGUOUS,
SERVICE_REQUIRED, SERVICE_INVALID, SERVICE_NOT_FOUND, SERVICE_AMBIGUOUS,
SERVICE_NOT_RUNNING, INVALID_TAIL, INVALID_TIME, STREAM_UNSUPPORTED,
AUTHENTICATION, AUTHORIZATION, API_ERROR, NETWORK, TIMEOUT, INVALID_JSON,
REPLICA_FAILED
```

Stats are best effort: a replica that fails appears in `failures` with its
container identity while healthy replicas stay in `replicas`. If every replica
fails the helper exits non-zero with `REPLICA_FAILED`. Explain partial failures
to the human rather than hiding them.

## Configuration (read-only reference)

Do not edit these files; if they are missing or invalid, report the error code
and stop.

- Global `${XDG_CONFIG_HOME:-$HOME/.config}/pytc/config.json`, mode `600`:
  `{"portainer":{"base_url":"...","secret_key":"..."}}`.
- Project `.pytc.json` in the project root:
  `{"portainer":{"stg_id":"...","prd_id":"..."}}`.
- Project identity comes from `project.name` in `pyproject.toml`; run from the
  project root. Stack ownership is the `<project>_` name prefix within the
  selected environment's endpoint.