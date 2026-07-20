# Settings, permissions & git hygiene

## Precedence (highest wins)

1. **Managed settings** — org policy, cannot be overridden.
2. **Command-line flags** — e.g. `--model`.
3. **`.claude/settings.local.json`** — your personal, per-repo overrides.
4. **`.claude/settings.json`** — team-shared project settings.
5. **`~/.claude/settings.json`** — your cross-project defaults.

## What each is for

- **`~/.claude/settings.json`** — machine-wide personal preferences (model,
  theme, global permissions). Not in any repo.
- **`.claude/settings.json`** — committed, team-shared: agreed permission rules,
  MCP servers, project hooks. Everyone on the repo gets these.
- **`.claude/settings.local.json`** — your own overrides for this repo (extra
  allowed commands, experiments). Personal, not shared.

## Git hygiene

```gitignore
# .gitignore — personal/machine-local Claude Code files
.claude/settings.local.json
CLAUDE.local.md
```

Commit the shared config so the whole team gets consistent behavior:

```
CLAUDE.md
.claude/settings.json
.claude/skills/
.claude/agents/
.claude/commands/
```

Auto memory (`~/.claude/projects/<hash>/memory/`) lives **outside** the repo, so
it needs no gitignore entry and is never committed by default.

## Permissions quick note

`settings.json` is also where allow/deny permission rules live (e.g.
pre-approving safe read-only commands so Claude doesn't prompt on each one). Put
rules the whole team should share in `.claude/settings.json`; keep personal
experiments in `.claude/settings.local.json`. See
<https://code.claude.com/docs/en/settings> for the current schema.
