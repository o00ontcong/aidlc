---
name: scan-project
description: Kiểm kê repo thật — module, layer, lệnh build/test, entry point. Viết PROJECT-SCAN.md.
---

# Scan Project

Load persona: `.claude/agents/project-architect.md`

Bước 1/5 của `project-foundation`. Nhiệm vụ: **ghi lại repo đang thật sự là gì**, không phải nó nên là gì.

## Nguyên tắc

- **Reality-only.** Không đề xuất, không phán xét. Chuẩn hoá là việc của `/standardize-structure`.
- **Mọi con số phải có nguồn.** Số file đếm bằng lệnh; lệnh build trích từ file thật.
- Không chắc → ghi vào `## Unknowns`, đừng đoán cho đủ bảng.

## Read first

1. `src/AGENTS.md` — quy ước app do người viết
2. `src/docs/ARCHITECTURE.md` — tầng và luồng
3. `src/Package.swift` — target, platform, dependency

## Cách quét (đừng đọc tràn lan)

```bash
find src/Sources -name '*.swift' | sort          # danh sách file
grep -rc "" src/Sources --include='*.swift'      # số dòng mỗi file
grep -rho "^import .*" src/Sources | sort -u     # phụ thuộc ngoài
```

## Output

`docs/project/context/PROJECT-SCAN.md`, bắt buộc có:

- `## Repository Layout` — cây thư mục cấp 1–2, mỗi mục một dòng vai trò
- `## Modules` — bảng: Module | Vai trò | Layer | Phụ thuộc | Đường dẫn
- `## Build and Test Commands` — lệnh **copy-paste chạy được**, kèm nguồn. Chưa chạy thử thì đánh dấu `(chưa verify)`
- `## Entry Points` — kiểu public là cửa vào của library
- `## Unknowns` — mỗi dòng một câu hỏi cụ thể cho human

## Rules

- Chỉ ghi `PROJECT-SCAN.md`, không sửa file nào khác
- Không viết code, không refactor
- Con số không có lệnh chứng minh → đẩy xuống `## Unknowns`
