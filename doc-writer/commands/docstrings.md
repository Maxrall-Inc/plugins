---
description: Add missing JSDoc/docstrings to a file's public API
---
Add documentation comments to: $ARGUMENTS

1. Read the file. Identify EXPORTED/public symbols missing docs (skip private helpers unless complex).
2. Add idiomatic doc comments (JSDoc for JS/TS, docstrings for Python, doc comments for Go/Rust — match the language and any existing style in the repo):
   - One-line summary of WHAT it does (not how).
   - Param/return descriptions only where the name+type alone is not self-explanatory.
   - Document thrown errors / edge behaviour when non-obvious.
3. Do NOT change any code — comments only. Do not restate the obvious ("gets the user" on getUser).

Keep it terse: a bad docstring is worse than none.
