# Cohesive Delivery — Tóm tắt hiện trạng

> **SUPERSEDED (2026-08-10).** Tài liệu này chụp hiện trạng *trước* redesign — commit
> `6c35cad` ("redesign cohesive delivery around independent epics") đã bỏ pipeline
> `cohesive-work-package` và toàn bộ dynamic-worker orchestration mô tả bên dưới, thay
> bằng mô hình independent-epics (2 pipeline: `project-context` + `cohesive-feature`
> 13 bước). Nhiều điểm ở §8 "đáng ngờ" chính là lý do dẫn tới redesign này. Hiện trạng
> thật xem tại [`packages/extension/media/guides/cohesive-delivery.md`](packages/extension/media/guides/cohesive-delivery.md).

> Tài liệu này mô tả implementation hiện tại, không phải thiết kế mục tiêu.

## 1. Mục tiêu hiện tại

Cohesive Delivery cố gắng triển khai một feature trên project có sẵn bằng ba tầng context liên kết:

```text
Project Context
  ↓ snapshot
Feature Contract
  ↓ chia package
Work Packages chạy song song
  ↓ kết quả
Integration → Test → PR → Human merge → Project sync
```

Nó gồm ba pipeline:

1. `project-context`: 7 bước.
2. `cohesive-feature`: 14 bước.
3. `cohesive-work-package`: 7 bước cho mỗi package.

Tổng cộng tối thiểu 28 bước nếu chỉ có một work package.

## 2. Project Context — 7 bước

Mục đích là tạo “sự thật chung” cấp project:

1. `define-charter`: tạo North Star, nguyên tắc kiến trúc, tech policy, charter và conventions.
2. `scan-project`: quét cấu trúc repo và quality commands.
3. `model-project`: dựng architecture map, domain model, shared contracts và engineering rules.
4. `check-drift`: so sánh code thực tế với charter.
5. `review-context`: review tính đúng đắn của context.
6. `publish-context`: phát hành `CONTEXT-MANIFEST.json`.
7. `project-rules-sync`: ghi charter/conventions vào `CLAUDE.md`, `AGENTS.md` và Cursor rules.

Autonomous mode dùng chiến lược `infer-or-refresh`: AI tự suy luận context của project hiện có thay vì bắt người dùng trả lời toàn bộ ngay từ đầu.

## 3. Feature Coordinator — 14 bước

Pipeline feature chịu trách nhiệm lập kế hoạch và điều phối, không trực tiếp làm toàn bộ implementation:

1. `capture-context`: chụp snapshot Project Context.
2. `specify`: tạo `SPEC.md`.
3. `clarify`: xử lý điểm chưa rõ.
4. `plan`: tạo implementation plan.
5. `tasks-package`: chia việc thành các work package.
6. `analyze-contract`: kiểm tra coverage và đóng băng `FEATURE-CONTRACT.md`.
7. `await-packages`: chờ kết quả các worker.
8. `integrate`: tích hợp các package.
9. `integration-context`: mô tả hành vi sau tích hợp.
10. `cohesion-review`: review feature sau tích hợp.
11. `system-test`: chạy quality commands cấp project.
12. `open-pr`: mở đúng một PR cấp feature.
13. `await-merge`: chờ con người merge.
14. `project-sync`: sau merge, cập nhật Project Context theo code mới.

Agent không được merge default branch.

## 4. Work Package — 7 bước cho mỗi worker

Mỗi package được kỳ vọng chạy trong branch/worktree riêng:

1. `load-package`: tải contract và phạm vi package.
2. `prepare-worktree`: kiểm tra branch/worktree.
3. `package-test-plan`: viết test plan hoặc failing tests trước.
4. `implement-package`: implement trong phạm vi ownership.
5. `package-test`: chạy test của package.
6. `package-review`: reviewer độc lập kiểm tra diff và test.
7. `publish-result`: tạo `PACKAGE-RESULT.json` để coordinator sử dụng.

Các package được chạy thành từng wave bằng `Promise.all`, giới hạn mặc định ba worker song song.

## 5. Autonomous Delivery thực tế làm gì

Khi người dùng bấm Start:

1. Kiểm tra ba pipeline bắt buộc đã được cài.
2. Nhận ID, title và requirement.
3. Tạo delivery state.
4. Chạy hoặc refresh Project Context.
5. Chạy phần đầu của feature đến `analyze-contract`.
6. Đọc `WORK-PACKAGES.json`.
7. Tạo và chạy các worker.
8. Thu `PACKAGE-RESULT.json`.
9. Chạy integration, cohesion review, system test và mở PR.
10. Dừng tại aggregate human review.
11. Người dùng merge PR thủ công.
12. Người dùng chạy “Complete after merge” để thực hiện `project-sync` và hoàn tất.

Nếu delivery ID đã tồn tại, Start hiện dùng lại state cũ và resume thay vì tạo trùng.

## 6. Human review và rework

Thay vì dừng ở từng `human_review`, autonomous mode defer chúng vào một review bundle tổng hợp:

- `HUMAN-REVIEW-SUMMARY.md`
- `HUMAN-REVIEW-TASKS.json`

Người dùng có thể:

- Mở review summary.
- Thêm correction task.
- Sửa inferred Project Context.
- Chạy rework.
- Hoàn tất sau khi PR đã merge.

Rework hiện route task bằng từ khóa:

- Context/architecture/charter → Project Context.
- Requirement/scope → `specify`.
- Plan/design → `plan`.
- Package/ownership → `tasks-package`.
- Integration/conflict → `integrate`.
- Nếu không khớp → worker đầu tiên hoặc integration.

Sau đó hệ thống reopen một step đã approved và rerun downstream tương ứng.

## 7. State và artifact

State chính:

- `.aidlc/deliveries/<delivery-id>/state.json`
- `.aidlc/runs/*.json`

Artifact cấp project:

- `docs/project/charter/`
- `docs/project/context/`
- `docs/project/conformance/`

Artifact cấp feature/package:

- `docs/epics/<run-id>/artifacts/`

Review bundle được ghi cả trong delivery directory và feature artifacts khi feature run đã tồn tại.

## 8. Những điểm đáng ngờ trong hiện trạng

- Có quá nhiều bước và artifact trước khi tạo ra giá trị thực tế.
- “Autonomous” phụ thuộc mạnh vào file Markdown, validator và state trung gian.
- Readiness chỉ kiểm tra ID pipeline và số lượng step, không kiểm tra đúng step, version hay validator.
- Project Context vừa muốn infer tự động vừa chứa nhiều human-review semantics.
- Routing rework bằng regex từ khóa dễ chọn sai pipeline hoặc step.
- Parallelism chủ yếu nằm ở orchestration; isolation thực sự phụ thuộc agent và validator.
- Validator `.aidlc-new` có thể chặn toàn bộ delivery trước khi nó chạy.
- UI không thể hiện rõ delivery đang ở đâu, worker nào đang chạy và hành động tiếp theo là gì.
- Start, Resume, Review, Rework và After Merge là các thao tác rời, buộc người dùng hiểu state machine nội bộ.
- Profile autonomous bị hard-code vào `docs/epics`, aggregate review, một PR và human-only merge.
- Form UI chỉ thu ID, title và description; acceptance criteria, constraints và profile không được cấu trúc rõ.
- Review summary có thể được sinh khi pipeline lỗi nên chứa evidence rỗng hoặc gây hiểu nhầm.
