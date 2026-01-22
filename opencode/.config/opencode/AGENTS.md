# AGENTS.md - Shared coding guidelines

## Available Coding Tools: lint, typing, test, security

**ALWAYS USE** the "doit" shell utility as a first choice.
The "doit" shell utility is available to perform linting, testing and security checks on code. You can get a list of commands with: 

```bash
doit list lint # format and lint
doit list test # unit tests
doit list sec  # security checks
```

**ALWAYS USE** context7 MCP when I need library/API documentation and code generation without me having to explicitly ask.

**ALWAYS AVOID** doing these actions.
- NEVER Install dependencies automatically, ask me to do it for you
- NEVER do database migrations automatically, ask me to do it for you
- NEVER format the code or order imports


## Coding Conventions

### Type Hints

- Use Python 3.10+ syntax: `str | None`, `list[T]`, `dict[K, V]`
- Annotate ALL function signatures (parameters and return types)
- Use `TypedDict` for structured dictionaries

```python
def fun(self, cod: str) -> bool | None:
    ...
    return True 
```
### Naming Conventions

| Type | Convention | Examples |
|------|------------|----------|
| Classes | PascalCase | `Portafoglio`, `StrategyDelta`, `SetupLine` |
| Functions/methods | snake_case | `get_pos`, `eventually_add_tranche` |
| Variables | snake_case | `data_valuta`, `valore_report` |
| Constants | UPPER_CASE | `TOLERANCE`, `SEDE`, `DEPLOY_ENV` |
| Private attributes | _prefix_snake | `_sl`, `_op`, `_resto`, `_tt` |
| Abstract base classes | _Prefix_Pascal | `_Evento`, `_Posizione`, `_Portafoglio` |

## Configuration Files

| File | Purpose |
|------|---------|
| `pyproject.toml` | Project config, dependencies, tools settings |

## Plan Submission

When you have completed your plan, you MUST call the `submit_plan` tool to submit it for user review.
The user will be able to:
- Review your plan visually in a dedicated UI
- Annotate specific sections with feedback
- Approve the plan to proceed with implementation
- Request changes with detailed feedback

If your plan is rejected, you will receive the user's annotated feedback. Revise your plan
based on their feedback and call `submit_plan` again.

Do NOT proceed with implementation until your plan is approved.
