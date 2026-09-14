---
name: pytc
description: "Operate the PyTC run.sh toolchain from host OpenCode inside Herdr.
  Use for PyTC project checks, toolchain shells, publishing, development stacks."
---

# PyTC toolchain operation

Operate the PyTC toolchain (`run.sh`) from the **host**, through a dedicated
Herdr pane. All protocol mechanics (command envelopes, quoting, markers,
bounded waits) are handled by the bundled helper — never reconstruct them by
hand.

Helper: `scripts/pytc.sh` inside this skill directory
(`~/.config/opencode/skills/pytc/scripts/pytc.sh` when installed).

## Hard rules

- **Host-only.** Reject execution unless running on the host inside a Herdr
  caller context. `pytc.sh preflight` enforces `HERDR_ENV=1` plus a reachable
  `herdr pane layout --current`. Missing `herdr`/`HERDR_ENV` means container
  or foreign environment: refuse and explain.
- Resolve `PYTC_DIR` from an explicit setting, defaulting to
  `$HOME/workspace/pytc`. Normalize `PYTC_DIR` and project paths to absolute
  paths before use.
- **Never** build command envelopes, marker regexes, or quoting yourself.
  Always call `pytc.sh submit` / `pytc.sh wait` etc. Every submission gets a
  fresh random command ID, including retries.
- No marker means **unknown/incomplete** — never success. Nonzero `rc` stops
  dependent actions; read evidence and report the failure.
- One owned pane per workflow. Record its ID immediately (the helper stores
  it in session state). Never close a pre-existing pane or remove someone
  else's container, even if its name matches the requested project.
- Project directories are mounted into containers: container commands mutate
  host files. Do not describe check/version as read-only.

## Supported actions

`shell`, `run`, `publish`, `devstack`.

### Routing

| Action | Route | Notes |
| --- | --- | --- |
| `shell` | Owned Herdr pane | Full READY/HOST_RETURN lifecycle (below) |
| `run` | Plain Bash (no pane) | `bash -c` one-shot; skips shell startup sync and zsh-only env; use the shell workflow when those are needed |
| `publish` | Pane (host phase) | Needs unique DONE plus per-image publication evidence |
| `devstack` | Pane | Attached Compose; readiness = service health, not log substrings; retain pane if user wants a running stack |

## Preflight

Always run first (it also validates host Herdr context):

```bash
~/.config/opencode/skills/pytc/scripts/pytc.sh preflight <action> \
  --path /absolute/project [--pytc-dir /absolute/pytc]
```

It checks tools individually (`bash`, `jq`, `docker`, `herdr`; `vault` where
required), `run.sh` executability, project `pyproject.toml` name/version, Git
branch, Docker daemon, derived container name validity and collisions
(exact name match, including stopped containers — never adopt or remove),
OpenCode config, opencode port collisions, and per-action files.
`VAULT_TOKEN` is only checked where required and never printed.

The new pane does not inherit the agent's environment. After `pane-new`, run
`pytc.sh env-check <session>` (default tools: `vault docker`, includes
`VAULT_TOKEN` presence) and have the user establish missing credentials in
the owned pane through normal host setup before launching.

## Session lifecycle

```bash
PYTC=~/.config/opencode/skills/pytc/scripts/pytc.sh
SID=$($PYTC session-new --pytc-dir "$PYTC_DIR" --path "$PROJECT")   # state: pane, ids, lifecycle
$PYTC pane-new "$SID" checks                                       # owned, labeled pane in $PYTC_DIR
$PYTC env-check "$SID"
$PYTC shell-launch "$SID"                                          # state: starting-container
$PYTC wait-ready "$SID" [--timeout 300]                            # -> ready | host-return rc=N | unknown
$PYTC submit "$SID" --container -- uv run poe all                  # -> command id
$PYTC wait "$SID" <command-id> --timeout 900                       # -> rc=N | host-return-early | unknown
$PYTC read "$SID" <command-id>                                     # evidence between BEGIN/DONE markers
$PYTC container-exit "$SID"                                        # from container-ready only
$PYTC wait-host "$SID"                                             # HOST_RETURN + host shell readiness
$PYTC submit "$SID" --host -- ./run.sh --action publish --path "$PROJECT"
$PYTC wait "$SID" <command-id> --timeout 1800
$PYTC close "$SID"
```

Rules:

- `wait-ready`: READY means container init reached the first prompt. A
  HOST_RETURN before READY means startup failed — even with rc=0 — report
  and inspect output. A timeout with neither marker is unknown: read the
  pane; if the image predates readiness support (no marker ever appears),
  tell the user to rebuild (`./run.sh --action upgrade`) — a newer host
  script with an old image is not sufficient.
- If shell startup fails and you retry the launch, create a **new session**
  (`session-new` + fresh pane if needed): markers are session-scoped and a
  stale HOST_RETURN line in scrollback would otherwise match immediately.
- One container command at a time, only from `container-ready`, each with
  its unique DONE marker. Monitor for unexpected host return while container
  commands run.
- Never treat `♪ᕕ(ᐛ)ᕗ`, `Started opencode server.`, progress messages, or
  prompt text as readiness proof — the project may override prompts and the
  server start is unchecked and backgrounded.
- Defaults: 5 min shell startup, 10 min checks, 20 min publish/push. Extend
  explicitly when justified. Waits are internally bounded (10 s slices);
  after expiry report pending state and evidence — do not launch dependent
  commands and do not automatically rerun publish on unknown status.
- Time spent awaiting a user's interactive answer is not command execution
  time; resume bounded waits after input is delivered.

## Command completion semantics

The helper wraps every submission as a single line:
BEGIN marker → `if <cmd>; then rc=0; else rc=$?; fi` → DONE marker with the
real exit code (works even with shell `errexit`). It waits with
`--source recent-unwrapped`, parses the matched line for that exact command
ID, and reports:

- `rc=0` — success.
- `rc=N` — failure; stop dependent actions, read evidence, report.
- `unknown reason=timeout|herdr-error|host-shell-not-ready` — never assume
  success. Shell exit, signals, malformed input, pane loss, and terminal
  damage all land here.
- `host-return-early rc=N` — container terminated while a command was in
  flight.

When interpreting output as evidence, use `pytc.sh read <session>
<command-id>` (output strictly between that command's BEGIN/DONE markers).
If the beginning scrolled out of the buffer, do not fill the gap with older
output.

## Interactive actions

Monitor both new prompt output and the active command's DONE marker. Track
which prompt occurrence has been answered — old questions in scrollback must
not be re-answered. Before sending an answer: confirm the expected program
still owns input, ask the user through the question tool, then deliver with
`pytc.sh send <session> "<answer>"` (types text + Enter) or `send-keys` for
special keys; empty/default answers still need an explicit Enter. Repeated or
unrecognized prompts require inspection (`pytc.sh read`), not blind
resubmission. Secret authentication must be entered directly by the user in
the owned pane — never record secrets in questions or logs.

## Cancellation

`pytc.sh interrupt <session>` sends Ctrl+C to the owned pane. Ctrl+C may skip
a shell list's remaining commands, so the DONE marker may never appear:
switch to recovery rules — inspect (`read`, `process-info` via herdr) before
further input, never send `exit` into a still-running command, and explicitly
report any unresolved process/container. Once inspection confirms the shell
is idle at a prompt, `pytc.sh reset <session>` clears the cancelled command
and restores the lifecycle state. Pane closure alone does not prove Docker
removed the container.

## Check / version / publish workflow

1. `preflight shell` (and `preflight publish` when publishing); record
   existing host Git status/diff.
2. Session + owned pane; `env-check`; `shell-launch`; `wait-ready`.
3. `submit --container -- uv run poe all`; require `rc=0`. These checks
   mutate files (formatting/lint fixes); shell startup also synchronizes
   project configuration on the mounted path.
4. For publishing: `submit --container -- version`; require `rc=0`. This is
   a coherence update, not validation: changed content triggers
   `uv version --bump patch` and updates `.version_hash`; unchanged content
   exits 0. A check-only request does not implicitly bump.
5. Review the resulting host diff (metadata/lock/hash plus any pre-existing
   work). Commit **only when explicitly authorized**; before committing
   inspect `git status`, `git diff`, `git log --oneline -10` and stage only
   intended files. If publishing is blocked by a dirty tree, explain and ask
   how to proceed — never auto-commit, stash, or force past checks.
6. If a commit hook or later edit changes content, rerun the affected checks
   and coherence update; `publish` reruns `version` before its dirty-tree
   check, so late changes can cause another bump and a refusal.
7. `container-exit` → `wait-host` → `submit --host -- ./run.sh --action
   publish --path <absolute-project>`; require `rc=0` **and** a
   `Published <image>:<version>.` line for each expected image from this
   invocation (read the command evidence). An old `Published` line or audio
   cue is not evidence. `publish` also refuses on an empty image set.
8. Report checks, version change, authorized commits, publication results,
   and resource state. Preserve evidence before cleanup.

## Cleanup

- Finite workflows: collect evidence → `container-exit` from a known ready
  state → `wait-host` → `close`. Account for still-running containers
  explicitly.
- User wants an open shell or running devstack: **retain** the pane; report
  its ID, project, and state; no finite-workflow cleanup.
- Cancellation/unknown state: recovery rules first (above), then cleanup.

