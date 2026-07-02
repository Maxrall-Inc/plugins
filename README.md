# Official Nexrall Code Plugins

Curated plugins maintained by the Nexrall team. Install any of them with:

```bash
nex plugin install <name>                      # via the registry (short name)
nex plugin install nexrall/nexrall-code/plugins/<name>   # directly from GitHub
```

| Plugin | Commands | Agents | Description |
|--------|----------|--------|-------------|
| `commit-pro` | `/commit`, `/changelog` | — | Conventional commits + changelog entries from real diffs |
| `test-gen` | `/test` | `test-writer` | Unit tests following your project's conventions |
| `doc-writer` | `/readme`, `/docstrings` | — | READMEs and doc comments generated from actual code |
| `security-audit` | `/audit` | `security-auditor` | Injection / authz / secrets audit of a diff or module |
| `refactor-guide` | `/refactor` | `refactorer` | Disciplined stepwise refactors with call-site verification |

None of these plugins ship `hooks.json` or `mcp.json` — they are pure prompt
packs (commands + agents) and execute nothing on install.

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
