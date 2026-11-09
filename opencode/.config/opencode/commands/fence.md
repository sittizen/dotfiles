---
description: Create a suite of Gherkin tests against a specifications file, to be used in Behaviour Driven Development.
---

Write a comprehensive suite of Gherkin tests covering the functionality specifications exposed in @1.

Be exhaustive: derive tests from every requirement, decision and behaviour described in that document; leave no part of its scope untested.
Read `Domain Glossary` entries from docs/projectBrief.md so tests specifications vocabulary match the project's domain language.


# what a good test is

Good tests verify **behavior through public interfaces**, not implementation details.
Code can change entirely, tests shouldn't; a good test reads like a specification, tells you exactly what capability exists, and survives refactors because it doesn't care about internal structure.

# First: identify test seams

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

Before writing any specification, write down the seams under test and confirm them with me. No test must be written at an unconfirmed seam. Agreeing the seams up front is how testing effort lands on the critical paths and complex logic.

Write the ackowledged seams for the test as the header of a file `docs/current/Fences.md`

# Then: main loop

Derive from specifications one feature at a time:

Use Gherkin language to create a testable definition of the feature, primary keywords to use are:
- Feature
- Background
- Scenario
- Given, When, Then, And, But

example:
```
Feature: Multiple site support
  Only blog owners can post to a blog, except administrators,
  who can post to all blogs.

  Background:
    Given a global administrator named "Greg"
    And a blog named "Greg's anti-tax rants"
    And a customer named "Bill"
    And a blog named "Expensive Therapy" owned by "Bill"

  Scenario: Bill posts to his own blog
    Given I am logged in as Bill
    When I try to post to "Expensive Therapy"
    Then I should see "Your article was published."

  Scenario: Bill tries to post to somebody else's blog, and fails
    Given I am logged in as Bill
    When I try to post to "Greg's anti-tax rants"
    Then I should see "That's not your blog!"

  Scenario: Greg posts to a client's blog
    Given I am logged in as Greg
    When I try to post to "Expensive Therapy"
    Then I should see "Your article was published."
```


Before writing down each feature test, dispatch a subagent to double check it against the whole specifications file, looking for inconsistencies, if any are found reshape the test before writing.
Specifications and tests are the two rails leading implementation to success; they must both be internally consistent and lead in the same direction.

## write down the feature test

If docs/current/Fences.md already exists, append the new Gherkin to it, continuing the TST-NN numbering from the last existing entry. Otherwise create the file.

```markdown
# [] TST-01 <single line feature description>

<complete Gherkin test specification, Feature, Background and Scenarios>
```

Go on until the entire scope of the specification file is covered by Gherkin feature tests.
