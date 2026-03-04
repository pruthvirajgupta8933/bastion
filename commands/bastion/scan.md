---
name: bastion:scan
description: Architecture analysis + migration safety scan (complements ECC's /code-review)
interaction_mode: normal
allowed_tools: [Read, Bash, Glob, Grep, Task]
---

# Bastion Scan — Architecture + Migration Analysis

You are running a focused architecture and migration safety analysis. This command fills gaps that ECC's `/code-review` doesn't cover: frontend-heavy detection, god components, N+1 queries, float-for-money, and migration safety.

**NOTE**: This does NOT replace ECC's `/code-review`. Use `/code-review` for general quality, security, and style. Use `/bastion:scan` for architecture-specific and migration-specific checks.

## Step 1: Determine Scan Scope

1. **If arguments are provided**: Scan the specified directory
2. **If no arguments**: Scan the current working directory

## Step 2: Run Architecture Analysis

Run the architecture analyzer on the project:

```bash
node ~/bastion/bin/lib/architecture-analyzer.cjs
```

Or use the analyzer directly by reading the project files and checking for:

### Architecture Checks
- **Frontend ratio**: Flag if frontend code exceeds 75% of total (suggests missing backend logic)
- **God components**: Flag components exceeding 500 lines in component directories
- **Direct DB access from frontend**: Flag ORM imports in frontend directories
- **N+1 query patterns**: Flag database calls inside loops (`for`/`forEach`/`while` + `await db.query`)
- **Missing indexes**: Check Prisma schema for foreign key fields without `@@index`
- **Float for money**: Flag float/double types used for monetary fields (price, amount, balance, etc.)
- **Hardcoded secrets**: Flag API keys, tokens, passwords in source code (not env vars)

Use the Task tool to spawn a parallel agent (subagent_type: "general-purpose") for the architecture scan if the project has many files.

## Step 3: Run Migration Analysis

Check for migration directories:
- `migrations/`, `db/migrations/`, `prisma/migrations/`, `drizzle/`, `src/migrations/`, `database/migrations/`

For each migration directory found, validate:
- **Destructive operations**: DROP TABLE, DROP COLUMN, TRUNCATE, DROP DATABASE
- **Risky ALTER TABLE**: Operations without CONCURRENTLY (table locking risk)
- **Type narrowing**: VARCHAR size reduction, integer downcast (data truncation risk)
- **Missing rollback**: UP migration without corresponding DOWN migration
- **Sequence gaps**: Missing numbers in migration ordering
- **Duplicate sequences**: Multiple migrations with the same sequence number

## Step 4: Build Report

```
========================================
  Bastion Architecture + Migration Report
========================================

Score: <0-100>/100

CRITICAL Issues (<count>)
  - [category] description (file:line)

HIGH Issues (<count>)
  - [category] description (file:line)

MEDIUM Issues (<count>)
  - [category] description (file:line)

----------------------------------------
Migration Analysis
----------------------------------------
  Directory: <path>
  Files: <count>
  Errors: <list>
  Warnings: <list>
  Chain issues: <list>

----------------------------------------
Suggestions
----------------------------------------
  1. <top priority>
  2. <second priority>
  3. <third priority>

========================================
```

### Score Calculation
Start at 100, deduct:
- CRITICAL: -15 points each
- HIGH: -10 points each
- MEDIUM: -5 points each
- LOW: -2 points each
- Minimum: 0

## Error Handling

- If the project has no code files, report "No code files found" and exit
- If no migration directories exist, report "No migrations found" and skip that section
- If analysis fails on a specific check, log the error and continue with remaining checks
