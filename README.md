# Official Nexrall Code Plugins

Curated plugins maintained by the Nexrall team. Install any of them with:

```bash
nex plugin install <name>                    # via the registry (short name)
nex plugin install --yes <name>              # non-interactive (CI/scripts)
nex plugin install nexrall/plugins/<name>    # directly from GitHub
```

| Plugin | Commands | Agents | Description |
|--------|----------|--------|-------------|
| `commit-pro` | `/commit`, `/changelog` | — | Conventional commits + changelog entries from real diffs |
| `test-gen` | `/test` | — | Unit tests following your project's conventions |
| `doc-writer` | `/readme`, `/docstrings` | — | READMEs and doc comments generated from actual code |
| `security-audit` | `/audit` | — | Injection / authz / secrets audit of a diff or module |
| `refactor-guide` | `/refactor` | `refactorer` | Disciplined stepwise refactors with call-site verification |

None of these plugins ship `hooks.json` or `mcp.json` — they are pure prompt
packs (commands + agents) and execute nothing on install.

Most of them ship COMMANDS only, because their specialist agents became builtins
(see below) — an agent that lives in a plugin is invisible to anyone who does not
already know the plugin exists. `refactor-guide` still ships an agent, and that is
deliberate rather than an oversight; the criteria are spelled out below.

## Built-in agents (no install needed)

These ship with the CLI/extension and are always available to the `task` tool via
`subagent_type` — no install step, nothing to discover.

| Agent | Access | Model | Purpose |
|-------|--------|-------|---------|
| `reviewer` | read-only | inherit | Correctness bugs, edge cases, breaking changes in a diff |
| `security-auditor` | read-only | pro | Injection, authz, secrets, validation flaws |
| `explorer` | read-only | turbo | Fast codebase/symbol search, keeps bulk reading out of the main context |
| `planner` | read-only | pro | Researches a change, returns a step-by-step plan |
| `test-writer` | **test files only** | inherit | Writes tests; cannot touch production source |
| `devops-advisor` | read-only | pro | CI/CD, Docker, k8s diagnosis — proposes a diff, never applies it |

The access column is ENFORCED, not requested: read-only agents carry no write tools
in their allowlist and are refused at the permission gate, and `test-writer` is
additionally path-restricted so it cannot "fix" production code to make a failing
test pass. That distinction is the whole point — see the criteria below.

Override any of them by dropping your own `.nexrall/agents/<name>.md` in the
project (project > global > plugin > builtin). Custom agents can use
`test_files_only: true` in their frontmatter to get the same enforced restriction.

### Builtin or plugin? The criteria

Not every good agent belongs in the builtin roster. An agent ships as a **builtin**
only when BOTH hold:

1. **Structurally safe** — read-only, or restricted by something the permission gate
   can actually enforce. Not "its prompt says it won't": a prompt is a request, and
   an agent that is merely *asked* to behave is not safe enough to be on by default
   for everyone.
2. **Loses its point if you have to discover it** — a security review you only get
   when you already knew a plugin existed is not a default anyone can rely on.

Everything else ships as a **plugin**, including genuinely good agents. Installing
one is then a deliberate choice, which is the right shape for a capability that
needs a decision rather than a default.

Worked examples, so the line is reproducible rather than a judgement call:

- `security-auditor` — read-only (1 ✓) and worthless if undiscovered (2 ✓).
  It was plugin-only, which was indefensible next to `reviewer` already being a
  builtin whose own prompt tells it to hunt security issues. **Promoted.**
- `test-writer` — needs write access, so (1) only holds because `testFilesOnly` is
  enforced at the gate. Without that mechanism it would have stayed a plugin.
  **Promoted, with the restriction built first.**
- `devops-advisor` — read-only on purpose. A DevOps agent with apply rights fails
  in production and often irreversibly, so it proposes a diff and a human runs it.
  Keeping it advisory is what lets it satisfy (1) at all.
- `refactorer` (in `refactor-guide`) — needs unrestricted write across the repo by
  its very nature, so no meaningful path restriction exists: (1) fails. It also
  adds nothing the `/refactor` command does not already provide, and the command is
  *better placed*, because it steers the MAIN agent — which has the conversation's
  context, shows every step on screen, and is covered by per-turn `/rewind`
  checkpoints. A sub-agent starts from a blank context and streams no text, and
  refactoring is exactly the work that depends on knowing *why*. **Stays a plugin.**

So the asymmetry between `refactor-guide` and the rest is intentional. Before
promoting an agent, check it against (1) and (2) — and if it fails (1), consider
whether a slash command steering the main agent is the better answer, as it was
here.

## Writing your own plugin

A plugin is a directory:

```
my-plugin/
  plugin.json        { "name", "version", "description" }
  commands/*.md      slash commands (markdown + frontmatter)
  agents/*.md        sub-agent types (markdown + frontmatter)
  hooks.json         optional — hooks (runs shell commands; installer warns users)
  mcp.json           optional — MCP servers (spawns processes; installer warns users)
```

Publish it as a public GitHub repo (or a subdirectory of one) and anyone can:

```bash
nex plugin install you/your-repo
nex plugin install you/your-repo/path/to/plugin#v1.0.0
```
