# Skills, subagents & commands

Reusable instruction packages. Remember progressive disclosure: only the
`description` is always in context — the body loads when the item is invoked. So
**scope by relevance, not by token fear.** Global only if you use it across
multiple *unrelated* projects.

## Skill anatomy

A skill is a directory containing `SKILL.md`. The **directory name** is the skill
name. It can bundle supporting files that load only when the skill runs.

```
.claude/skills/
└── react-component/
    ├── SKILL.md               # required — instructions + trigger description
    └── references/
        └── component-patterns.md   # loaded on demand when the skill runs
```

Frontmatter: `description` drives when Claude auto-invokes the skill, so make it
specific about *when to use it*. Optional fields include `allowed-tools` and
`model`.

```markdown
---
name: react-component
description: >-
  Generate React components the way THIS project does — TypeScript, Tailwind,
  server-component-by-default. Use when creating a new UI component, page, or
  feature section in this repo.
---

## Rules
- Functional components only; explicit prop interfaces.
- `use client` only when the component uses hooks or browser APIs.
- Tailwind only — no inline styles; conditional classes via `cn()` from /lib/utils.
- PascalCase filenames in /components/{category}/; page-only components sit by their page.
```

**Passive vs. invokable:** a skill with a rich `description` is *passive* — Claude
triggers it on its own when the situation matches. Skills can also be run
explicitly as `/skill-name`. This very guide is a passive skill.

## Subagent anatomy

A subagent is one markdown file with YAML frontmatter under `.claude/agents/`
(project) or `~/.claude/agents/` (global). It runs in an **isolated context**, so
it's ideal for focused, parallelizable work (review, migration, research). Its
full definition never bloats your main context.

```markdown
---
name: db-migration-agent
description: >-
  Prisma schema changes and migration generation. Use when modifying the DB
  schema, adding tables, or resolving migration conflicts.
tools: Read, Edit, Bash
---

## Role
You are a database migration specialist for this project. When invoked:
1. Read /prisma/schema.prisma and understand the requested change.
2. Propose the schema edit as a diff; name the migration in snake_case.
3. Run `pnpm prisma migrate dev --name {migration_name}` and verify the file.

## Hard rules
- NEVER edit existing migration files.
- If a column is being dropped, ask for explicit confirmation first.
```

## Slash commands

A prompt file under `.claude/commands/` (or `~/.claude/commands/`), invoked as
`/name`, with `$ARGUMENTS` / `$1` substitution for arguments. Skills increasingly
cover the same ground with richer triggering, but commands remain a lightweight
option for simple, explicitly-invoked shortcuts.

## Good vs. bad global candidates

| ✅ Global (cross-project) | ❌ Keep in the project |
|---------------------------|------------------------|
| Planning / task-decomposition | Next.js component generator |
| Git commit & PR workflow | Django ORM migration helper |
| Code-review subagent | Kubernetes deploy skill |
| Doc generator | Stripe integration skill |

Test before adding globally: *do I use this in 3+ unrelated projects?*
