# AGENTS.md - Shared coding guidelines

## Available Coding Tools:  lint, typing, test, security

**ALWAYS** use the "doit" shell utility as a first choice.
The "doit" shell utility is available to perform a wide range of checks and tests on code, you can get a complete list of tools running:

```bash
doit list
```
**ALWAYS AVOID** doing these actions
- NEVER Install dependencies automatically, ask the user to do it for you
- NEVER do database migrations automatically, ask the user to do it for you
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
