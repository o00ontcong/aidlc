# Task Plan — Heat alert

## RED / GREEN Contract

`testHighTemperatureAlertRequiresThreshold` được thêm vào
`src/Tests/SkyCastTests/ForecastStoreTests.swift`. Trước implementation, test
phải fail do `ForecastStore` chưa phát hành alert; không được fail bởi compile,
import hay test discovery. Sau implementation, cùng test và full suite phải
xanh.

## Tasks

| ID | Work | Layer | Files | Rule / AC |
|---|---|---|---|---|
| T-1 | Model một heat alert có ngưỡng và nhiệt độ thực tế | Domain | `src/Sources/SkyCast/Domain/WeatherAlert.swift` | PATH-1, LAYER-1, CMD-1, CMD-2, AC-1, AC-2 |
| T-2 | Expose alert trong `ForecastStore` sau refresh | Data | `src/Sources/SkyCast/Data/ForecastStore.swift` | PATH-1, CMD-1, CMD-2, AC-1 |
| T-3 | Viết RED tests cho vượt ngưỡng và đúng ngưỡng | Test | `src/Tests/SkyCastTests/ForecastStoreTests.swift` | PATH-1, CMD-2, AC-1, AC-2, AC-4 |
| T-4 | Hiển thị alert từ store, không tái tính | Presentation | `src/Sources/SkyCast/Presentation/WeatherDashboardView.swift` | PATH-1, CMD-1, CMD-2, AC-3 |

## Execution Order

`T-3 (RED) → T-1 → T-2 → T-4 → full swift test`

## Scope Boundary

Không sửa `WeatherProviding`, không thêm network, không đổi refresh error copy.
