# AGENTS.md - Shared coding guidelines


## **ALWAYS AVOID** doing these actions
- NEVER Install dependencies automatically, ask the user to do it for you
- NEVER do database migrations automatically, ask the user to do it for you
- NEVER format the code
- NEVER order imports

## Quality Check / Test Commands

The "do" shell utility is available to perform a wide range of check and tests on code, you can get a complete list of functions running:

```bash
do list
```

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
