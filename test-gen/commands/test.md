---
description: Generate unit tests for a file/function following project conventions
---
Generate unit tests for: $ARGUMENTS

Steps:
1. Read the target file. If $ARGUMENTS names a function, focus on it; otherwise cover the file's exported surface.
2. Discover the project's test setup BEFORE writing anything:
   - Runner: check package.json scripts / pytest.ini / go.mod etc.
   - Conventions: find one or two existing test files and mirror their style (imports, describe/it vs test, fixtures, naming, file location).
3. Write tests that cover: the happy path, edge cases (empty/null/boundary), and error paths. Prefer several small tests over one big one. Do not test implementation details.
4. Run ONLY the new test file and iterate until green. Never weaken an existing test to make yours pass.

If no test infrastructure exists at all, propose a minimal setup first and wait for confirmation before installing anything.
