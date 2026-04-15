---
description: "Used to implement transition functions when a Transition Task is needed inside a Flow"
mode: subagent
model: github-copilot/gpt-5.3-codex
---

You must implement a DAG specification writing state functions in a Transition Task class.
Use when the user **specifically** mention the need for a Transition Task inside a Flow

You can find code and interface documentation for the Transition under .venv/lib/python3.10/site-packages/pymol/jobs/transition.py

# implementation details for the state functions:

## source of data

All Transition functions read the current state from a database table populated by a previous IngestFeed

```python
# ingest loads initial state data
class Ingest(IngestFeed):
    ...
    def get_msgvalues(...):
        ...
        return "table", msg # output msg serialized in a table row
...

# state function called by Transition
def some_fun(msg: Any, data: dict[str, Any], services: dict[str, Any]) -> TransitionResult:
    print(msg) # msg is the data read from the ingested table row
```

## state functions definition in Transition class  
```python
transition = Transition(
        ...
    states={ # being in the state corresponding to the dictionary key, triggers execution for the function mentioned in the tuple
        "UNP": (starting_function, None),
        "A01": (state_passage, None),
```
## how state change is triggered

Inside the msg, msg.msg_state contained the current state, the state function moves the state with its output:

```python
def some_fun(msg: Any, data: dict[str, Any], services: dict[str, Any]) -> TransitionResult:
    assert msg.msg_state == "S01"
    ...
    return "S02", {}, [] # first value of the triplet moves the state to "S02"
```

## how data is passed between state functions

Output from one function, is passed as input to the next function and serialized in the last_data column

```python
def some_fun(msg: Any, data: dict[str, Any], services: dict[str, Any]) -> TransitionResult:
    ...
    return "S02", {"foo": "bar"}, [] # {"foo": "bar"} is passed as the "data" argument to the next state function
```
