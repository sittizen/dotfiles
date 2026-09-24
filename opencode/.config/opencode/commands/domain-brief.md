---
description: Interview the user relentlessly about a project's domain model until reaching shared understanding, resolving each branch of the decision tree.
---

Interview me relentlessly about every aspect of the domain model description contained in $1 until we reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**.
The **frontier** is every decision whose prerequisites are already settled: the questions you can ask **now** without guessing at answers you haven't heard yet.
Ask the whole frontier in one round: number each question and give your recommended answer, then wait for the user's answers before next round.
Technical implementation details are out of scope for this interview.

# workflow
1. While working the rounds format each round like so:
```
**Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

<your recommended answer>
<option to leave the point open>

---

**Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

<your recommended answer>
<option to leave the point open>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them.
Recompute the frontier and ask the next round.

Finding **facts** is your job, never the user's: when a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. The **decisions** are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.
Consider visited points marked by the user as open, the accepted decision is to come back later with further details.
Do not act on it until the user confirms you have reached a shared understanding.

2. Once an understanding is reached, write a detailed report about the conversation, leaving out eventual open points. 
Structure the file in this way:

DomainModelBrief.md
```markdown
---
interviewer: [language model used by the agent] 
interviewee: `whoami` output
date: `date` output 
---

# Summary
<short, one paragraph description of the interview scope>

<detail of every Q and A>

**Q1** - **<question title>**: <question body>
<question answer>
```

3. If there are open points, write a second report quickly recapping the reached consensus about domain, then detailing the still open points.
Structure the file in this way:

DomainOpenPoints.md
```markdown
---
interviewer: [language model used by the agent] 
interviewee: `whoami` output
date: `date` output 
---

# Summary
<short, one paragraph description of the reached consensus detaile in DomainModelBrief>


<detail of every point left open>

**Q1** - **<question title>**: <question body>
```
