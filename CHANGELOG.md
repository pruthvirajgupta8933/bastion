# Changelog

## v2.0.0 — 2026-03-04

### What is Bastion?

Bastion is a single command that sets up your entire Claude Code development environment. Instead of manually installing and configuring 4 different tools, you run one command and everything is ready to go.

### Install

```bash
git clone https://github.com/pruthvirajgupta8933/bastion.git ~/bastion
node ~/bastion/bin/bastion.cjs install
```

Takes ~2 minutes. Requires Node.js 18+ and git.

### What gets installed

#### 1. ECC (ecc-universal) — Coding Standards
Loads coding rules, agents, and commands into Claude Code. Gives you `/code-review`, consistent style enforcement, and 13 specialized agents. Claude follows these rules automatically in every session.

#### 2. GSD (get-shit-done-cc) — Project Workflow
Structured project management for Claude Code. Plan features, break them into phases, execute with tracking, and verify results. Commands like `/gsd:new-project`, `/gsd:plan-phase`, `/gsd:execute-phase`.

#### 3. Ralph Loop — Autonomous Mode
Lets Claude run in a loop without manual intervention. Tell it what to build, set a max iteration count, and let it go. `/ralph-loop "build the login page" --max-iterations 5`

#### 4. Bastion — Safety Hooks (3 automatic guards)

These run silently on every file Claude writes or edits. No action needed from you — they just work.

**Guardian** — Scans for security issues:
- Hardcoded API keys (OpenAI, Stripe, AWS, GitHub, Slack)
- Hardcoded passwords and private keys
- Database connection strings with credentials
- SQL injection via string concatenation
- Files exceeding 800 lines

**Auto-Format** — Formats non-JS files automatically:
- Python (black / autopep8)
- Go (gofmt)
- Swift (swiftformat)
- Rust (rustfmt)
- JS/TS is skipped — ECC already handles those

**Migration Check** — Catches dangerous database changes:
- DROP TABLE, DROP COLUMN, TRUNCATE
- ALTER TABLE without CONCURRENTLY (production lock risk)
- Type narrowing (VARCHAR shrink, integer downcast)
- Missing rollback migrations

### Commands

| Command | What it does |
|---------|-------------|
| `bastion install` | Install everything (ECC + GSD + Ralph + hooks) |
| `bastion uninstall` | Remove Bastion hooks only (leaves ECC/GSD/Ralph) |
| `bastion detect` | Detect tech stack in current project |
| `bastion scan` | Run architecture + migration analysis |
| `/bastion:scan` | Same scan, but inside a Claude Code session |

### Good to know

- **Safe to run multiple times** — skips anything already installed
- **Doesn't block Claude** — hooks warn, they don't prevent writes
- **No false positives on env vars** — Guardian skips `process.env`, `.env` references, and comments
- **Uninstall is scoped** — only removes Bastion's own 3 hooks and 1 command. ECC, GSD, and Ralph Loop stay installed

### After install, verify

```bash
grep bastion- ~/.claude/settings.json    # hooks registered
ls ~/.claude/hooks/bastion-*             # hook files present
cat ~/.claude/get-shit-done/VERSION      # GSD version
ls ~/.claude/commands/ralph-loop.md      # Ralph Loop present
```
