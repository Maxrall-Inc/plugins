# Official Nexrall Code Plugins

Curated plugins maintained by the Nexrall team. Install any of them with:

```bash
nex plugin install <name>                    # via the registry (short name)
nex plugin install --yes <name>              # non-interactive (CI/scripts)
nex plugin install nexrall/plugins/<name>    # directly from GitHub
nex plugin install owner/repo#v1.2.0         # pin an exact tag/branch/commit
```

In VS Code, use the **Plugins** entry in the `/` menu — install, update, remove and
audit what is installed, with the same confirmation gate as the CLI.

## Team plugin sources

A source binds a short alias to a plugin repo, so a team can commit their plugin
list instead of passing URLs around:

```jsonc
// .nexrall/settings.json — shared with the team
{
  "pluginSources": {
    "deploy": "acme/deploy-tools",
    "lint":   "acme/lint#v2.1.0"     // pin a tag so it cannot move on its own
  }
}
```

```bash
nex plugin source list                       # what is declared, and by whom
nex plugin source add deploy acme/tools      # personal (~/.nexrall/settings.json)
nex plugin source add --project deploy acme/tools   # shared with the team
nex plugin install deploy                    # now resolves the alias
```

**Declaring a source does not install anything.** It only makes a name
resolvable; nothing is downloaded and no code runs until someone runs an install
and passes the usual confirmation. That line matters because a project-tier entry
is controlled by whoever can commit to the repo — if a declaration could install
by itself, cloning a hostile repo would be enough to run its code. For the same
reason, project-declared sources only count once you have trusted the workspace,
and the trust prompt names them explicitly.

Sources resolve most-trusted tier first (`managed` → `user` → `project`) and the
first binding wins, so a repository cannot repoint an alias you already defined.

### Organisation policy

Administrators can restrict installs entirely, from the managed settings file
(`/etc/nexrall/managed-settings.json`, or the platform equivalent — never from a
repo or a user's own config):

```json
{ "allowedPluginSources": ["acme/*", "nexrall/plugins"] }
```

Enforced inside `installPlugin` itself, so every path — CLI, VS Code, and
`update` — inherits it rather than each command remembering to check.

Every install records the commit it came from, so `nex plugin list` shows
`@abc1234` and an update reports `abc1234 → def5678` instead of silently replacing
the contents of a plugin you already trusted. Pass `#<tag>` to pin a source that
should never move on its own.

| Plugin | Commands | Agents | Description |
|--------|----------|--------|-------------|
| `commit-pro` | `/commit`, `/changelog` | — | Conventional commits + changelog entries from real diffs |
| `test-gen` | `/test` | — | Unit tests following your project's conventions |
| `doc-writer` | `/readme`, `/docstrings` | — | READMEs and doc comments generated from actual code |
| `security-audit` | `/audit` | — | Injection / authz / secrets audit of a diff or module |
| `refactor-guide` | `/refactor` | `refactorer` | Disciplined stepwise refactors with call-site verification |
| `code-review` | `/code-review` | `reviewer` | Fresh-context review of the working diff: file:line, severity, why, fix sketch |

None of these plugins ship `hooks.json` or `mcp.json` — they are pure prompt
packs (commands + agents) and execute nothing on install.

Most of them ship COMMANDS that steer the main agent. `refactor-guide` and
`code-review` also ship agents: a `refactorer` that executes, and a `reviewer`
that is read-only and runs in a FRESH context — the author of a diff is the
worst reviewer of it.

`/code-review` is not the same thing as the `/review` slash command in a CLI
session: `/review` is the cheap local queue (changed files grouped by how much
care each one needs, no model call), while `/code-review` runs the reviewer.

## Built-in agents (no install needed)

Deliberately few — the generic roles, as in Claude Code (`Explore`, `Plan`,
`general-purpose`) and Codex (`default`, `worker`, `explorer`):

| Agent | Access | Model | Purpose |
|-------|--------|-------|---------|
| `general-purpose` | everything | inherit | Multi-step work that needs both exploring and editing |
| `explorer` | read-only | cheapest of the session's provider | Fast codebase/symbol search, keeps bulk reading out of the main context |
| `planner` | read-only | inherit | Researches a change, returns a step-by-step plan |

Read-only is ENFORCED, not requested: those agents carry no write tools in their
allowlist and are refused at the permission gate.

There is no built-in reviewer, security auditor, test writer or infra advisor, on
purpose. What "review" means depends on your codebase, so you define the specialist
you need as `.nexrall/agents/<name>.md` (project) or `~/.nexrall/agents/<name>.md`
(global). Precedence is project > global > plugin > builtin, so a file named
`explorer.md` replaces the built-in `explorer`. `test_files_only: true` in the
frontmatter gives a test-writing agent an enforced "tests only" restriction.

### Writing an agent definition

```
---
name: db-migrator
description: Reviews migrations for destructive DDL. Use before applying one.
tools: read_file, search_files, glob, bash     # allowlist — see the warning below
test_files_only: true                          # optional, enforced at the permission gate
---
You are a migration reviewer. You never apply migrations...
```

Two rules that are easy to get wrong, because both used to fail silently:

- **`tools` only ever GRANTS.** Omit the line and the agent receives *every* tool,
  including `write_file`, `delete_file` and `bash`. Names are `lower_snake_case`
  exactly as the model sees them; a misspelled name is not an error, the agent
  simply never gets that tool. Both cases are now reported — run `/agents` (CLI)
  or open the agents picker (VS Code) to see any problems in your definitions.
- **A definition whose frontmatter cannot be parsed is forced read-only.** It used
  to be the opposite: a file with no `---` block produced *no* allowlist, which
  means unrestricted. The more broken the file, the more power it got.

Subfolders are scanned, so `agents/review/strict.md` works; the agent's identity
comes from `name` (or the filename), never the path.

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

### Claude Code plugins work too

That ecosystem places three files elsewhere, and both layouts are now read
(ours takes precedence if a plugin somehow ships both):

| Component | Nexrall | Claude Code |
|---|---|---|
| manifest | `plugin.json` | `.claude-plugin/plugin.json` |
| hooks | `hooks.json` | `hooks/hooks.json` |
| MCP servers | `mcp.json` | `.mcp.json` |

`commands/`, `agents/` and `skills/` already share the same paths, so most Claude
Code plugins install and work unchanged.

This was a security fix as much as a compatibility one. The installer's warning
about hooks/MCP comes from inspecting these paths — so before, a Claude Code
plugin shipping `.mcp.json` was reported as containing *no* MCP servers. It could
not actually run (the loader missed it too), but the install-time report was wrong
in the dangerous direction, and any later fix to the loader alone would have
turned that into a live hole. The inspector and the loader now resolve through one
shared table, and a test asserts they can never disagree.
