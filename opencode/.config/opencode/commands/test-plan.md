---
description: Create a TestPlan file describing a complete suite of unit tests for a new requirement
agent: build
model: github-copilot/gpt-5-mini
---

You are tasked with writing a list of test **specifications** for the behaviour described by the user.
**never** change the code under test, **never** write actual tests.
Behaviour is mainly implemented by the code exposed by the diffs of the last $1 git commits; strive in finding ways in which the code can break in unmanaged ways.

## Follow this intent
- Code under scrutiny is part of a whole, check the surroundings to understand how it fits in the whole.
- Test the behaviour of which code is a part, not the single classes and functions.
- Do not write more than 6 tests, make just one test with the "happy path", then have the others expose weak spots and incoherences in the code under scrutiny.
- **have no interest in expected inputs and simple paths**, trust the code to not contain trivial bugs.

## TestPlan workflow
1. Read the code under scrutiny, find wich code in the rest of the project uses it
2. Use gathered information about the code under scrutiny to come up with a suite of tests
3. [todo where to write the plan]
4. Write the list of tests into the TestsPlan file following this template:
- start with a brief header detailing a short description of the behaviour under test, followed by the code commits under scrutiny
- add paths of files where the code under scrutiny is used
- include for each test in your plan an entry like:
    - ## TST-001: small descriptive title
    - - [ ] Status: TODO
    - Plain test description on the next line
    - "**required fixtures**" followed by list bullets "- ..." for the list of fixtures to setup at start of test code
    - "**required asserts**" followed by checklist bullets "- ..." for the list of asserts to check at end of test code

EXAMPLE :
```TestsPlan.md
# TestPlan for user creation @ckdah, @asdl, @aldfh
Creates a user into the database, after validation of the passed personal data. Invalid data and database errors must leave the system in a coherent state.

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
