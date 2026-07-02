---
description: Draft a CHANGELOG entry from commits since the last tag
---
Draft a user-facing CHANGELOG entry for the changes since the last release.

Last tag: !`git describe --tags --abbrev=0 2>/dev/null || echo "(no tags)"`
Commits since: !`git log $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~30)..HEAD --oneline --no-color | head -100`

Rules:
- Group under: Added / Changed / Fixed / Removed (skip empty groups).
- Write for USERS, not developers — describe behaviour, not implementation.
- Merge related commits into one bullet; drop chores/CI noise.
- Version/date header: use $ARGUMENTS when given, else `## [Unreleased]`.

If a CHANGELOG.md exists, insert the entry at the top (below any title) with edit_file. Otherwise print the entry only.
