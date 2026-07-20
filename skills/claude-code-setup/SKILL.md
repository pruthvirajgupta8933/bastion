---
name: claude-code-setup
description: >-
  Framework for structuring Claude Code configuration — the CLAUDE.md memory
  hierarchy, skills, subagents, slash commands, settings.json, and auto memory.
  Use when setting up Claude Code for a project or globally, deciding what
  belongs at the global (~/.claude/) vs project (.claude/) level, organizing a
  .claude/ directory, writing or trimming a CLAUDE.md, or building reusable
  skills and subagents.
---

# Claude Code Setup Framework

A scalable way to configure Claude Code so it behaves consistently across every
repo — without bloating the context window. The core idea: **keep global things
global, keep project things in the project, and let each layer do one job.**

Everything below reflects how Claude Code actually loads configuration. When a
detail matters for a decision, verify the current behavior at
<https://code.claude.com/docs/en/memory> and `/settings`.

## The loading model (read this first)

Claude Code assembles context from several sources. They fall into two groups,
and the distinction is what makes the whole framework work:

**Always in context (keep small):**

- **Memory files** — every `CLAUDE.md` in scope is concatenated into the system
  prompt at startup. This is a recurring token cost on every turn.
- **Skill & subagent *metadata*** — only each skill's/subagent's `name` +
  `description` load up front, so Claude knows what exists. The full body loads
  **only when the skill or subagent is actually invoked.** This is *progressive
  disclosure*, and it is the single most misunderstood part of Claude Code.

**Loaded on demand (effectively free until used):**

- A skill's `SKILL.md` body and its bundled files — pulled in when triggered.
- A subagent's full definition — runs in its own isolated context, not yours.
- Subdirectory `CLAUDE.md` files — load when Claude reads files in that folder.

> **Consequence:** Having twenty global skills does **not** cost twenty skills'
> worth of tokens. It costs twenty short description lines. So the reason to keep
> a project-specific skill in the project is *relevance and team-sharing*, not a
> token bill. What you must keep short is your **`CLAUDE.md`**, because that is
> always loaded in full.

Don't guess at token counts — run **`/context`** in a session to see exactly what
is consuming the window. (There is no reliable "N lines ≈ M tokens" rule; ignore
guides that quote fabricated adherence percentages.)

## The memory hierarchy

`CLAUDE.md` files load and concatenate in this order; when guidance conflicts,
the more specific and higher-authority layer wins:

| Scope | Location | Purpose | Git |
|-------|----------|---------|-----|
| Managed (enterprise) | OS-level policy dir | Org security/compliance rules | n/a |
| User (global) | `~/.claude/CLAUDE.md` | *Your* personal style, applies everywhere | not a repo |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Tech stack, structure, commands — team-shared | **commit** |
| Local | `./CLAUDE.local.md` | Personal, project-specific overrides | auto-gitignored |
| Subdirectory | `./some/dir/CLAUDE.md` | Context for one part of the tree | commit if shared |

- **`CLAUDE.local.md` is not deprecated** — it's the supported way to keep
  machine-local notes for a repo without committing them.
- **`@path` imports:** any `CLAUDE.md` can pull in other files with `@relative/path`
  or `@/absolute/path`. Nested imports are supported a few levels deep. This is
  how you split a long memory file into modules (see below). Wrap a path in
  backticks to keep it literal.

## What goes at each level

**Global — `~/.claude/CLAUDE.md`** (aim for ~50–80 lines): rules about *you as a
developer*, true in every repo. Communication style, commit format, language and
tooling defaults, and hard "never do X without asking" guardrails.

**Project — `./CLAUDE.md`**: what Claude needs to work in *this* codebase. Tech
stack, folder map, build/test commands, and concrete conventions ("all DB access
goes through Prisma — never raw SQL"). When it grows past ~150 lines, split
themes into separate files and `@import` them.

**Skills & subagents:** put them where they're used. A Next.js component
generator is noise in a Python repo — scope it to the project. Reserve
`~/.claude/` for genuinely cross-project tools (planning, a code-review agent).

Copy-paste templates for each of these live in `references/` — load the one you
need:

- `references/global-claude-md.md` — a complete global `CLAUDE.md`.
- `references/project-claude-md.md` — a project `CLAUDE.md` + modular `@import` split.
- `references/skills-and-subagents.md` — skill & subagent anatomy with examples.
- `references/settings-and-permissions.md` — `settings.json` scopes, precedence, gitignore.
- `references/file-structure.md` — the full global + project reference tree.

## Skills, subagents, and commands (one line each)

- **Skill** = a `SKILL.md` in a named folder under `.claude/skills/` (project) or
  `~/.claude/skills/` (global). Frontmatter needs a `description`; the folder name
  is the skill name. Can bundle scripts, templates, and reference docs.
- **Subagent** = a markdown file with YAML frontmatter (`name`, `description`,
  optional `tools`/`model`) under `.claude/agents/` or `~/.claude/agents/`. Runs in
  an isolated context — great for parallel, focused work.
- **Slash command** = a prompt file under `.claude/commands/` invoked as `/name`,
  with `$ARGUMENTS`/`$1` substitution. (Skills increasingly supersede these.)

## Auto memory (`/memory`)

Claude Code can maintain its own notes about a project — build quirks, debugging
patterns, decisions — in a `MEMORY.md` plus topic files under
`~/.claude/projects/<hash>/memory/`. A slice of `MEMORY.md` loads each session;
topic files load on demand. Because this lives under your **home directory, not
the repo, it is never committed by default.** Use `/memory` to view, edit, or
toggle it, and tell Claude "remember that we always use pnpm here" to add an
entry. Don't hand-maintain it as if it were `CLAUDE.md`.

## Settings & git hygiene

Precedence, highest to lowest: **managed → CLI flags → `.claude/settings.local.json`
→ `.claude/settings.json` → `~/.claude/settings.json`.**

- **Commit:** `CLAUDE.md`, `.claude/settings.json`, `.claude/skills/`,
  `.claude/agents/`, `.claude/commands/`, and any `@import`ed rule files.
- **Gitignore:** `.claude/settings.local.json` (personal overrides) and
  `CLAUDE.local.md` (auto-ignored). Auto memory needs no gitignore — it lives
  outside the repo.

## Common mistakes

1. **Everything in global.** Framework/project-specific rules in `~/.claude/`
   bloat the *always-loaded* memory in every unrelated repo. Test: "would this
   make sense in every repo I open?" If no, it's project scope.
2. **Vague filler.** "Write clean code," "follow best practices" — Claude already
   does this; the words just cost tokens. Be specific: "Use date-fns, never
   moment.js" is actionable.
3. **A giant `CLAUDE.md`.** Split by domain into files and `@import` them; one
   clear responsibility per file.
4. **Skipping negative rules.** Explicit prohibitions ("NEVER edit
   `/prisma/migrations/`", "no class components") prevent expensive mistakes.
5. **Confusing the layers.** Skills/subagents don't bloat context the way memory
   does; `CLAUDE.local.md` and auto memory are personal, not team config. Match
   the tool to the job.

## Fast start

1. Create `~/.claude/CLAUDE.md` (< 80 lines) from `references/global-claude-md.md`.
2. In your most active repo, add `./CLAUDE.md` from `references/project-claude-md.md`.
3. Add `.claude/settings.local.json` and `CLAUDE.local.md` to `.gitignore`.
4. Add **one** universal skill only if you have a real cross-project use for it.
5. Run `/context` to confirm your always-loaded footprint stays lean.
