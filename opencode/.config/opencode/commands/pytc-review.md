---
description: Review code changes in current branch searching for bugs and security issues.
---

Review source files changes for bugs and security vulnerabilities.

# workflow

This is not an interactive session, follow the steps and exit with reply as instructed.

Study changes introduced by branch $1, limit to changes shown by:

```bash
git diff $1..HEAD
```

then determine if they introduce:

- broken API contracts
- bugs or regressions
- security issues

Do not modify code.

This is not an optimization check, as long as the code is working as expected and secure the check is passed.

If NO issues are found, reply with just one word: `OK`

If ANY issue exists:
    Write `BRANCH_REVIEW.md` in the project root with findings, followed by clear instructions on how to fix.
    Then reply with just one word: `BLOCKING` .

When writing `BRANCH_REVIEW.md`, use this structure:

```markdown
## BLOCKING: {short description}

Files:
- {list of relevant project files}

Problem:
{precise description of why this is a problem}

Suggested Fix:
{actionable steps to fix}
```
