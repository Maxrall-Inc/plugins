---
description: Safely refactor code — plan, verify call sites, apply stepwise with tests
---
Refactor: $ARGUMENTS

Follow this discipline strictly:

1. **Understand** — read the target code and EVERY call site (search_files / find_references) before touching anything. List the blast radius.
2. **Plan** — write a numbered step plan where each step leaves the codebase compiling and tests green. Share the plan (todo list) before starting.
3. **Baseline** — run the relevant tests FIRST. If they fail before you start, stop and report; never refactor on a broken baseline.
4. **Apply stepwise** — one mechanical change per step (rename, extract, move, inline). Re-run the affected tests after each step, not just at the end.
5. **Behaviour freeze** — a refactor changes structure, never behaviour. If you find a bug mid-refactor, note it and report it at the end; do not silently fix it in the same change.

Never: batch unrelated cleanups, change public APIs without listing every caller updated, or delete tests to make the suite pass.
