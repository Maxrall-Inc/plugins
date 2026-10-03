---
description: Review the working diff with a fresh-context, read-only reviewer sub-agent — file:line, severity, why, fix sketch
---
Review: $ARGUMENTS

Parse the arguments first:
- a git ref (branch, tag, SHA, `HEAD~3`) → review that diff instead of the uncommitted tree;
- `deep` → raise the findings budget to 25 and include suggestions;
- `--max-findings <n>|all` → exact budget (wins over `deep`).
Default: the uncommitted working tree, budget 10.

Scope of this review:
- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Size: !`git diff HEAD --stat | head -40`

## How to run it

1. Pick the diff command: `git diff HEAD` (default) or `git diff <ref>...HEAD` when a ref was given.
   Untracked files are NOT in any diff — take them from the status above and have the reviewer
   read those files in full.
2. Split the change into chunks of at most ~15 files or ~600 diff lines (a small change is ONE
   chunk). Note `/review` in the CLI lists the changed files grouped by how much care each needs —
   use it if the raw list is large.
3. For EACH chunk call the task tool with `subagent_type: "reviewer"`. The reviewer runs the diff
   command ITSELF via bash — do NOT paste diffs into the prompt (that is the whole point: the main
   context stays clean). The prompt must contain: the exact diff command + file list of the chunk,
   the findings budget, and the output contract below. Independent chunks go in ONE message
   (parallel dispatch).
4. Merge the reports: drop duplicates, order 🔴 → 🟡 → 🟢, keep at most the budget, and say how many
   lower-priority findings were omitted when the budget cut them off.

## Output

Findings as `🔴/🟡/🟢 [severity] file:line — issue`, each with one line of WHY (the failure
scenario) and a minimal fix sketch. End with a verdict (APPROVE / REQUEST CHANGES) and what was
reviewed (files, chunk count). If the diff is clean, say exactly that — an empty report is a
valid, valuable result. Never pad the list with speculative or invented findings.

Read-only. Never edit files during a review, and do not post to GitHub/GitLab — there is no
`--comment` in this version.
