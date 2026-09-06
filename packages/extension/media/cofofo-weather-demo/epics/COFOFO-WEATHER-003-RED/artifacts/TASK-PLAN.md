# Task Plan — Heat alert

## Files and Tests

- `src/Sources/SkyCast/Domain/WeatherAlert.swift`
- `src/Sources/SkyCast/Data/ForecastStore.swift`
- `src/Sources/SkyCast/Presentation/WeatherDashboardView.swift`
- `src/Tests/SkyCastTests/ForecastStoreTests.swift` — `testHighTemperatureAlertRequiresThreshold`

## Tasks

1. Model `WeatherAlert` và publish alert từ `ForecastStore`.
2. Tests cho high temperature và threshold boundary.
3. Presentation: render output store, không lặp policy.
4. Verify: `swift build` và full `swift test`.

## Applicable Project Rules

- `PATH-1`: production và test files giữ trong SwiftPM targets.
- `LAYER-1`: Domain không import SwiftUI.
- `CMD-1`: production change phải build.
- `CMD-2`: full Swift test suite phải xanh.
