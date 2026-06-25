---
description: Implement a test choosen from a todo list in a TestPlan file.
agent: build
---

You are tasked with writing a unit test implementation for a specific case, trying to find potential bugs.
**IMPORTANT** : you are not fixing the code, you just write the described test, and take notes of eventual failures.

# Workflow
1. Read the header of the $1 TestPlan file to understand what code is under test and where is used
2. Find the first test description in list marked as "TODO" and read what needs to be tested
3. Look for the code under scrutiny in the project, understand how is used in relation to other code
4. [todo how to find the test path]
5. Write inside the test file a single test implemented as described in the plan
6. Make quality checks on the written code
7. Run the test with "uv run poe t_test [path of the testfile]"
8a. If the test passes mark the TestPlan entry as "DONE"
8b. If the test fails you found a bug! Mark the entry as "NEED_FIX" in the TestPlan, add a comment detailing the fail reason 

## Assumptions
- **NEVER** change the code under test or try to have a test pass changing your initial assumptions !
- **ALWAYS** leave the test entry in the TestPlan file marked either as "DONE" or "NEED_FIX"
- write just a single function test, do not add container classes or other constructs, just a simple test_function:
```python
def test_description(fixtures) -> None:
   ...
```






