# Architecture Principles

> Human-owned Intent. Agents may only read this file.
> Invariants default to `advisory` at bootstrap; raise to `blocking` after baseline cleanup.

## Invariants

### INV-1 — Intent stays at project tier

- **Rule:** Feature and package work inherit charter goals and constraints; they must not redefine project north-star intent.
- **Scope:** `docs/project/charter/**`, `docs/epics/**/artifacts/**`
- **Severity:** advisory

## Protected Paths

- `docs/project/charter/**`
