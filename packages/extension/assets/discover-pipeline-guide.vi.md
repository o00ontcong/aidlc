# Hướng dẫn tab Discover

Discover đưa **một ý tưởng** đi qua 12 bước cho tới khi có đủ bộ khung để bắt
đầu code, và ghi mọi thứ vào các file Markdown trong `docs/` của chính dự án.

> **Các file `.md` trong `docs/` là source of truth.** Không có database nào phía
> sau. Ứng dụng chỉ giữ một sidecar ở `.aidlc/discover/` gồm: bước hiện tại,
> hash từng file, ai viết từng mục, và một snapshot cho mỗi lần chạy agent.
> Xoá cả thư mục đó thì mất undo và mất provenance — **không mất một chữ nào**
> của tài liệu.

---

## 1. Vì sao pipeline này

Nếu mục tiêu là **từ một idea → ra được bộ khung project đủ rõ để bắt đầu code**, đặc biệt khi dùng AI coding agent, tôi khuyên đi theo pipeline:

**Idea → Product Definition → Requirements → Features → Use Cases → Architecture → Data/API → UI Flow → Project Structure → Implementation Plan → Skeleton**

Ví dụ quy trình đầy đủ:

1. **Idea — Ý tưởng**
   Xác định 4 thứ trước:

   * App giải quyết vấn đề gì?
   * Ai sử dụng?
   * Giá trị chính là gì?
   * MVP nhỏ nhất là gì?

   Ví dụ:

   > App xem video hỗ trợ 2 subtitle cùng lúc.

2. **Product Definition — Định nghĩa sản phẩm**
   Viết một file kiểu `PRODUCT.md`:

   ```text
   Problem
   Target users
   Core value
   Platforms
   MVP scope
   Out of scope
   Future features
   ```

3. **Requirements — Yêu cầu**
   Chuyển idea thành yêu cầu có thể kiểm chứng.

   Ví dụ:

   ```text
   FR-01: User can open local video.
   FR-02: User can load subtitle #1.
   FR-03: User can load subtitle #2.
   FR-04: Both subtitles display simultaneously.
   FR-05: Each subtitle can adjust timing offset.
   ```

   Đồng thời có non-functional requirements:

   ```text
   Performance
   Security
   Offline
   Compatibility
   Accessibility
   Maintainability
   ```

4. **Feature Breakdown — Chia feature**

   ```text
   Video
   ├── Open video
   ├── Play/Pause
   ├── Seek
   └── Playback speed

   Subtitle
   ├── Load subtitle
   ├── Parse SRT
   ├── Sync
   ├── Offset
   └── Style

   Settings
   ├── Font size
   ├── Font color
   └── Background
   ```

5. **Use Cases — Luồng nghiệp vụ**
   Mỗi feature quan trọng chuyển thành use case:

   ```text
   UC01 OpenVideo
   UC02 LoadSubtitle
   UC03 PlayVideo
   UC04 SeekVideo
   UC05 ChangeSubtitleOffset
   UC06 ChangeSubtitleStyle
   ```

   Đây là bước rất quan trọng vì nó biến "feature" thành **hành vi hệ thống**.

6. **User Flow / Screen Flow**
   Xác định user đi qua app thế nào:

   ```text
   Launch
      ↓
   Home
      ↓
   Select Video
      ↓
   Player
      ├── Subtitle 1
      ├── Subtitle 2
      └── Settings
   ```

7. **Architecture**
   Sau khi biết use case mới chọn kiến trúc.

   Ví dụ iOS:

   ```text
   Presentation
        ↓
   Domain
        ↓
   Data
        ↓
   Infrastructure
   ```

   Có thể chọn:

   ```text
   MVVM
   + Clean Architecture
   + DI
   + Repository
   + Coordinator/Router
   ```

   Không nên làm ngược kiểu **chọn Clean Architecture trước rồi mới cố nhét idea vào architecture**.

8. **Data / API / Storage**
   Xác định:

   ```text
   Entities
   Models
   Repository interfaces
   API endpoints
   Local database
   Cache
   File storage
   UserDefaults/Keychain
   ```

   Ví dụ:

   ```text
   Video
   Subtitle
   SubtitleCue
   SubtitleStyle
   PlaybackState
   ```

9. **Technical Decisions**
   Tạo `TECH_STACK.md` hoặc ADR:

   ```text
   Language: Swift
   UI: SwiftUI
   Video: AVPlayer
   Subtitle parser: internal module
   Persistence: SwiftData
   DI: native DI
   Testing: XCTest
   ```

   Quan trọng là ghi luôn **tại sao chọn**.

10. **Project Structure**
    Lúc này mới thiết kế folder/module:

```text
App/
├── Application/
├── Core/
│   ├── Domain/
│   ├── Data/
│   └── Infrastructure/
│
├── Features/
│   ├── Home/
│   ├── Player/
│   ├── Subtitle/
│   └── Settings/
│
├── Shared/
└── Resources/
```

11. **Implementation Plan**
    Không đưa toàn bộ project cho AI code một lần.

Chia thành dependency order:

```text
Phase 1 — Project skeleton
Phase 2 — Core models
Phase 3 — Video playback
Phase 4 — Subtitle parsing
Phase 5 — Dual subtitle
Phase 6 — Subtitle customization
Phase 7 — Persistence
Phase 8 — Testing
Phase 9 — Polish
```

12. **Generate Skeleton**
    Đến đây mới tạo project thật:

```text
project
├── source folders
├── modules
├── protocols/interfaces
├── base models
├── DI container
├── navigation
├── config
├── tests
└── README
```

### Tôi sẽ rút gọn thành framework này

```text
                    IDEA
                      │
                      ▼
             PRODUCT DEFINITION
                      │
                      ▼
                REQUIREMENTS
                      │
             ┌────────┴────────┐
             ▼                 ▼
          FEATURES       NON-FUNCTIONAL
             │
             ▼
          USE CASES
             │
        ┌────┴─────┐
        ▼          ▼
    USER FLOW    DATA MODEL
        │          │
        └────┬─────┘
             ▼
        ARCHITECTURE
             │
             ▼
       TECH DECISIONS
             │
             ▼
      PROJECT STRUCTURE
             │
             ▼
    IMPLEMENTATION PLAN
             │
             ▼
      PROJECT SKELETON
             │
             ▼
        START CODING
```

**Đặc biệt khi dùng AI để code**, tôi sẽ thêm một tầng tài liệu ở giữa Architecture và Coding:

```text
docs/
├── product/
│   ├── PRODUCT.md
│   ├── REQUIREMENTS.md
│   └── FEATURES.md
│
├── architecture/
│   ├── ARCHITECTURE.md
│   ├── MODULES.md
│   ├── DATA_FLOW.md
│   └── ADR/
│
├── development/
│   ├── CODING_RULES.md
│   ├── TESTING_RULES.md
│   └── GIT_WORKFLOW.md
│
└── plans/
    └── IMPLEMENTATION_PLAN.md
```

Như vậy coding agent không phải **đoán** product, architecture hay coding convention mỗi lần làm task.

Nếu làm nghiêm túc một project mới, tôi xem **`Project Skeleton` là output của quá trình phân tích**, chứ không phải điểm bắt đầu. Với workflow dùng AI, phần từ **Idea → Requirements → Architecture → Implementation Plan** thường quyết định chất lượng code nhiều hơn việc chọn agent nào.

---

## 2. 12 bước và file tương ứng

`docsRoot` mặc định là `docs/`. Mỗi bước sở hữu đúng những file dưới đây; agent
không được đụng file của bước khác.

| # | Bước | File | Xong khi |
|---|---|---|---|
| 1 | Idea | `product/IDEA.md` | Có Problem, ≥1 user, Core value, Minimum MVP |
| 2 | Product Definition | `product/PRODUCT.md` | Problem, ≥1 target user, Core value, ≥1 MVP scope |
| 3 | Requirements | `product/REQUIREMENTS.md` | ≥3 functional, ≥1 non-functional |
| 4 | Features | `product/FEATURES.md` | ≥1 feature; **mọi FR được một feature phủ** |
| 5 | Use Cases | `product/USE_CASES.md` | ≥1 use case, mỗi cái đủ Actor/Trigger/Main flow |
| 6 | User Flow | `product/USER_FLOWS.md` | ≥1 screen, ≥1 flow, mọi UC xuất hiện trong một flow |
| 7 | Data Model | `architecture/DATA_MODEL.md` | ≥1 entity, mỗi entity liệt kê field |
| 8 | Architecture | `architecture/ARCHITECTURE.md`, `MODULES.md`, `DATA_FLOW.md` | ≥2 layer, có Rationale, ≥2 module có responsibility |
| 9 | Tech Decisions | `architecture/TECH_STACK.md`, `architecture/ADR/` | ≥3 lựa chọn stack đều có lý do, ≥1 ADR |
| 10 | Project Structure | `architecture/PROJECT_STRUCTURE.md` | Có cây thư mục, mọi module được map |
| 11 | Implementation Plan | `plans/IMPLEMENTATION_PLAN.md` | ≥3 phase, mỗi phase có Goal và Deliverables |
| 12 | Project Skeleton | `plans/SKELETON.md` | ≥1 file/folder cần tạo |

Ngoài 12 bước còn có `development/CODING_RULES.md`, `TESTING_RULES.md`,
`GIT_WORKFLOW.md` — sinh bằng nút **Sinh tài liệu phát triển** sau khi đã chốt
tech stack.

Phần trăm trên mỗi bước chỉ tính rule **bắt buộc**. Một rule kiểu "mọi module đã
được map" khi chưa có module nào thì không tính vào phần trăm — nó chưa có gì để
kiểm tra, chứ không phải đã đạt.

## 3. Hợp đồng định dạng Markdown

Định dạng vừa để người đọc/sửa tay, vừa để ứng dụng sửa đúng một dòng mà không
format lại cả file.

- `#` là tiêu đề tài liệu, `##` là section — **chỉ dùng các heading trong bảng
  của mỗi bước**.
- Mục dạng danh sách:

  ```markdown
  ## Functional requirements

  - **FR-01** — User có thể mở video local.
  - **FR-02** — User có thể nạp subtitle #1.
  ```

- Mục nhiều trường (use case, phase, entity, ADR, stack) dùng `###` + bullet có nhãn:

  ```markdown
  ### UC-01 — Open video

  - **Actor:** người dùng cuối
  - **Trigger:** bấm "Mở video" — FR-01
  - **Main flow:**
    - Chọn file từ Files
    - Player nạp và hiển thị khung đầu
  ```

- **ID là bất biến.** Sửa nội dung thì được; đổi hoặc dùng lại ID thì không.
- **Liên kết tài liệu bằng cách nhắc ID.** Viết `FR-01` ở bất kỳ đâu trong một
  feature/use case/flow/phase là đã tạo liên kết — không có cú pháp riêng nào
  để học.
- **Mọi thứ ngoài các heading trên là của bạn.** Section bạn tự thêm, ghi chú,
  khối mermaid — parser giữ nguyên từng byte và agent bị cấm đụng vào.

## 4. Vòng lặp agent

```text
Chạy agent → app snapshot docs → mở terminal provider
   → agent sửa thẳng file .md → app phát hiện thay đổi
   → diff theo từng mục + kiểm tra guardrail
   → bạn: Giữ · Hoàn tác từng mục · Hoàn tác cả run
```

Hai chế độ, app tự chọn:

| Chế độ | Khi nào | Agent làm gì |
|---|---|---|
| **fill** | File của bước còn trống | Viết đủ mọi section, cấp ID từ `01` |
| **refine** | File đã có nội dung | Chỉ thêm mục thiếu, sửa mục sai, xoá mục lỗi thời — **giữ nguyên ID cũ**, không viết lại cả file |

Ba lệnh được cài sẵn cho provider:

```text
/aidlc-discover <step> [ghi chú]     — làm đúng một bước
/aidlc-discover-pipeline [ghi chú]   — tự đọc bước hiện tại, làm một bước rồi dừng
/aidlc-discover-dev-docs             — sinh development/*.md từ tech stack đã chốt
```

Sau mỗi run, app kiểm tra 6 guardrail và báo nếu bị vi phạm:

1. Đổi hoặc dùng lại một ID đã có.
2. Sửa hoặc xoá một mục đã **ghim**.
3. Xoá một mục do **bạn** viết.
4. Sửa hoặc xoá section của riêng bạn.
5. Xoá một section bắt buộc.
6. Đụng vào file không thuộc bước đang chạy.

Vi phạm không bị chặn ở mức file — nội dung vẫn nằm trên đĩa — nhưng hiện ngay
trong banner và trong màn Diff để bạn quyết định giữ hay hoàn tác.

**Ghim** là hợp đồng thật: mục đã ghim thì UI không cho sửa và guardrail báo nếu
agent chạm vào.

## 5. Kiểm tra và truy vết

Panel **Kiểm tra** tính lại mỗi lần tài liệu đổi:

- **Truy vết:** `FR → Feature → UC → Screen/Flow → Module → Phase`. Cảnh báo khi
  một FR chưa feature nào phủ, một UC chưa vào flow nào, hay một mục nhắc tới ID
  không tồn tại.
- **ID:** trùng, hoặc sai dạng của section.
- **Dòng không đúng định dạng:** báo là *không được theo dõi*, không tự sửa.
- **Lệch tầng:** tài liệu ở bước trước đổi sau khi tài liệu bước sau đã viết ⇒
  bước sau gắn `⚠` để bạn xem lại. App không tự sửa gì.

## 6. Bàn giao sang Epic

Ở bước 11 và 12 có khối **Bàn giao sang Epic**: **mỗi phase của Implementation
Plan thành một Epic riêng**, không đưa cả project cho agent làm một lần.

Khi tạo Epic, app ghi `INTENT.md` vào `artifacts/` của Epic đó, gồm: goal,
deliverables, definition of done, các phase phụ thuộc, mọi mục mà phase có nhắc
tới (đã tra ra nội dung), cộng product context, architecture, tech stack và cây
thư mục. **Đây là ảnh chụp** — sửa blueprint sau đó không làm đổi file này, vì
Canvas gate `requirement` của Epic đọc chính nó.

Recipe do bạn chọn (app chỉ gợi ý): `cofofo-bootstrap` cho phase dựng nền,
`cofofo-feature` cho phase thêm hành vi. Một phase chỉ bàn giao được một lần.

## 7. Quy tắc an toàn

1. **Agent không sở hữu workflow.** Nó không tự sang bước tiếp, không tự bàn
   giao Epic, không tạo code thật.
2. **Một lần chạy = một bước.** Agent không tự làm tiếp bước sau.
3. **Mọi thay đổi của agent đều có đường lui** cho tới khi bạn bấm *Giữ tất cả*
   — undo cả run hoặc undo đúng một mục.
4. **Sửa tay ngoài IDE luôn được nhận.** App theo dõi `docs/` và đọc lại; mục
   nào bạn sửa thì đổi nguồn thành `bạn`.
5. **Không màn hình nào khoá bạn khỏi file** — luôn có *Markdown thô* và *Mở
   trong editor*.

## 8. Checklist nhanh

- [ ] Nhập một câu mô tả sản phẩm để tạo blueprint.
- [ ] Với mỗi bước: chạy agent hoặc tự điền, xem diff, giữ hoặc hoàn tác.
- [ ] Ghim những mục bạn không muốn agent đụng tới.
- [ ] Xem panel Kiểm tra trước khi sang bước tiếp; sửa những cảnh báo còn ý nghĩa.
- [ ] Sang bước tiếp chỉ khi phần "Còn thiếu" đã sạch.
- [ ] Ở bước 9, sinh `development/*.md` cho coding agent.
- [ ] Ở bước 11, chia phase theo đúng thứ tự phụ thuộc.
- [ ] Bàn giao từng phase thành Epic, theo dõi tiếp ở tab Công việc.
