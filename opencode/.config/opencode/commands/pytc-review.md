---
description: Review code changes in current branch searching for bugs, security issues, and code quality problems
---

Review source files changes for bugs, security vulnerabilities, and code quality problems.

# workflow

This is not an interactive session, follow the steps and exit with reply as instructed.

Study changes introduced by branch $1, limit to changes shown by:

```bash
git diff $1..HEAD
```

then determine if they introduce:

- bugs or regressions
- incorrect logic
- unsafe behavior
- broken API contracts
- security issues

Do not modify code.

If NO issues are found:
    reply with just one word: `OK`

If ANY issue exists:
    Write `BRANCH_REVIEW.md` in the project root with blocking findings severity-classified, followed by clear instructions on how to fix. Then reply with just one word: `BLOCKING` .

When writing `BRANCH_REVIEW.md`, use this structure:

# Branch Review

```markdown
## BLOCKING: {short description}

{severity-classification}

Files:
- {list of relevant project files}

Problem:
{precise description of why this is a problem}

Suggested Fix:
{actionable steps to fix}
```
