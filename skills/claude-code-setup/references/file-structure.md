# Complete reference structure

The full architecture for a developer working across multiple projects. Global
config follows you everywhere; each project carries exactly the context it needs.

## Global — applies to all your projects

```
~/.claude/
├── CLAUDE.md                 # Personal style guide (< 80 lines, always loaded)
├── settings.json             # Global permissions & preferences
├── skills/
│   ├── planning/
│   │   └── SKILL.md          # Universal task-planning workflow
│   └── git-workflow/
│       └── SKILL.md          # Universal commit & PR workflow
├── agents/
│   └── code-reviewer.md      # Universal code-review subagent
├── commands/
│   └── handoff.md            # /handoff — save session state
└── projects/
    └── <project-hash>/
        └── memory/           # Auto memory — machine-local, never committed
            ├── MEMORY.md      # Index; a slice loads each session
            └── *.md           # Topic files, loaded on demand
```

## Project — scoped to the repo, committed to Git

```
my-project/
├── CLAUDE.md                 # Tech stack, folder map, build commands
├── CLAUDE.local.md           # Personal per-repo notes (gitignored)
└── .claude/
    ├── settings.json         # Team-shared permissions (commit)
    ├── settings.local.json   # Personal overrides (gitignored)
    ├── rules/                # Modular rule files, pulled in via @import
    │   ├── testing.md
    │   ├── api-conventions.md
    │   └── security.md
    ├── skills/
    │   ├── react-component/
    │   │   └── SKILL.md
    │   └── db-migration/
    │       └── SKILL.md
    ├── agents/
    │   └── db-migration-agent.md
    └── commands/
        └── deploy.md         # /deploy — project deploy workflow
```

## Quick-reference: what lives where

| Item | Global `~/.claude/` | Project `.claude/` |
|------|---------------------|--------------------|
| `CLAUDE.md` | Personal style, commit format, defaults | Tech stack, structure, commands |
| Skills | Planning, git, universal patterns | Framework/project-specific workflows |
| Subagents | Code reviewer, doc generator | DB migration, deploy |
| Commands | Handoff, session utilities | Deploy, test-run shortcuts |
| Rules (`@import`) | Fold into `CLAUDE.md` | Testing, API, security modules |
| `settings.json` | Personal defaults | Team-shared permissions (commit) |
| Auto memory | Auto-generated, never edit by hand | n/a (lives under `~/.claude/`) |

## Always vs. on-demand cost

- **Always loaded (keep lean):** every `CLAUDE.md` in scope + skill/subagent
  *descriptions*.
- **On demand (near-free until used):** skill bodies, subagent definitions,
  subdirectory `CLAUDE.md`, imported files a level deep.

Run `/context` to measure the real footprint instead of guessing.
