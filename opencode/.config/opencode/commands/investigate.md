---
description: Interview the user relentlessly to sharpen a plan or design till a comprehensive specification document can be composed.
---

Interview me relentlessly about every aspect of the idea descriped in $1 until we reach a shared understanding.
Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**.
The **frontier** is every decision whose prerequisites are already settled: the questions you can ask **now** without guessing at answers you haven't heard yet.
Ask the whole frontier in one round: number each question and give your recommended answer, then wait for my answers before next round.


# main loop

While working the rounds format each round like so:
```
**Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

<your recommended answer>
<option to leave the point open>

---

**Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

<your recommended answer>
<option to leave the point open>
```

Each round my answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them.
Recompute the frontier and ask the next round.

Finding **facts** is your job, never the user's: when a frontier question needs a fact from the environment (filesystem, tools, etc.),
dispatch a sub-agent to find it; don't ask me for anything you could look up yourself.
The **decisions** are mine; put each fact to me and wait.

I can get confused during a long session; after each round of answers is submitted, before looping to next round of questions,
dispatch a sub-agent to check current decision tree for inconsistencies, if any are found ask me for clarifications and reshape
the tree accordingly before continuing.

# closing condition

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.
Do not act on it until I confirm we have reached a shared understanding.
If the I marked points as open, consider those visited: accepted decision for open points is to come back later with further details.

# final artifacts 

Once an understanding is reached, detail reached understandings in a specifition document "docs/current/Specifications.md".
Structure the file in this way:
```markdown
---
interviewer: [language model used by the agent]
interviewee: `whoami` output
date: `date` output
---

# Summary
<short, one paragraph description of the interview scope>

<detailed list of every rule, constraint, convention etc... defined through the session>

**S1** - **<descriptive title>**
<detailed exposure>
```

If there are open points, write a second report "docs/current/OpenPoints.md" quickly recapping the reached consensus, then detailing points still open.
Structure the file in this way:
```markdown
---
interviewer: [language model used by the agent]
interviewee: `whoami` output
date: `date` output
---

# Summary
<short, one paragraph description of the reached consensus detailed in Investigation.md>


<detail of every point left open>

**Q1** - **<question title>**: <question body>
```
