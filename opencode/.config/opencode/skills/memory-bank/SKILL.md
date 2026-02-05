---
name: memory-bank
description: "Generate or update Memory Bank files."
---

# Opencode's Memory Bank

Opencode memory resets completely between sessions, it is mandatory to maintain perfect documentation.

## Storage Location

**CRITICAL**: All Memory Bank files MUST be stored in `docs/memory-bank/`
**MANDATORY**: Before ANY memory bank operation, I MUST ensure the directory exists:

- If `docs/memory-bank/` does NOT exist, CREATE it immediately
- This check happens at the start of EVERY session, before reading or writing any files

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
PB[projectbrief.md] --> SP[systemPatterns.md]
SP --> TC[techContext.md]
```

## Documentation Updates

Memory Bank updates occur when:

1. Discovering new project patterns
2. After implementing significant changes
3. When user requests with **update memory bank** (MUST review ALL files)
4. When context needs clarification

```mermaid
Start[Update Process]

    subgraph Process
        P1[Review ALL Files]
        P2[Document Current State]
        P3[Clarify Next Steps]
        P4[Document Insights & Patterns]

        P1 --> P2 --> P3 --> P4
    end

    Start --> Process
```

Note: When triggered by **memory-bank**, I MUST review every memory bank file, even if some don't require updates.

REMEMBER: After every memory reset, I begin completely fresh. The Memory Bank is my only link to previous work. It must be maintained with precision and clarity, as my effectiveness depends entirely on its accuracy.
