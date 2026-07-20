# Project `CLAUDE.md` + modular split

Lives at `./CLAUDE.md` (or `./.claude/CLAUDE.md`). Committed and team-shared. It
should answer one question: **what does Claude need to know to work effectively in
*this* codebase?** Be concrete.

```markdown
# CLAUDE.md — my-saas-app

## Tech stack
- Next.js 15 (App Router), TypeScript (strict)
- Tailwind CSS v4, PostgreSQL via Prisma, Clerk auth
- Vitest + React Testing Library, deployed on Vercel

## Folder map
- /app          App Router pages and layouts
- /components   Shared React components (PascalCase)
- /lib          Utilities and server actions (/lib/actions/*.ts)
- /prisma       Schema and migrations
- /tests        Mirrors the src structure

## Commands
- pnpm dev            Start dev server
- pnpm test           Run Vitest
- pnpm build          Production build
- pnpm prisma migrate dev   Run DB migrations

## Conventions
- All DB access goes through Prisma — never raw SQL.
- Components are server components by default; add `use client` only when needed.
- NEVER modify files under /prisma/migrations/.
- Never create .env files with real values.

## Detailed rules (imported)
@.claude/rules/testing.md
@.claude/rules/api-conventions.md
@.claude/rules/security.md
```

## Splitting a long file with `@import`

When `CLAUDE.md` grows past ~150 lines, move each theme into its own file and
import it. Imported files concatenate into memory just like the main file —
nesting works a few levels deep. Keep one clear responsibility per file.

`.claude/rules/testing.md`:

```markdown
## Testing rules
- Every new utility function gets a colocated Vitest test (foo.ts → foo.test.ts).
- Group related cases in `describe` blocks.
- Mock external APIs — never hit real endpoints in tests.
```

`.claude/rules/api-conventions.md`:

```markdown
## API rules
- Routes live in /app/api/. Validate every request body with Zod first.
- Return consistent errors: { error: string, code: string }.
- The auth check is the first statement in every protected route.
```

## Note on `.claude/rules/`

A `rules/` folder is only loaded automatically if your Claude Code version
supports a dedicated rules layer (rules can also be *path-scoped* to load only
when Claude touches matching files). The portable, always-works approach is the
explicit `@import` shown above — it behaves identically across versions.
