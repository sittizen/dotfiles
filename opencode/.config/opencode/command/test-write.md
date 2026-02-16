---
description: Implement a unit test choosen from a todo list in a TestPlan file.
agent: build
model: opencode/kimi-k2.5-free
---

You are tasked with writing a unit test implementations for a specific case, trying to find potential bugs.
You are not fixing the code, you just write the described test and take notes of eventual failures.

# Workflow
1. Read the header of the $1 TestPlan file to understand what code is under test
2. Find the first test description in list marked as "TODO" and read what needs to be tested
3. Look for the code under scrutiny in the project, understand how is used in relation to other code and the needed testing
3. Open ( create if it does not exists ) a python unit test file under the same directory of the TestPlan:
```filesystem
tests/foo/bar/TestPlan_function.md # existing TestPlan
tests/foo/bar/test_function.py # file to create or update with new test
```
4. Write inside the test file a single unit test implementing your logic
5. Make quality checks on the written code 
6. Run the test with "gm t_test" command
7a. If the test passes mark the TestPlan entry as "DONE"
7b. If the test fails you found a bug, mark the test as "NEED_FIX" in the TestPlan file, add a comment detailing the fail reason 


## Assumptions
- **NEVER** change the code under test or try to have a test pass changing initial assumptions !
- **ALWAYS** leave the test entry in the TestPlan file marked either as "DONE" or "NEED_FIX"
- write just a single function test, do not add container classes or other constructs, just a simple test_function:
```python
def test_description(fixtures) -> None:
   ...
```






