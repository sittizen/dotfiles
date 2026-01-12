# AGENTS.md - Shared coding guidelines

## Code Style

## Build/Test Commands

```bash
# Install dependencies
# NEVER Install dependencies automatically, ask the user to do it for you

# Run all unit tests
troll localhost 9999 test

# Run single unit test file
troll localhost 9999 "x_run_test_fun -p test_internal.py"

# Run specific unit test in a file
troll localhost 9999 "x_run_test_fun -p test_internal.py::test_internal"

# Type check all project
troll localhost 9999 tc_src

# Linting check all project
troll localhost 9999 lint

# Security scan all project
troll localhost 9999 sec

# Database migrations
# NEVER do database migrations automatically, ask the user to do it for you

# Run local server (after setting MODE env var)
# NEVER run locals server automatically

# Stress testing with Locust
# NEVER run stress tests automatically
```

### Type Hints

- Use Python 3.10+ union syntax: `str | None`, `list[T]`, `dict[K, V]`
- Use `Protocol` for interfaces (structural subtyping)
- Use `TypedDict` for structured dictionaries
- Use `cast()` for type assertions
- Annotate ALL function signatures (parameters and return types)
- Use `# type: ignore` sparingly with comments

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
| Private attributes | `_prefix` | `_sl`, `_op`, `_resto`, `_tt` |
| Abstract base classes | `_Prefix` | `_Evento`, `_Posizione`, `_Portafoglio` |

