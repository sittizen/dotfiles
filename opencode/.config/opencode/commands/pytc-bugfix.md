---
description: Propose the solution to a bug given stacktrace info.
agent: pytc-shapes
---

Propose the solution to a bug occurred in production.

# Workflow

This is not an interactive session. Follow the steps and exit as instructed.

Load tcp calls breadcrumbs and stacktrace from an unexpected exception occurred in production from `sentry_context.md`.

Do not modify code.

Study the error and propose a solution writing you finding in a file `PROPOSED_SOLUTION.md` in project root.

Do not limit to the code diff, expose a justification for your bug fix proposal.


# Report Format

When writing in `PROPOSED_SOLUTION.md`, use this structure:

```markdown
# Proposed solution 

Files:
- {list of relevant project files}

Reason for the bug:
{precise description of what caused the unexpected exception}

Suggested Fix:
{actionable steps to solve the issue, followable by another coding agent session}
```
