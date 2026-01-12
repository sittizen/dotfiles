# AGENTS.md - General Codebase Guide

- Complete what is asked: Execute the exact task specified without adding unrelated or out of scope content.

## Build/Test Commands
- **Install deps**: `uv sync`
- **Run tests**: `pytest` | Single test: `pytest tests/test_file.py::test_name -v`
- **Type check**: `mypy src/`
- **Lint**: `flake8 src/`
- **Security scan**: `bandit -r src/`

## Code Style
- **Python**: 3.10+ with type hints (`list[T]`, `str | None` union syntax)
- **Imports**: stdlib -> third-party -> local (`from ecolight.core.config import ...`)
- **Naming**: PascalCase classes, snake_case functions/vars, UPPER_CASE constants, `_prefix` for private
- **Domain terms**: Italian (Produttore, Versamento, Matricola)
- **Types**: Use `TypedDict` for dicts, `Generic` for parameterized types, annotate all function signatures

## Frameworks
- FastAPI + Pydantic 2.x + SQLAlchemy 2.x + Alembic migrations
- Internal: pymol-auth, pymol-logger
