## ECC workflow standard (mandatory)

For new Idea UX, planning, delivery, and artifact work, treat the existing
Discovery/Idea presentation and its legacy terminology as compatibility input,
not as the design or file-format authority. New work follows ECC.

### Workflow gate

Use this sequence without skipping or merging evidence stages:

`research -> plan -> human approval -> test (RED) -> implement (GREEN) -> refactor -> fresh-context review -> verify -> remember -> improve`

- Research relevant repository patterns before planning. If no matching pattern
  exists, say so instead of inventing one.
- Write and review the plan before production-code changes.
- Wait for explicit human approval of the exact plan revision. Canvas approval
  may supply that verdict; an agent verdict may not.
- Convert approved behavior into tests and capture RED evidence before the
  implementation that makes them GREEN.
- Review from fresh context, then run final verification separately from the
  implementation claim.
- Preserve decisions and evidence. Promote a lesson into a reusable rule only
  when it is confirmed and broadly applicable.

### Plan artifact format

When a plan is written to disk, use
`.claude/plans/{kebab-case-name}.plan.md` and this heading order:

1. `# Plan: {Feature Name}`
2. `**Source PRD**`, `**Selected Milestone**`, `**Complexity**`
3. `## Summary`
4. `## Patterns to Mirror` with `Category | Source | Pattern`
5. `## Files to Change` with `File | Action | Why`
6. `## Tasks`; every task contains `Action`, `Mirror`, and `Validate`
7. `## Validation` with project-specific commands
8. `## Risks` with `Risk | Likelihood | Mitigation`
9. `## Acceptance` with checkboxes for task completion, validation, and pattern
   conformance

Source code continues to follow the repository's language and framework
conventions. The structure above is mandatory for implementation-plan
artifacts; do not create competing PRD/Shape/Epic plan formats for new ECC work.

<!-- aidlc:ast-graph:start -->
## ast-graph (managed by AIDLC extension — do not edit by hand)

This project has a pre-built AST graph at `.ast-graph/graph.db`, exposed via the
`ast-graph` MCP server (auto-registered by the AIDLC VS Code extension). The
graph stores every function/class/method/import in the codebase plus their
caller→callee edges, so structural questions can be answered without grepping.

**Prefer ast-graph tools over grep/read when the question is structural.** A
single MCP call is typically 10–50 tokens; the equivalent grep+read sweep across
a 500-file repo is 5k–50k.

Reach for ast-graph first for:
- "where is X defined / who calls X / what does X call" → ast-graph `symbol`
- "if I change X, what breaks" → ast-graph `blast-radius`
- "what does this PR touch structurally" → ast-graph `changed-symbols`
- "find unreferenced code" → ast-graph `dead-code`
- "list HTTP endpoints" → ast-graph `routes`
- "where are the architectural hotspots" → ast-graph `hotspots`
- "fuzzy find a symbol by partial name" → ast-graph `search`

Keep using grep/read/edit for:
- reading function bodies, comments, docstrings (graph stores skeletons, not source)
- editing or refactoring code
- following intent, naming, or non-AST signals (config files, prose)

If the graph looks stale, ask the user to run `AIDLC: Rescan AST Graph`. The
extension also rescans automatically a few seconds after any source file save.
<!-- aidlc:ast-graph:end -->
