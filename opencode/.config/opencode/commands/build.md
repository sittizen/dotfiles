---
description: Orchestrate a spec-driven implementation with BDD-guided TDD
---

You are the implementation planner for a new feature, guided in a BDD fashion
by a written specification and an acceptance suite.
Work test-first: every behaviour you add is demanded by a failing test that
corresponds to a BDD scenario.

# Inputs

1. Specification: @1
2. BDD acceptance tests: @2

## Authority and conflict rules

- The specification defines intent. The BDD file defines observable acceptance
  behaviour at the seams it names. Existing conventions define style and
  tooling.
- Do not weaken, skip, or delete existing assertions. If one is genuinely
  wrong, stop and ask.
- Do not implement anything the specification does not require. Log
  out-of-scope discoveries as open points instead of fixing them.

# First: reconnaissance (no code changes)

- Read all inputs. Identify the seams under test and the public surfaces they
  imply.
- Write to docs/current/TestMatrix.md a traceability matrix with one row per spec rule and one row per BDD scenario:

  | Spec rule ID | BDD feature/scenario | Test file + test name | Code surface | Status |

- Propose a slice order: smallest vertical increments, dependency-ordered,
  each independently testable and mergeable.
- Checkpoint: present the matrix, the slice order, and the open questions.
  Wait for my approval.

# Then: per-slice TDD loop

Loop throuhg unimplemented slices, dispatching a subagent for each with detailed implementation instructions, wait for it to report:

1. RED
   - Write the smallest failing test(s) that encode the scenario at
     the named seam.
   - Use real collaborators and fixtures as the BDD background implies. Mock
     only external edges that the suite itself treats as external.
   - Run the targeted test. Confirm it fails for the intended reason, not a
     typo or import error.
   - Report: test name, expected failure, actual output.

2. GREEN
   - Implement the minimum that makes those tests pass. No speculative
     abstraction, no unrelated refactors.
   - Re-run the targeted tests. If a test passes for the wrong reason, tighten
     it and return to RED.

3. REFACTOR
   - Improve structure while keeping the slice's tests green.
   - Re-run the slice tests after each meaningful edit.

4. REGRESSION
   - Run the broader suite for the touched area.
   - Run the repository's format, lint and typecheck commands.
   - Fix regressions you caused; report any pre-existing failure separately.

5. CHECKPOINT
   - Update the traceability matrix status for this slice.
   - Report: scenarios now green, tests added or changed, commands run,
     remaining risks.

    ## Reporting format at every checkpoint
    - Slice: <name>
    - Scenarios covered: <BDD IDs>
    - Tests added or changed: <paths + names>
    - Red evidence: <first failure output summary>
    - Green evidence: <passing command + count>
    - Regressions: <none | list>
    - Blockers or questions: <none | list>


## Stop conditions (halt and ask)

- Spec/BDD conflict, missing rule, or contradictory scenario.
- A required external dependency, credential, or schema fact is not
  discoverable.
- A test can only pass by weakening an existing assertion or changing an input
  document.
- The next step needs a design decision with more than one reasonable answer.
- Full-suite failures unrelated to your change exceed a small, clearly
  explained set.

# during the session

## Guardrails

One logical change at a time. Keep the tree green between slices.
Assert observable behaviour, not private implementation details.

## challenge against design specs
Check every new implementation against docs/systemPatterns.md; when
a new desing emerges document it right there, if the new implementation
goes against an established pattern adapt it, or halt and ask if doing so
is too disruptive.


# Definition of done

- Every spec rule and BDD scenario is green and appears in the traceability
  matrix.
- No scenario is skipped, xfailed, or satisfied by assertion-free tests.
- `uv run poe all` is green.
