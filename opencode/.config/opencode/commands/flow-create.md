---
description: "Create a new Flow from scratch"
agent: flow
---

Create a new Flow which implements the user description.

## Logical model
- Description provided by the user can always be modeled into a Direct Acyclic Graph (DAG)
- Flows are code representation of a DAG
- Tasks performs various retrieval, transformations and processing actions on given code
- Connecting Tasks outputs to Tasks inputs, the DAG graph is implemented as described by user specification

## Planning workflow
1. Search for Task classes fit for the user requirement from the list in .venv/lib/python3.10/site-packages/pymol/jobs/__init__.py
2. Create a DAG implementing the required logic, with Task as nodes, expose it to the user with a mermaid diagram
3. Read interface documentation for each Task, found in the files defined by package imports in .venv/lib/python3.10/site-packages/pymol/jobs/__init__.py
4. If in doubt while choosing the right Task, ask the user for confirmation proposing a list of candidate Tasks 
5. Implement the DAG with the chosen / approved Task classes

**Always** follow this model / pattern when writing Flows:
```python
"""Flow description.

Referente: [Owner Name]
"""

from pymol.jobs import Flow, ReadTask, WriteTask
from prefect import case

FLOW_NAME = "descriptive flow name"

with Flow(FLOW_NAME) as flow:
    read = ReadTask()
    data = read()

    with case(data["meta"]["hasErrors"], False):
        write = WriteTask
        res = write(data)
```

**IMPORTANT**
- **Document every flow** with a docstring at the top of the file
- **Use meaningful task names** via the `name` parameter for UI visibility
- **Handle error data cases** always check if `meta["hasErrors"]` in TaskData outputs
- **Chain tasks properly** by passing TaskData outputs as inputs to child nodes in DAG
- **Template rendering is a DAG node** use the JinjaTemplate Task for text templates rendering
