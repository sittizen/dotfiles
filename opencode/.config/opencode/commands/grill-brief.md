---
description: Interview the user relentlessly about a business project brief until reaching shared understanding, resolving each branch of the decision tree.
---

Interview me relentlessly about every aspect of the business description contained in $1 until we reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask **now** without guessing at answers you haven't heard yet. Ask the whole frontier in one roung: number each question and give your recommended answer. Then wait for the user's answers before next round. Technical implementation details are out of scope for this interview.

# workflow
1. While working the rounds format each round like so: 
```
**Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

<your recommended answer>
<open point in need of detail from the client>

---

**Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

<your recommended answer>
<open point in need of detail from the client>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited (consider points in need of detail visited, the accepted decision is to keep an open point), nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

2. Once an understanding is reached, write a detailed report about the conversation in a "grillBrief.md" file structured in this way:

```markdown
# Grill Interview Results - Project Brief

**Interviewer**: [language model used by the agent] 
**Interviewee**: `whoami` output
**Date**: `date` output 

---

## Summary
<short, one paragraph description of the interview scope>

[ detail of every Q and A ]

[ detail of open points ]
```
