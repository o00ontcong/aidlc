---
name: ios-scan-project
description: Kiểm kê repo Swift thật — module, layer, lệnh build/test, entry point. Viết PROJECT-SCAN.md.
---

# Scan Project

Bước 1/5 của `aidlc-ios-foundation`. Nhiệm vụ: **ghi lại repo đang thật sự là gì**, không phải nó nên là gì.

Trong tài liệu này `<pkg>` = thư mục chứa `Package.swift` (hoặc `.xcodeproj` / `.xcworkspace`) —
thường là gốc repo hoặc `src/`. Xác định nó ở bước này rồi dùng nhất quán về sau.

## Nguyên tắc

- **Reality-only.** Không đề xuất, không phán xét. Chuẩn hoá là việc của bước `standardize-structure`.
- **Mọi con số phải có nguồn.** Số file đếm bằng lệnh; lệnh build trích từ file thật.
- Không chắc → ghi vào `## Unknowns`, đừng đoán cho đủ bảng.

## Read first

1. File quy ước do người viết ở gốc repo hoặc `<pkg>` — `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`
2. Tài liệu kiến trúc sẵn có, nếu có — `docs/ARCHITECTURE.md` hoặc tương đương
3. `<pkg>/Package.swift` (hoặc project/workspace file) — target, platform, dependency

## Cách quét (đừng đọc tràn lan)

```bash
find . -name 'Package.swift' -not -path '*/.build/*' | head          # xác định <pkg>
find <pkg> -name '*.swift' -not -path '*/.build/*' | sort            # danh sách file
grep -rc "" <pkg> --include='*.swift'                                # số dòng mỗi file
grep -rho "^import .*" <pkg> --include='*.swift' | sort -u           # phụ thuộc ngoài
```

## Output

`docs/project/context/PROJECT-SCAN.md`, bắt buộc có:

- `## Repository Layout` — cây thư mục cấp 1–2, mỗi mục một dòng vai trò. Ghi rõ `<pkg>` là thư mục nào.
- `## Modules` — bảng: Module | Vai trò | Layer | Phụ thuộc | Đường dẫn
- `## Build and Test Commands` — lệnh **copy-paste chạy được** (`swift build`, `swift test`, hoặc
  `xcodebuild …`), kèm nguồn và thư mục chạy. Chưa chạy thử thì đánh dấu `(chưa verify)`
- `## Entry Points` — app entry, scene, hoặc kiểu public là cửa vào của library
- `## Unknowns` — mỗi dòng một câu hỏi cụ thể cho human

## Rules

- Chỉ ghi `PROJECT-SCAN.md`, không sửa file nào khác
- Không viết code, không refactor
- Con số không có lệnh chứng minh → đẩy xuống `## Unknowns`
