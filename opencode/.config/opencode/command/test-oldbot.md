---
description: "Write a unit test suite for a functional piece of legacy code, detailed in a PRD file"
agent: build
---

- You are tasked with writing unit tests for the python file under ./src
- Another file named like PRD_*.md, is a markdown detailing the logic implemented in the .py file as a DAG

# workflow
1. Look into the PRD "Node descriptions" for the first node detail which is marked as **Tested**: False

   EXAMPLE
   ```
   ### N01: Initialize Environment & API Session

   **Tested**: False
   ```
2. Read the node description, it details the lines of code it refers to, and what they need to accomplish, read also the python file code
3. Open or create a ./tests/test_$1 python pytest file and implement a small suite  of unit tests for the Node under scrutiny
   - You can find a list of data sources and sinks at the start of the PRD, they need to be mocked
   - You can understand the relation with other parts of the code from the description and reading the mermaid graph found in the PRD
   - write no more than 4 tests, based on complexity of the described logic, just the happy path and eventually plausible error paths you infer from the code structure
   - group the suite in a test class named after the node under scrutiny
   EXAMPLE
   ```python
   class TestN01ParseInputXML:
      def test_happy_path():
         ...
   ```      
4. Do not ask for confirmation the user, just write the tests
5. Check the tests are passing with "uv run poe test"
6. If the tests pass mark the Node as "**Tested**: True"
