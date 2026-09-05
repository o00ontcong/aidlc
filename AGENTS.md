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

## Webview rebuild before done

Applies when editing `packages/extension/src/webview/**/*.{tsx,ts,css}`.

F5 alone does **not** guarantee a fresh UI. The Extension Host loads
`packages/extension/out/webviews/*.js`. Editing TSX/CSS without rebuilding
leaves a stale bundle — users will still see the old UI after F5.

After any webview UI change:

1. Run `pnpm --filter aidlc-o00ontcong bundle:webviews` (or `compile`).
2. Confirm `packages/extension/out/webviews/workspace.js` (or the relevant
   entry) is **newer** than the edited source before reporting done.
3. Do **not** tell the user to only F5 after source edits with no rebuild.

Optional while iterating: `cd packages/extension && pnpm watch`.
