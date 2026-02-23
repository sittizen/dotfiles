---
description: Create a TestPlan file describing a complete suite of unit tests for a class or function
agent: build
model: github-copilot/gpt-5-mini
---

Look for a function or class named $2 in the file $1
You are tasked with writing a list of unit test specifications for the code under scrutiny; strive in finding ways in which the code can be broken.

## Assumptions
- **NEVER** change the code under test, **NEVER** write actual tests.
- Class or function under scrutiny is part of a whole, check the surrounding code to understand where it is called, what input is to be expected, and what output is to be produced.
- Do not write more than 7 tests, make just one test with the "happy path" and have the others covering the more unexpected paths and inputs.
- **have no interest in expected inputs and simple paths**, it's ok to suppose the code does not contain trivial bugs.

## TestPlan workflow
1. Read the code under scrutiny, find wich code in the rest of the project uses it.
2. Use gathered information about the code under scrutiny to come up with a suite of tests
3. use bash to invoke "gm x_test_plan_path $1 $2", it returns the TestPlan markdown file, where you will write the plan
```bash
gm x_test_plan_path src/project/file_name.py class MyClass 
# expected output, path of the plan file:
tests/project/file_name/TestPlan_my_class.md
```
3. Write the list of tests into the TestsPlan file following this template:
- start with an header detailing the code object $2 from file $1 under scrutiny, followed by a short description of the understood function and what will be stressed:
    - # TestPlan for "$2" @ "$1"
    - Description of $2 function inside the code and aim of the tests... 

- add paths of files where the code object under scrutiny is used:
    - ## used in:
    - list of paths where the code object is used

- include for each test in your plan an entry like:
    - ## TST-001: small descriptive title
    - - [ ] Status: TODO  
    - Plain test description on the next line
    - "**required fixtures**" followed by list bullets "- ..." for the list of fixtures to setup at start of test code
    - "**required asserts**" followed by checklist bullets "- ..." for the list of asserts to check at end of test code

EXAMPLE :
```TestsPlan.md
# TestPlan for "def create_user" @ src/auth/users.py
Creates a user into the database, after validation of the passed personal data. Test invalid data and database errors leave the system in a coherent state.

## used in:
    - src/api/auth.py
    - src/api/batches.py

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
