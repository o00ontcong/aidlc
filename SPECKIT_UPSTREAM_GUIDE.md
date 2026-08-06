# Spec Kit gốc (github/spec-kit) — lệnh, input, output

Tài liệu tham khảo về **Spec Kit upstream**, không phải bản port `speckit-full` trong AIDLC.
Mục đích: biết chính xác mỗi lệnh gốc nhận gì và sinh ra gì, để đối chiếu khi dùng bản AIDLC.

> Nội dung lấy từ docs upstream ngày **2026-08-06**. Spec Kit thay đổi khá nhanh
> (`converge` và `taskstoissues` là các lệnh mới) — kiểm tra lại nguồn ở cuối file
> trước khi tin vào chi tiết cụ thể.

## Pipeline

```
constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge
```

- `taskstoissues` là nhánh phụ chạy sau `tasks`.
- `clarify`, `checklist`, `analyze` là quality gate **tùy chọn**.
- Chỉ `specify` là bắt buộc trước `plan`.

Bootstrap trước khi dùng slash commands:

```bash
specify init my-project --integration claude
```

Các lệnh CLI khác: `specify extension add <name>`, `specify preset add <name>`,
`specify bundle install <id>`.

## Bảng input / output

| Lệnh | Text gõ kèm | Input (đọc) | Output (ghi) |
|---|---|---|---|
| `/speckit.constitution` | **Có — nguyên tắc project** | — (tạo mới) | `.specify/memory/constitution.md` |
| `/speckit.specify` | **Có — mô tả WHAT/WHY** | `constitution.md` (context) | `specs/NNN-feature-name/spec.md` + tạo thư mục feature (+ branch) |
| `/speckit.clarify` | Tùy chọn — hint vùng cần đào sâu | `spec.md` | `spec.md` cập nhật (thêm `## Clarifications`) |
| `/speckit.plan` | **Có — tech stack / kiến trúc** | `spec.md`, `constitution.md` | `plan.md`, `data-model.md`, `contracts/` |
| `/speckit.checklist` | Tùy chọn — domain (ux, security, api…) | `spec.md`, `plan.md` | `checklists/*.md` |
| `/speckit.tasks` | Không | `spec.md`, `plan.md`, `data-model.md`, `contracts/` | `tasks.md` |
| `/speckit.analyze` | Không | `spec.md`, `plan.md`, `tasks.md` | **Report trong chat — read-only, không ghi file** |
| `/speckit.taskstoissues` | Không | `tasks.md` | GitHub Issues (qua API) |
| `/speckit.implement` | Không | `tasks.md`, `checklists/`, mọi artifact trước | Source code + test files |
| `/speckit.converge` | Không | Codebase + toàn bộ artifact trong `specs/NNN-*/` | `tasks.md` (**append-only** — nối thêm việc còn thiếu) |

Tập file `plan` sinh ra phụ thuộc template trong `.specify/templates/` nên có thể
nhiều hơn ba file trên tùy phiên bản/preset.

## Ba lệnh thật sự cần viết mô tả tốt

Bảy lệnh còn lại không nhận free text — chúng đọc artifact đã có. Chỉ ba chỗ sau
là nơi quyết định chất lượng cả pipeline.

### 1. `constitution` — viết một lần cho cả repo

```
/speckit.constitution Create principles focused on code quality, testing standards,
user experience consistency, and performance requirements
```

Ví dụ upstream cụ thể hơn: *"Taskify is a Security-First application. All user
inputs must be validated…"*. Càng cụ thể càng tốt — đây là ràng buộc mọi lệnh sau
phải tuân theo.

### 2. `specify` — chỉ WHAT/WHY, tuyệt đối không nêu tech stack

```
/speckit.specify Develop Taskify, a team productivity platform where predefined
users create projects, add task cards, and move them across four columns…
```

### 3. `plan` — đây mới là chỗ đổ tech stack vào

```
/speckit.plan Use .NET Aspire with Postgres. The frontend is Blazor Server with
drag-and-drop boards…
```

`clarify` có thể lái hướng khi cần:

```
/speckit.clarify Focus on task card behavior — status changes, comment permissions,
and user assignment.
```

## Hai điểm dễ sai

1. **`analyze` không sửa gì cả.** Nó chỉ báo conflict/gap/ambiguity; muốn fix phải
   quay lại `specify` / `plan` / `tasks` rồi chạy lại. Đừng chờ nó tự vá.
2. **`converge` chạy lặp** cho đến khi báo `✅ Converged`. Mỗi lần nó so codebase
   với artifact rồi *nối thêm* task còn thiếu vào `tasks.md`, không xóa/ghi đè.

## Khác biệt so với bản port `speckit-full` trong AIDLC

| Điểm | Spec Kit gốc | AIDLC `speckit-full` |
|---|---|---|
| Số lệnh | 10 | 6 (`specify` → `clarify` → `plan` → `tasks` → `analyze` → `implement`) |
| Constitution | Lệnh riêng, free text, ghi `.specify/memory/constitution.md` | Không có lệnh; chọn `standard:` (`none`/`agile-lite`/`hybrid`/`iso-ieee`) một lần trong `.aidlc/workspace.yaml` |
| Nơi khai tech stack | Free text của `plan` | **`plan` không nhận free text** — phải nhồi vào epic brief ở `specify` |
| Vị trí artifact | `specs/NNN-feature-name/` | `docs/epics/<EPIC-ID>/artifacts/` |
| Tên artifact | `spec.md`, `plan.md`, `tasks.md` | `SPEC.md`, `PLAN.md`, `TASKS.md`, `ANALYSIS.md`, `IMPLEMENT-SUMMARY.md` |
| Argument của lệnh | Free text mô tả | Chỉ epic id (`/speckit-full-specify GH-68`) |
| `checklist` / `taskstoissues` / `converge` | Có | Không có |
| Gate | Người tự đọc report | `humanReview` + `autoReview` validator, có `dependsOn` chặn nhảy cóc |

Lý do AIDLC bỏ `constitution` khỏi cấp epic được ghi trong code tại
[`packages/core/src/presets/builtinWorkflows.ts:367`](packages/core/src/presets/builtinWorkflows.ts#L367):
constitution thuộc workspace standard, viết một lần cho mỗi repo, không lặp mỗi epic.

**Chỗ dễ vấp nhất khi chuyển từ Spec Kit gốc sang AIDLC:** quen gõ tech stack ở
`plan` thì sang AIDLC sẽ mất — vì `plan` chỉ đọc `SPEC.md`. Phải đưa vào
Description lúc **Start Epic**.

## Nguồn

- <https://github.com/github/spec-kit>
- <https://github.github.io/spec-kit/reference/agentic-sdd.html>
- <https://github.com/github/spec-kit/blob/main/docs/quickstart.md>
- <https://deepwiki.com/github/spec-kit/5-speckit-commands>
- <https://deepwiki.com/github/spec-kit/4.9-speckit.checklist-command>
