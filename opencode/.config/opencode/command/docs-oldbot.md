---
description: "Write a PRD from legacy code, propedeutical to a rewrite with a library implementing ETL and DAG"
agent: build
---

You are tasked with writing an exhaustive PRD documnet for the legacy code contained in function "robotstart" from file $1.
Such PRD will be used by another agent to reimplement the logic, writing code is out of your scope. 

You will likely find code which:
  - read data from excel files / database views
  - transform data
  - call external APIs, either for additional info retrieveal or changes to remote systems state
  - write data to excel files / database tables

**IMPORTANT**
- The framework in which the code will be rewritten in specialized in ETL and DAG implementations: write a specification as near as possible to those conceptual models.
- Threat every passage as being the node in a dependency graph, the description in the PRD must be enriched visually with a mermaid graph.
- Treat configuration in the PRD as being contained in a single typed dictionary.

Output file must follow this structure:
- description of the observed logic
- list of all data sources found
- list of all data sinks found
- mermaid graph for the code logic
- analytic description of every node of the graph, with a reference to lines of the original code, and a placeholder to mark completion of future tests

EXAMPLE :
```PRD_$1.md
Calls an api enpoint to put jobs in queue, ... 

# Data sources
- MPSFlussiIntegrativi: stored procedure
- ExtraInfosMPS.xls: excel file

# Data sinks
- MPSFLussiResults: db table
- /api/v1/update_job_state: api endpoint

# Graph
graph TD
    N01[N01: Download File ExtraInfosMPS.xls] --> N02[N02: Read ExtraInfosMPS.xls rows]
    N02 --> N03[N03: Update Job State to IN_PROGRESS]
    N02 --> N04[N04: Fetch Data Bundle]
      ...

### N01: Download File ExtraInfosMPS.xls

**Tested:** False
**Type:** Download (Remote sftp) 
**Input:** Remote file path
**Output:** Local file path 
**Dependencies:** None
**Lines:** 7-15
**Logic:**
- Download the file using credential from config

### N02: Read ExtraInfosMPS.xls rows

**Tested:** False
**Type:** Extract (Excel Read)
**Input:** Local file path
**Output:** List of Tuples [IdIncarico, IdPersona]
**Dependencies:** N01
**Lines:** 17-25
**Logic:**
- Open the input path as an excel file
- Accumulate read values line by line in a list

### N03: Update Job State to IN_PROGRESS

**Tested:** False
**Type:** Call (/api/v1/update_job_state)
**Input:** List of Tuples [IdIncarico, IdPersona]
**Output:** List of eventual Errors
**Dependencies:** N03
**Lines:** 30-42
**Logic:**
- For each tuple in the list makes a POST with payload {"Incarico": IdIncarico, "Persona": IdPersona}
- If the api returns an error append the error detail to a list 

  ...
```
# Workflow

1. Read the file, understand the implemented logic. DO NOT LOOK AT SURROUNDING CODE, original framework is lost, no other code than the given file will help your understanding
2. Detail all initial data sources and final data sinks you found.
3. Create a detailed graph for the logic, assign a Type to every node, choose types from this list:
  - Download, for retrieval of files from remote shares
  - Query, for deserialization of data from databases
  - Extract, for deserialization of data from local files
  - Validate, for validation of data against a schema
  - Transform, for operations changing the structure of data
  - Insert, for serialization of data into databases
  - Write, for serialization of data into files
  - Upload, for saving of files in remote shares
  - Call, for calls to external APIs
4. Study the graph you created, if two consecutive nodes are of the same Type merge them.
   Keep the complexity of the graph as low as possible WITHOUT LOSING INFORMATION.
5. For each node write a detailed analytic description, annotating the lines where the original code can be found.
  DESCRIPTION MUST BE USABLE BY AN AGENT TASKED WITH WRITING THE NEW IMPLEMENTATION
6. When you are done just write the PRD, without waiting for user approval of your plan.

