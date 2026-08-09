# AIDLC Extension — Tóm tắt hiện trạng

> Tài liệu này mô tả phạm vi sản phẩm theo implementation hiện tại, không phải định hướng đề xuất.

## 1. Extension hiện tại thực chất là gì?

AIDLC khởi đầu như một visual workflow runner cho Claude CLI, nhưng hiện tại đã phát triển thành một “AI SDLC workbench” ôm gần như toàn bộ vòng đời phát triển phần mềm:

```text
Cấu hình agent
→ thiết kế pipeline
→ nhập requirement
→ lập kế hoạch epic
→ chạy agent
→ review artifact
→ test
→ theo dõi token/session
→ phân tích code
→ autonomous delivery
→ PR và hậu kiểm sau merge
```

Nó có 36 VS Code commands, khoảng 37.000 dòng source extension và nhiều subsystem tương đối độc lập.

## 2. Nền tảng cốt lõi ban đầu

Trung tâm của extension là `.aidlc/workspace.yaml`, gồm:

- `skills`: prompt/knowledge bằng Markdown.
- `agents`: model, runner và skills.
- `pipelines`: chuỗi agent steps cùng dependency/review gate.
- `recipes`: ánh xạ loại công việc sang pipeline.
- `epics`: work item gắn với pipeline.
- `runs`: trạng thái thực thi từng step.

Extension không trực tiếp gọi Anthropic API. Nó shell-out sang Claude CLI, truyền skill/prompt và lưu trạng thái xuống disk.

Về bản chất, phần cốt lõi là một UI để cấu hình, chạy và theo dõi các pipeline Claude có trạng thái.

## 3. Các bề mặt chính trong VS Code

### Sidebar

Sidebar hiển thị project/workspace, số lượng agents/skills/flows/epics, recent epics, active runs, workflow templates, MCP servers và các entry point cho Builder, requirements, Autopilot và Autonomous Delivery.

### Workspace Builder

Builder cho phép tạo, sửa, xóa và duplicate pipeline; quản lý agent/skill; reorder step; khai báo dependency, review gate và failure behavior; lưu hoặc apply workspace template.

Builder đã trở thành một webview host lớn. Riêng `workspaceWebview.ts` có khoảng 4.884 dòng và handler trung tâm dispatch khoảng 75 loại hành động.

### Epics và runs

Người dùng có thể mô tả công việc, classify task, chọn recipe/pipeline, scaffold epic, chạy từng step, approve, reject, rerun, gửi feedback, verify run và tạo report. Đây là một state machine có persistence, không chỉ là launcher cho Claude.

## 4. Workflow và preset

Extension ship ba hướng workflow chính:

- `AIDLC Workflow`: SDLC pipeline tổng quát.
- `Spec Kit`: specify → clarify → plan → tasks → analyze → implement.
- `Cohesive Delivery`: project context → feature contract → parallel work packages → integration → PR → project sync.

Agent và skill đồng thời có thể đến từ:

- `.aidlc/workspace.yaml`.
- `.claude/` trong project.
- `~/.claude/` global.

Ba nguồn này có discovery và precedence riêng.

## 5. Requirement và project planning

Extension đã mở rộng sang:

- Import requirement từ file hoặc external tracker.
- Tạo `requirements.md`.
- Analyze requirement thành tasks.
- Smart Start Epic.
- Recipe classification.
- SDLC standard: `none`, `agile-lite`, `hybrid`, `iso-ieee`.
- Traceability giữa requirement, acceptance criteria, test và result.
- Charter, alignment và project context.

Extension vì vậy không còn chỉ chạy pipeline; nó đang cố định nghĩa cả phương pháp quản trị requirement và SDLC.

## 6. Artifact review

Extension bundle một hệ thống review tài liệu riêng:

- Render Markdown thành HTML.
- Mở trong Annotron.
- Point-and-click annotation.
- Conversation và feedback round.
- Gửi feedback lại cho Claude để sửa Markdown.
- Revision history.
- Epic memory và auto-load memory.

Đây gần như là một sản phẩm document review nằm bên trong workflow runner.

## 7. Testing

Extension tích hợp `aidlc-testagent`/`ata` để đọc `testagent.config.yaml`, plan/run từng test target và validate toàn bộ. Testing là một hệ thống bên ngoài được nhúng vào Builder, chưa phải execution primitive thống nhất của AIDLC.

## 8. Monitoring và observability

Extension còn quản lý token usage, cost estimation, Claude transcript insights, cache/context chart, hook errors, tool usage, agent history, OTel receiver và agents-observe integration.

Đây là một sản phẩm observability khác được gắn vào cùng extension.

## 9. AST Graph

Extension tải và quản lý binary `ast-graph`, scan codebase, watch source changes, rescan theo git state, đăng ký MCP server và hiển thị report webview riêng. Đây là một code-intelligence subsystem độc lập.

## 10. Autonomous Delivery

Autonomous Delivery cố gắng tự infer Project Context, tạo feature contract, chia work packages, chạy worker, integrate, test, mở PR, gom human review, rework có chọn lọc và đồng bộ project context sau merge.

Phần này không còn là generic pipeline builder; nó hard-code một delivery workflow và artifact contract cụ thể vào core.

## 11. Demo, onboarding và hỗ trợ

Extension còn chứa demo project, demo epic, walkthrough, Getting Started guide, Ask AIDLC, Claude terminal launcher, MCP health status, tech-stack detection, migration tools, preset installer/upgrader và validator reconciliation.

## 12. Hướng sản phẩm thể hiện trong code

Implementation hiện tại đang cố trở thành đồng thời:

1. Visual pipeline builder.
2. Agent/skill manager.
3. Workflow execution engine.
4. Epic/project manager.
5. Requirements tool.
6. SDLC compliance engine.
7. Document review system.
8. Test automation frontend.
9. Claude monitoring dashboard.
10. Code intelligence/AST product.
11. Autonomous delivery orchestrator.
12. PR/release governance tool.

Tuyên bố sản phẩm vẫn là “Drive Claude through any pipeline you declare”, nhưng implementation thực tế đang tiến về một hệ điều hành SDLC áp đặt workflow, artifacts, review, testing, context management, observability và delivery policy.

Generic pipeline runner cần đơn giản, composable và ít opinion. SDLC operating system cần opinion mạnh, data model thống nhất và UX chuyên sâu. Extension đang giữ cả hai nhưng chưa có kiến trúc phân lớp rõ ràng.

## 13. Dấu hiệu lệch hướng

- `workspace.yaml` được tuyên bố là source of truth, nhưng agent/skill còn đến từ `.claude` và `~/.claude`.
- Builder là UI cấu hình generic, trong khi Cohesive Delivery hard-code workflow cụ thể.
- Epic, run và autonomous delivery có ba lớp state chồng lên nhau.
- Có cả per-step review, aggregate review và browser annotation review.
- Có nhiều entry point để chạy việc: Start Epic, Start Run, slash command, Autopilot, Autonomous Delivery, terminal và CLI.
- Extension vừa muốn giấu YAML, vừa yêu cầu người dùng hiểu pipeline, validator, artifact contract và state machine.
- Testing, AST graph, monitoring và Annotron có thể là module/plugin riêng nhưng hiện nằm chung một package.
- UI phản ánh cấu trúc nội bộ thay vì một user journey đơn giản.

Vấn đề chính không phải thiếu tính năng mà là thiếu ranh giới và kiến trúc sản phẩm thống nhất cho ba vai trò: workflow runner, SDLC framework và autonomous engineering system.
