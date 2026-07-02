---
description: Security audit of a path or the uncommitted diff
model: pro
---
Perform a security audit. Target: $ARGUMENTS
(If no target given, audit the uncommitted changes: !`git diff HEAD --stat --no-color | head -30`)

Checklist — check each class and cite file:line for findings:
1. **Injection** — SQL (string-built queries), command (exec/spawn with user input), path traversal (user input in fs paths), XSS (unescaped output).
2. **AuthN/AuthZ** — missing auth middleware on mutating routes, IDOR (object access without ownership check), privilege checks done client-side only.
3. **Secrets** — hardcoded keys/tokens/passwords, secrets in logs or error messages, sensitive data in URLs.
4. **Input validation** — unvalidated request bodies, unbounded sizes/loops, unsafe deserialization, prototype pollution.
5. **Crypto & sessions** — weak hashing for passwords, predictable tokens, missing expiry.

Report format, sorted by severity (Critical / High / Medium / Low):
- `[SEVERITY] file:line — issue` + one-line exploit scenario + concrete fix.
- End with the single most important fix. If clean, say so explicitly — do not invent findings.

Read-only: do NOT modify any files during the audit.
