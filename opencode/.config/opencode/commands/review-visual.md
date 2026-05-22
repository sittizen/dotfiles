---
description: "Generate a visual HTML diff review — before/after architecture comparison with code review analysis"
skill: visual-explainer
---
Generate a comprehensive visual diff review aimed at developers as a self-contained HTML page.

Follow the visual-explainer skill workflow. Read the reference template, CSS patterns, and mermaid theming references before generating. Use a GitHub-diff-inspired aesthetic with red/green before/after panels, but vary fonts and palette from previous diagrams.

**Scope detection** — determine what to diff based on `$1`:
- Branch name (e.g. `devel`, `production`, `main`): working tree vs that branch
- Commit hash: that specific commit's diff (`git show <hash>`)
- `HEAD`: uncommitted changes only (`git diff` and `git diff --staged`)
- Range (e.g. `abc123..def456`): diff between two commits
- No argument: default to `devel`

**Data gathering phase** — run these first to understand the full scope:
- `git diff --stat <ref>` for file-level overview
- `git diff --name-status <ref> --` for new/modified/deleted files (separate src from tests)
- Line counts: compare key files between `<ref>` and working tree (`git show <ref>:file | wc -l` vs `wc -l`)
- New public API surface: grep added lines for exported symbols, public functions, classes, interfaces (adapt the pattern to the project's language — `export`/`function`/`class`/`interface` for TS/JS, `def`/`class` for Python, `func`/`type` for Go, etc.)
- Feature inventory: grep for new actions, keybindings, config fields, event types on both sides
- Read all changed files in full — include surrounding code paths needed to validate behavior
- Check whether `CHANGELOG.md` has an entry for these changes
- Check whether `README.md` or `docs/*.md` need updates given any new or changed features

**Verification checkpoint** — before generating HTML, produce a structured fact sheet of every claim you will present in the review:
- Every quantitative figure: line counts, file counts, function counts, test counts
- Every function, type, and module name you will reference
- Every behavior description: what code does, what changed, before vs. after
- For each, cite the source: the git command output that produced it, or the file:line where you read it
Verify each claim against the code. If something cannot be verified, mark it as uncertain rather than stating it as fact. This fact sheet is your source of truth during HTML generation — do not deviate from it.

**Diagram structure** — the page should include:
1. **Executive summary** — not just a dry before/after. Lead with the *intuition*: why do these changes exist? What problem were they solving, what was the core insight? Then the factual scope (X files, Y lines, Z new modules). Aim for clarity — a reader who only sees this section should understand the essence of the change. *Visual treatment: this is the visual anchor — use hero depth (larger type 20-24px, subtle accent-tinted background, more padding than other sections).*
2. **KPI dashboard** — lines added/removed, files changed, new modules, test counts. Include a **housekeeping** indicator: whether CHANGELOG.md was updated (green/red badge) and whether docs need changes (green/yellow/red).
3. **Module architecture** — how the file structure changed, with a Mermaid dependency graph of the current state. Wrap in `.mermaid-wrap` with zoom controls (+/−/reset buttons), Ctrl/Cmd+scroll zoom, and click-and-drag panning (grab/grabbing cursors). See css-patterns.md "Mermaid Zoom Controls" for the full pattern.
4. **Major feature comparisons** — side-by-side before/after panels for each significant area of change (UI, data flow, API surface, config, etc.). Overflow prevention: apply `min-width: 0` on all grid/flex children and `overflow-wrap: break-word` on panels. Never use `display: flex` on `<li>` for marker characters — use absolute positioning instead (see css-patterns.md Overflow Protection).
5. **Flow diagrams** — Mermaid flowchart, sequence, or state diagrams for any new lifecycle/pipeline/interaction patterns. Same zoom controls as section 3.
6. **File map** — full tree with color-coded new/modified/deleted indicators. *Visual treatment: compact — consider `<details>` collapsed by default for pages with many sections.*
7. **Test coverage** — before/after test file counts and what's covered
8. **Code review** — structured Good/Bad/Ugly analysis of the changes:
   - **Good**: Solid choices, improvements, clean patterns worth calling out
   - **Bad**: Concrete issues — bugs, regressions, missing error handling, logic errors
   - **Ugly**: Subtle problems — tech debt introduced, maintainability concerns, things that work now but will bite later
   - **Questions**: Anything unclear or that needs the author's clarification
   - Use styled cards with green/red/amber/blue left-border accents matching the diff color language. Each item should reference specific files and line ranges. If nothing to flag in a category, say "None found" rather than omitting the section.
9. **Re-entry context** — a concise "note from present-you to future-you" covering the following. *Visual treatment: compact — consider `<details>` collapsed by default for pages with many sections.*
   - **Key invariants**: assumptions the changed code relies on that aren't enforced by types or tests (e.g., "cleanup must be called before session switch or artifacts leak")
   - **Non-obvious coupling**: files or behaviors that are connected in ways that aren't visible from imports alone (e.g., "the feed renderer reads events written by the overlay — changing the event schema requires updating both")
   - **Gotchas**: things that would surprise someone modifying this code in two weeks. Edge cases, ordering dependencies, implicit contracts.
   - **Don't forget**: if the changes require follow-up work (migration, config update, docs), list it here.

**Visual hierarchy**: Sections 1-3 should dominate the viewport on load (hero depth, larger type, more padding). Sections 6+ are reference material and should feel lighter (flat or recessed depth, compact layout, collapsible where appropriate).

Include responsive section navigation. Use diff-style visual language throughout: red for removed/before, green for added/after, yellow for modified, blue for neutral context.

Write in the `docs/reviews/` dir of the project and open in browser.

