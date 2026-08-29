# Task Plan — Heat alert (needs revision)

## RED / GREEN Contract

Kế hoạch này bị reject để demo revision flow. Hãy sửa nó bằng feedback đang có
trong task state, rồi submit Canvas round mới.

## Tasks

| ID | Work | File |
|---|---|---|
| T-1 | Define alert ownership | `ForecastStore.swift` |
| T-2 | Add deterministic tests | `ForecastStoreTests.swift` |

## Applicable Project Rules

- `PATH-1`: production và test files giữ trong SwiftPM targets.
- `LAYER-1`: Domain không import SwiftUI.
- `CMD-1`: production change phải build.
- `CMD-2`: full Swift test suite phải xanh.

## Còn thiếu (chính là feedback đang chờ xử lý)

- Chưa nói rõ ngưỡng nhiệt thuộc `City` hay thuộc policy.
- Chưa liên kết từng acceptance criterion với một test Swift cụ thể.
