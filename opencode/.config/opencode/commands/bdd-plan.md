---
description: Create a suite of Gherkin specifications for tests to be used in Behaviour Driven Development of a new requirement
---

@1 is an investigation report, which defines the requirement scope.

Write a comprehensive suite of functional tests covering the whole scope defined by @1. Be exhaustive: derive test specifications from every requirement, decision and behaviour described in that report; leave no part of its scope untested.
Read `Domain Glossary` entries from docs/projectBrief.md (if it exists) so tests specifications vocabulary match the project's domain language.
Use the Gherkin language to give structure to executable specifications; primary keywords to use are:
- Feature
- Background
- Scenario
- Given, When, Then, And, But

example:
```Gherkin
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
# TODO BDD-01 <single line feature description>

<complete Gherkin test specification, Feature, Background and Scenarios>

# TODO BDD-02 <single line feature description>

<complete Gherkin test specification, Feature, Background and Scenarios>
```
