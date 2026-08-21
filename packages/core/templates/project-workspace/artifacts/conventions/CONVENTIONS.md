# Conventions

> Human-owned operating Intent (Bước 0). Describes how this repo must work.
> Distinct from `docs/project/context/ENGINEERING-RULES.md` (Reality — how the repo currently works).

## Stack and patterns

- Prefer existing packages, patterns, and module boundaries already in the repo.
- Do not invent parallel frameworks when an in-repo convention already exists.

## Hands off

- Do not edit `docs/project/charter/**` from feature or package agents.
- Do not weaken protected paths or required quality gates without a charter amendment.

## Quality commands

Document the exact commands used locally/CI (fill in for this repo):

- **test:** _(e.g. `pnpm test`)_
- **lint:** _(e.g. `pnpm lint`)_
- **typecheck:** _(e.g. `pnpm compile`)_

## Style

- Match surrounding code style; avoid drive-by refactors.
- Keep commits small and focused (one idea per package when possible).

## Commit and PR

- Conventional commits recommended (`feat:`, `fix:`, `docs:`, …).
- Ship via pull request to the default branch; agents must not merge `main`/`master`.
