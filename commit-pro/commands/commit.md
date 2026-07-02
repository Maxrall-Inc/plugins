---
description: Write a conventional commit from the staged diff (and commit it)
---
Write a conventional commit for the staged changes and commit it.

Branch: !`git branch --show-current`
Staged files: !`git diff --cached --stat`

Staged diff:
```diff
!`git diff --cached --unified=3 --no-color | head -3000`
```

Rules:
- Format: `type(scope): subject` — types: feat, fix, refactor, docs, test, chore, perf, ci.
- Subject in imperative mood, ≤ 72 chars, no trailing period.
- Add a body (wrapped at 72 chars) only when the "why" is not obvious from the subject.
- If NOTHING is staged, say so and stop — do not stage files yourself.
- Extra context from the user: $ARGUMENTS

After writing the message, run the commit with `git commit -m "<subject>" -m "<body>"` (omit the second -m when there is no body). Show the final message.
