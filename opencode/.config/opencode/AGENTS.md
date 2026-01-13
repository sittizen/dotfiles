# AGENTS.md - Shared coding guidelines

## Quality Check / Test Commands

```bash
# Install dependencies
# NEVER Install dependencies automatically, ask the user to do it for you

# Database migrations
# NEVER do database migrations automatically, ask the user to do it for you

# Run local server
# NEVER run locals server automatically

# Run all unit tests
troll test

# Run single unit test file
troll "x_test -p tests/test_internal.py"

# Run specific unit test in a file
troll "x_test -p tests/test_internal.py::test_internal"

# Linting check all project
troll lint

# Linting check single file
troll "x_lint -p src/app.py"

# Type check all project
troll tc_src

# Type check single file
troll "x_typecheck -p src/app.py"

# Security check all project
troll sec

# Security check single file
troll "x_sec -p src/app.py"
```

## Coding Conventions

### Type Hints

- Use Python 3.10+ union syntax: `str | None`, `list[T]`, `dict[K, V]`
- Annotate ALL function signatures (parameters and return types)
- Use `TypedDict` for structured dictionaries

```python
def get_pos(self, cod: str) -> _Posizione:
    return cast(_Posizione, self.posizioni[cod].posizione)
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

