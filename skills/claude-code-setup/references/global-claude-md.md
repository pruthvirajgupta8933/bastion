# Global `CLAUDE.md` template

Lives at `~/.claude/CLAUDE.md`. Loaded in **full** into every session, so keep it
tight (~50–80 lines). Rules here should be true in *every* repo you touch — your
developer identity, not any one project's stack.

Belongs here: communication style, code-style defaults, commit format, package
manager preference, testing philosophy, and hard "never without asking"
guardrails.

Does **not** belong here: tech stack, folder structure, deploy scripts, framework
rules, credentials. Those are project scope.

```markdown
# ~/.claude/CLAUDE.md

## Communication
- Be concise — skip preambles and restated summaries.
- Never commit or push without my explicit confirmation.
- When a request is ambiguous, ask one sharp question rather than guessing.

## Code style
- Prefer functional patterns over class-based when both fit.
- Strict TypeScript — no `any`; prefer `const`, never `var`.
- Named exports for shared modules; default exports only for pages/entry points.

## Commits
- Conventional Commits: feat, fix, chore, docs, refactor, test.
- Subject line under 72 chars; imperative mood.
- Don't invent ticket/issue numbers — include one only if I provide it.

## Tooling
- Use the repo's existing package manager; if starting fresh, prefer pnpm.
- Match the surrounding code's style before introducing a new convention.

## Testing
- Suggest unit tests for new pure/utility functions.
- Never weaken or delete a test to make a suite pass — surface the failure.
```

## Notes

- Every line here is a permanent tax on your context window. If a rule only
  helps in one repo, move it to that repo's `CLAUDE.md`.
- Use `/context` to see what this file (and everything else) actually costs.
