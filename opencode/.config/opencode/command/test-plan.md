---
description: Create a TestPlan file describing a complete suite of unit tests for a class or function
agent: build
model: opencode/kimi-k2.5-free
---

1. Look for a function or class named $3 in the file $1 around line $2
2. If the named function or class cannot be found in the given file, ask the user to start a new session and relaunch the command after having checked.

You are tasked with writing a list of unit test specifications for the code under scrutiny; strive in finding ways in which the code can be broken.

## Assumptions
- **NEVER** change the code under test, **NEVER** write actual tests.
- Class or function under scrutiny is part of a whole, check the surrounding code to understand where it is called, what input is to be expected, and what output is to be produced.
- Do not write more than 12 tests, make just one test with the "happy path" and try to have the others covering the more unconvetional paths and inputs.
- **have no interest in expected inputs and simple paths**, it's ok to suppose the code does not contain trivial bugs.

## TestPlan workflow
1. Read the code under scrutiny and come up with a suite of tests
2. use bash to invoke "gm x_test_plan_path $1 $3", it returns the TestPlan markdown file where you will write the plan 
```bash
gm src/tenancy/project/file_name.py class MyClass 
# expected output:
tests/tenancy/project/file_name/TestPlan_my_class.md
```
3. Write the list of tests into the TestsPlan file following this template:
- include for each test in your plan an entry like:
    - ## TST-001: small descriptive title
    - - [ ] Status: TODO  
    - Plain test description on the next line
    - "**required fixtures**" followed by list bullets "- ..." for the list of fixtures to setup at start of test code
    - "**required asserts**" followed by checklist bullets "- ..." for the list of asserts to check at end of test code

NOTE: Status is always "TODO", will be changed when another agent successfully creates the actual test,
for example :

```TestsPlan.md
## TST-001: happy path
- [ ] Status: TODO
Test the expected path, when the input data is complete and valid.
**required fixtures**
-  data complete of valid name, surname, age
-  mock for the underlying database
**required asserts**
-  no validation exception has been thrown
-  mocked db code has been called for an insert operation with given data


## TST-002: incomplete data
- [ ] Status: TODO
Test a validation error is thrown if input data is valid but lacking an entry
**required fixtures**
- data with only valid name and surname, no age
- mock for the underlying database
**required asserts**
- code throws a ValueError before calling the database mock

```
