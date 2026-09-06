# Task Plan — Heat alert

## Files and Tests

- `src/Sources/SkyCast/Domain/WeatherAlert.swift` — model ngưỡng và nhiệt độ
- `src/Sources/SkyCast/Data/ForecastStore.swift` — publish alert sau refresh
- `src/Sources/SkyCast/Presentation/WeatherDashboardView.swift` — hiển thị alert từ store
- `src/Tests/SkyCastTests/ForecastStoreTests.swift` — test vượt ngưỡng và đúng ngưỡng

`testHighTemperatureAlertRequiresThreshold` nằm trong
`src/Tests/SkyCastTests/ForecastStoreTests.swift`. Full SwiftPM suite phải
xanh sau khi implement.

## Tasks

| ID | Work | Layer | Files | Rule / AC |
|---|---|---|---|---|
| T-1 | Model một heat alert có ngưỡng và nhiệt độ thực tế | Domain | `src/Sources/SkyCast/Domain/WeatherAlert.swift` | PATH-1, LAYER-1, CMD-1, CMD-2, AC-1, AC-2 |
| T-2 | Expose alert trong `ForecastStore` sau refresh | Data | `src/Sources/SkyCast/Data/ForecastStore.swift` | PATH-1, CMD-1, CMD-2, AC-1 |
| T-3 | Viết tests cho vượt ngưỡng và đúng ngưỡng | Test | `src/Tests/SkyCastTests/ForecastStoreTests.swift` | PATH-1, CMD-2, AC-1, AC-2, AC-4 |
| T-4 | Hiển thị alert từ store, không tái tính | Presentation | `src/Sources/SkyCast/Presentation/WeatherDashboardView.swift` | PATH-1, CMD-1, CMD-2, AC-3 |

## Execution Order

`T-1 → T-2 → T-3 → T-4 → full swift test`

## Scope Boundary

Không sửa `WeatherProviding`, không thêm network, không đổi refresh error copy.
