---
description: Write or refresh the README from the actual project state
---
Write (or update) the README for this project. Focus: $ARGUMENTS

Ground truth first — inspect before writing:
- Manifest: package.json / pyproject.toml / go.mod / Cargo.toml (name, scripts, deps)
- Layout: !`ls`
- Existing README (keep its good parts): read README.md if present

Structure: title + one-line pitch, install, quick-start (a real, runnable example), configuration (only options that actually exist in the code), scripts/commands table, license.

Rules:
- Every command and code sample must be copy-paste runnable — verify script names against the manifest.
- No marketing fluff, no badges unless already present, no fabricated features.
- If a README exists, EDIT it (preserve tone and any custom sections) rather than rewriting wholesale.
