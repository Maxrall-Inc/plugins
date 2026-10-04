---
description: Review a diff — working tree, git ref, PR/MR number, or path — with a fresh-context, read-only reviewer sub-agent; optionally post the findings as one PR/MR comment
---
Review: $ARGUMENTS

Reviewer helper: !`f=.nexrall/plugins/code-review/target.mjs; [ -f "$f" ] || f="$HOME/.nexrall/plugins/code-review/target.mjs"; [ -f "$f" ] && echo "$f" || echo "(not found — install the plugin first: nex plugin install code-review)"`
Scope: !`git status --short | head -20`
Size: !`git diff HEAD --stat | head -40`

Parse the arguments first:
- a **target**: a git ref (branch, tag, SHA, `HEAD~3`), a **PR/MR number**, or a **path**
  (prefix `./` when a file shares a branch's name). No target = the uncommitted working
  tree (the default);
- `deep` → raise the findings budget to 25 and include suggestions;
- `--max-findings <n>|all` → exact budget (wins over `deep`);
- `--comment` → at the very end, post the merged findings as ONE comment on the PR/MR.
  Valid ONLY with a number target — otherwise refuse and say why;
- `--json` → the final answer is exactly one JSON object (shape below), nothing else.

## How to run it

0. Resolve the target with the helper path printed above:
   `node <helper> resolve <target>` (no target = the working tree). It prints ONE JSON
   object: `kind` (working|ref|pr|mr|path), `host`, `number`/`title` for PR/MRs,
   `diffCommand` — what the REVIEWER must run itself — `files` (for chunking) and
   `untracked` (files NO diff contains — the reviewer reads those in full).
   Helper exit codes: 0 ok · 1 usage · 2 not a git repo · 3 `gh`/`glab` missing ·
   4 the target did not resolve. On non-zero, relay its stderr message and STOP.
   Untracked files are NOT in any diff — take them from the helper's `untracked`
   list and have the reviewer read those files in full.
1. Split `files` into chunks of at most ~15 files or ~600 diff lines (a small change is ONE
   chunk). Note `/review` in the CLI lists the changed files grouped by how much care each needs —
   use it if the raw list is large.
2. For EACH chunk call the task tool with `subagent_type: "reviewer"`. The reviewer runs the
   helper's `diffCommand` ITSELF via bash — do NOT paste diffs into the prompt (that is the whole
   point: the main context stays clean). The prompt must contain: the exact diffCommand + file list
   of the chunk, the findings budget, and the output contract below. Independent chunks go in ONE
   message (parallel dispatch).
3. Merge the reports: drop duplicates, order 🔴 → 🟡 → 🟢, keep at most the budget, and say how many
   lower-priority findings were omitted when the budget cut them off.

## Output

Findings as `🔴/🟡/🟢 [severity] file:line — issue`, each with one line of WHY (the failure
scenario) and a minimal fix sketch. End with a verdict (APPROVE / REQUEST CHANGES) and what was
reviewed (files, chunk count). If the diff is clean, say exactly that — an empty report is a
valid, valuable result. Never pad the list with speculative or invented findings.

With `--json`, end with EXACTLY one JSON object and nothing after it:

    {"schemaVersion":1,"verdict":"approve|request_changes","summary":"one or two sentences",
     "reviewed":{"files":<count>,"chunks":<count>},
     "findings":[{"severity":"critical|warning|suggestion","file":"src/a.ts","line":12,
                  "issue":"what is wrong","why":"failure scenario","fix":"minimal sketch"}],
     "omitted":<count>}

🔴=critical, 🟡=warning, 🟢=suggestion. `line`, `why`, `fix`, `omitted` and `reviewed` are
optional; everything else is required. The object must parse as-is — it is exactly what
`comment-body` consumes. For CI: this is the gate (`jq -e '.verdict == "approve"'`).

## `--comment` (posting back)

Only with a PR/MR number target, and only ONCE, at the very end, after the report is final:

1. save the report JSON (the shape above) to a temp file;
2. `node <helper> comment-body <file>` → the comment body (pinned by the helper);
3. GitHub: `gh pr comment <number> --body-file <body-file>`; GitLab:
   `glab mr note <number> --message "$(cat <body-file>)"`.

Never `gh pr review`, never inline comments, never an approval — ONE plain comment, with the
attribution line the helper adds. If posting fails, report the error verbatim; the findings
still stand.

Read-only: never edit project files during a review. The only writes allowed here are the temp
body file and that single comment — and only when `--comment` was asked for.
