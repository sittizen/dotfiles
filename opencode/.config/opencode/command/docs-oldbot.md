---
description: "Write a PRD for legacy code, propedeutical to a rewrite with a library implementing ETL and DAG"
agent: build
---

Code you see in $1 is legacy code we need to rewrite, you are tasked with writing an exhaustive PRD file which will be used by another agent to implement the new code.

Logic will likely read data from excel files or database views, transform data, call external api, and write data to excel files / database tables.

**IMPORTANT**
The framework in which the code will be rewritten in specialized in ETL transformation and DAG implementations: write a specification as near as possible to those models.
Threat every passage as being the node in a dependency graph, the description in the PRD must be visually explained with a mermaid graph.

Output file must have this structure:
- name of the inspected file
- description of the observed logic
- list of all data sources found
- list of all data sinks found
- mermaid graph for the code logic
- analytic description of every node of the graph

EXAMPLE :
```PRD.md
# FlussiIntegrativiDataEntry.py

Calls an api enpoint to put jobs in queue, ... 

# Data sources
- "MPSFlussiIntegrativi" stored procedure
- "ExtraInfosMPS.xls" excel file

# Data sinks
- "MPSFLussiResults" db table
- "/api/v1/create_job" api call

# Graph
graph TD
    N01[N01: Parse Input] --> N02[N02: Fetch Assignment Metadata]
    N02 --> N03[N03: Update State to IN_PROGRESS]
    N02 --> N04[N04: Fetch Appraisal Data Bundle]
      ...

### N01: Parse Input

**Type:** Transform
**Input:** Raw input record
**Output:** Typed `InputData` object with `IdIncarico`, `RTE`, ...
**Dependencies:** None
**Logic:**
- Parse the four input fields
- Cast all values to `int`

---

### N02: Fetch Assignment Metadata

**Type:** Extract (Database Read)
**Input:** `InputData` from N01
**Output:** `AssignmentMetadata` containing at minimum `CodTipoIncarico: int`  
**Dependencies:** N01
**Database:** CLC connection
**Query:**
SELECT * FROM ...

**Post-processing:**
- Extract `CodTipoIncarico` as integer
- Derive `indicazione_mail` string:
  - `454, 455, 456` -> `"- Retail"`
- This classification is used in email subject lines throughout the error handling path

  ...
```

When you are done just write the PRD, without waiting for user approval of your plan.

**HINTS** on how to treat some recurring legacy objects you will find:

DO NOT LOOK AT SURROUNDING CODE : original framework is lost, no other code than the $1 file will help you in understanding the logic

"def robotstart" : The code inside this function is the real business logic, ignore the fact that it's contained here 

"BOTMPSDE.proprieta.get" : configurations are retrieved with this call, you can treat configuration in the PRD as being contained in a single typed dictionary.
