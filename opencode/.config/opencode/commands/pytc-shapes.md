---
description: Check project code against PyTC shape contracts
agent: pytc-shapes
---

Check mounted project code against a single PyTC shape contract.

# Workflow

This is not an interactive session. Follow the steps and exit with reply as instructed.

Load the shape contract from `/etc/templates/shapes/$1`.

- read `shape.md`
- read all referenced canonical files under `files/`
- verify every `required_files` path exists in the project
- verify required files satisfy required symbols and contract text
- detect wrong locations, wrong names, wrong imports, and forbidden variations

Be strict. A semantically equivalent implementation in a different path or with different public object names is a divergence unless explicitly allowed by the contract.

Do not modify code.

If NO issues are found, reply with just one word: `OK`

If ANY issue exists:
    Write your findings to `SHAPES_REVIEW_$1.md` inside project root, suggesting fixes.
    Then reply with just one word: `BLOCKING`.

# Report Format

When writing in `SHAPES_REVIEW_$1.md`, use this structure:

```markdown
## BLOCKING

Contract: `/etc/templates/shapes/$1/shape.md`

Files:
- {list of relevant project files}

Divergence:
{precise description of what diverges from the contract}

Expected Shape:
{what the contract requires}

Suggested Fix:
{actionable steps to conform}
```
