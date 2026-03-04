# Bastion

**One command to fortify your Claude Code dev stack.**

Bastion is a safety-first addon for [Claude Code](https://claude.ai/claude-code). Running `bastion install` sets up the full development stack:

| Layer | Tool | What it does |
|-------|------|-------------|
| Standards | [ECC](https://github.com/affaan-m/everything-claude-code) (ecc-universal) | Coding rules, agents, and commands for Claude Code |
| Workflow | [GSD](https://www.npmjs.com/package/get-shit-done-cc) (get-shit-done-cc) | Phase-based project management, planning, and execution |
| Automation | [Ralph Loop](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) | Autonomous iteration loops (`/ralph-loop`) |
| Safety | **Bastion** | Secret detection, SQL injection scanning, migration safety, auto-formatting |

## Quick Start

### Prerequisites

- **Node.js** >= 18 (`node --version`)
- **git** (for Ralph Loop installation)
- [Claude Code](https://claude.ai/claude-code) CLI installed

### Install

```bash
git clone https://github.com/pruthvirajgupta8933/bastion.git ~/bastion
node ~/bastion/bin/bastion.cjs install
```

That's it. One command installs all four layers.

### Verify

```bash
# ECC rules installed
ls ~/.claude/rules/common/

# GSD installed
cat ~/.claude/get-shit-done/VERSION

# Ralph Loop installed
ls ~/.claude/commands/ralph-loop.md

# Bastion hooks active
grep bastion- ~/.claude/settings.json
```

### Uninstall

```bash
node ~/bastion/bin/bastion.cjs uninstall
```

> **Note:** Uninstall only removes Bastion's own files (3 hooks + 1 command). ECC, GSD, and Ralph Loop are left untouched.

## What Bastion Adds

Bastion installs 3 PostToolUse hooks and 1 slash command. These run automatically every time Claude Code writes or edits a file.

### Hook 1: Guardian (`bastion-guardian.js`)

Scans every file write/edit for security issues:

- **Secret detection** — API keys (`sk-*`, `pk-*`, `ghp_*`, `xox*`), AWS keys (`AKIA*`), private keys, hardcoded passwords, connection strings with credentials
- **SQL injection** — String concatenation in SQL queries (`"SELECT " + userInput`)
- **File size** — Warns if a file exceeds 800 lines

Skips comments, `process.env` references, and `.env` file patterns to avoid false positives.

### Hook 2: Auto-Format (`bastion-format.sh`)

Auto-formats non-JS files on save (ECC already handles JS/TS/JSON/CSS/HTML):

| Language | Formatter |
|----------|-----------|
| Python | `black` or `autopep8` |
| Go | `gofmt` |
| Swift | `swiftformat` |
| Rust | `rustfmt` |

Best-effort — if the formatter isn't installed, it silently skips. Never blocks.

### Hook 3: Migration Check (`bastion-migration-check.js`)

Automatically scans migration files (`.sql` in `migrations/`, `prisma/migrations/`, `drizzle/`, etc.) for:

- **Destructive operations** — `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DROP DATABASE`
- **Risky ALTER TABLE** — Operations without `CONCURRENTLY` (table-locking risk in production)
- **Type narrowing** — `VARCHAR` size reduction, integer downcast (data truncation risk)
- **Missing rollback** — Destructive UP migration without a corresponding DOWN migration

### Command: `/bastion:scan`

On-demand architecture and migration analysis for any project directory:

```
/bastion:scan
```

Checks for:
- Frontend-heavy codebase (>75% frontend code)
- God components (>500 lines)
- Direct DB access from frontend code
- N+1 query patterns (DB calls inside loops)
- Missing database indexes (Prisma `@@index`)
- Float types used for money fields
- All migration checks listed above

Outputs a scored report (0-100) with categorized issues (CRITICAL / HIGH / MEDIUM / LOW).

## Commands Reference

```
bastion install      # Install full stack (ECC + GSD + Ralph Loop + Bastion hooks)
bastion uninstall    # Remove Bastion files only
bastion detect       # Detect tech stack in current directory
bastion scan         # Run architecture + migration analysis on current directory
```

## How It Works

### Installation Order

Bastion installs dependencies in a specific order because each layer builds on the previous:

1. **ECC** — `npm install -g ecc-universal` + `ecc-install` (sets up rules)
2. **GSD** — `npx -y get-shit-done-cc@latest --claude --global` (patches `settings.json` with its own hooks)
3. **Ralph Loop** — Sparse git clone from `anthropics/claude-code` repo
4. **Bastion** — Copies hooks/commands, **appends** to the already-patched `settings.json`

### Idempotency

Running `bastion install` multiple times is safe. Each dependency checks if it's already installed before acting:

```
$ node ~/bastion/bin/bastion.cjs install

Bastion: Checking dependencies...
  ECC (ecc-universal): already installed
  ECC rules: already in place
  GSD (get-shit-done-cc): already installed
  Ralph Loop: already installed
  Dependencies checked.

  Settings: Bastion hooks already present (skipped)
Bastion: Installation complete.
```

### Fault Tolerance

If any dependency fails to install (network issues, permissions, etc.), Bastion warns and continues. You can install the failed dependency manually later.

## Stack Overview

After installation, your Claude Code session has:

| What | Provided by | How to use |
|------|------------|------------|
| Coding standards & rules | ECC | Automatic (loaded from `~/.claude/rules/`) |
| Code review | ECC | `/code-review` |
| Project planning | GSD | `/gsd:new-project`, `/gsd:plan-phase` |
| Phase execution | GSD | `/gsd:execute-phase` |
| Autonomous loops | Ralph Loop | `/ralph-loop "build feature X" --max-iterations 5` |
| Secret scanning | Bastion | Automatic (runs on every file write) |
| SQL injection detection | Bastion | Automatic (runs on every file write) |
| Migration safety | Bastion | Automatic + `/bastion:scan` |
| Architecture analysis | Bastion | `/bastion:scan` |
| Auto-format (Python/Go/Swift/Rust) | Bastion | Automatic (runs on every file write) |

## Troubleshooting

**`npm: command not found`** — Install [Node.js](https://nodejs.org/) (v18+)

**`git: command not found`** — Install git (`brew install git` on macOS)

**ECC install fails** — Run manually: `npm install -g ecc-universal && ecc-install typescript python golang swift`

**GSD install fails** — Run manually: `npx -y get-shit-done-cc@latest --claude --global`

**Ralph Loop not found in repo** — The plugin may have moved. Check [anthropics/claude-code](https://github.com/anthropics/claude-code) for current location.

**Hooks not firing** — Verify settings.json: `grep bastion- ~/.claude/settings.json`

**Debug mode** — Run with `BASTION_DEBUG=1 node ~/bastion/bin/bastion.cjs install` for stack traces.

## License

MIT
