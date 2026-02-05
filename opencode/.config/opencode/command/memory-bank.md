---
description: "Generate or update Memory Bank files."
agent: build
model: github-copilot/claude-opus-4.5
---

# Opencode's Memory Bank

Opencode memory resets completely between sessions, it is mandatory to maintain perfect documentation.

## Storage Location

**CRITICAL**: All Memory Bank files MUST be stored in `docs/memory-bank/`
**MANDATORY**: Before ANY memory bank operation, I MUST ensure the directory exists:

- If `docs/memory-bank/` does NOT exist, CREATE it immediately
This directory structure is non-negotiable:

```
docs/
└── memory-bank/
    ├── projectBrief.md
    ├── systemPatterns.md
    └── techContext.md
```

## Memory Bank Structure
The Memory Bank consists of three core files, all in Markdown format.
When an inline graph is needed, use the mermaid standard.

### Core Files (Required)

1. `projectBrief.md` is:
   - Foundation document
   - Defines core requirements and goals
   - Problems the project solves
   - User experience goals
   - Source of truth for project scope
   `projectBrief.md` is not:
   - Technical document, detail only the business logic and requisites
   - Contains info about the why, not the how

4. `systemPatterns.md` is:
   - System architecture
   - Key technical decisions
   - Design patterns in use
   - Component relationships
   - Critical implementation paths
   `systemPatterns.md` is not:
   - Business document, detail only the code architecture choices
   - Contains info about the how, not the why
   - Does not explain the tooling, only the technical choices 

5. `techContext.md` is:
   - Technologies used
   - Development setup
   - Technical constraints
   - Dependencies
   - Tool available and usage patterns
   `techContext.md` is not:
   - Architecture explanation

 Files build upon each other in a clear hierarchy:

```mermaid
flowchart LR
   PB[projectbrief.md] --> SP[systemPatterns.md]
   SP --> TC[techContext.md]
```

## Documentation Updates

```mermaid
flowchart LR

  P1[Review ALL Files]
  P2[Document Current State]
  P3[Clarify Next Steps]
  P4[Document Insights & Patterns]

  P1 --> P2 --> P3 --> P4

```

When triggered by **memory-bank**, I MUST review every memory bank file, even if some don't require updates.

REMEMBER: After every memory reset, I begin completely fresh. The Memory Bank is my only link to previous work. It must be maintained with precision and clarity, as my effectiveness depends entirely on its accuracy.
