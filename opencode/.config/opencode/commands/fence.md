---
description: Create a suite of Gherkin specifications for tests to be used in Behaviour Driven Development.
---

Write a comprehensive suite of functional tests **specifications** (not code) covering the functionality exposed in @1.
Be exhaustive: derive test specifications from every requirement, decision and behaviour described in that report; leave no part of its scope untested.
Read `Domain Glossary` entries from docs/projectBrief.md so tests specifications vocabulary match the project's domain language.

# what a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification, tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

# Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any specification, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Use the Gherkin language to give structure to executable specifications; primary keywords to use are:
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
    And a customer named "Dr. Bill"
    And a blog named "Expensive Therapy" owned by "Dr. Bill"

  Scenario: Dr. Bill posts to his own blog
    Given I am logged in as Dr. Bill
    When I try to post to "Expensive Therapy"
    Then I should see "Your article was published."

  Scenario: Dr. Bill tries to post to somebody else's blog, and fails
    Given I am logged in as Dr. Bill
    When I try to post to "Greg's anti-tax rants"
    Then I should see "Hey! That's not your blog!"

  Scenario: Greg posts to a client's blog
    Given I am logged in as Greg
    When I try to post to "Expensive Therapy"
    Then I should see "Your article was published."
```


If docs/current/BDD-Tests.md already exists, append the new specifications to it, continuing the BDD-NN numbering from the last existing entry. Otherwise create the file.

Write the suite specification in a file docs/current/BDD-Tests.md :
```markdown
# [] BDD-01 <single line feature description>

<complete Gherkin test specification, Feature, Background and Scenarios>

# [] BDD-02 <single line feature description>

<complete Gherkin test specification, Feature, Background and Scenarios>
```
