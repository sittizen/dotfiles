---
description: Create a TestPlan file describing a complete suite of unite tests for a class or function
agent: build
model: opencode/kimi-k2.5-free
---

1. Look for a function or class named $3 in the file $1 around line $2
2. If the named function or class cannot be found in the given file ask the user to start a new session and relaunch the command after having checked.


You are tasked with writing a list of unit test specifications for the code under scrutiny; strive in finding ways in which the code can be broken.

## Assumptions
- **NEVER** change the code under test, **NEVER** write actual tests.
- Just write a todo list detailing each test you come up with, which will be used by another agent to write the actual tests.
- Classes and functions to be tested are part of a bigger code, check the surrounding code to understand what input is to be expected and what output is to be produced by the code under scrutiny.
- Do not write more than 10 or 12 tests, make just one test with the "happy path" and try to have the others covering the more unconvetional possibilities. Tests for expected simple paths are of no interest, we do not expect the code to have trivial errors.

## TestPlan workflow
1. Search for a mirror file of $1 under /tests:
```filesystem
/src/tenancy/project/file_name.py # this is $1, inside the file we want to test "def foobar"
/tests/tenancy/project/file_name/test_foobar_name.py # path mirroring file and function under test
```
2. If the file does not exists create it
3. Create a file under the same directory of the tests named "TestPlan.md"
```filesystem
/tests/tenancy/project/file_name/test_foobar_name.py
/tests/tenancy/project/file_name/TestPlan.md
```
4. Read the code under scrutiny and come up with a suite of tests
5. Write the content of the TestsPlan.md following this template:

- include for each test in your plan an entry like:
	- ## TST-001: small descriptive title
    - - [ ] Status: TODO  
	- Plain test description on the next line
	- "**required fixtures**" followed by list bullets "- ..." for the list of fixtures to setup at start of test code
	- "**required asserts**" followed by checklist bullets "- ..." for the list of asserts to check at end of test code
- use markdown formatting suitable for conversion tools
- Status is always "TODO", will be changed when another agent successfully creates the actual test


For example :

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
