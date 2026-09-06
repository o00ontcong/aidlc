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

## Quy tắc UI cho packages/extension: không dùng native input widget

Khi viết code cho extension VS Code này (`packages/extension`), **không bao giờ**
dùng `vscode.window.showInputBox` hoặc `vscode.window.showQuickPick` để hỏi
người dùng nhập liệu cho các luồng nghiệp vụ của AIDLC Workspace (ví dụ: lý do
publish, tên epic, cấu hình bước...). Đây là quick-input gốc của VS Code (cùng
loại UI với Command Palette) — nó nổi tách biệt khỏi webview, không theo theme
riêng của AIDLC, và tạo trải nghiệm không nhất quán.

Thay vào đó, dựng dialog/popup **bên trong webview**, theo mẫu các component đã
có ở `packages/extension/src/webview/components/` (`Modal.tsx` và các
`*Modal.tsx` / `*Dialog.tsx` khác, ví dụ `ConfirmModal.tsx`,
`DiscoverCommitModal.tsx`, `RenameModal.tsx`). Nếu chưa có modal phù hợp cho
luồng mới, tạo component mới theo đúng pattern đó thay vì gọi `showInputBox`.

Ngoại lệ hợp lệ: các thao tác thuần túy của VS Code core không liên quan tới
webview (ví dụ file picker hệ thống `showOpenDialog`). Nếu không chắc một
trường hợp có phải ngoại lệ hay không, hỏi lại người dùng trước khi dùng native
widget.
