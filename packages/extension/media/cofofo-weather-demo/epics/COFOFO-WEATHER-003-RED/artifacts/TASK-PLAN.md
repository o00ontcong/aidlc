# Task Plan — Heat alert

## RED / GREEN Contract

Thêm `testHighTemperatureAlertRequiresThreshold` trước. Test phải fail bằng
`XCTAssert` vì `ForecastStore` chưa có alert. `red-weather-alert.mjs` sẽ reject
nếu lỗi compile/import hoặc test đang xanh.

## Tasks

1. RED: test high temperature và threshold boundary.
2. GREEN: model `WeatherAlert` và publish alert từ `ForecastStore`.
3. Presentation: render output store, không lặp policy.
4. Verify: `swift build` và full `swift test`.

## Applicable Project Rules

- `PATH-1`: production và test files giữ trong SwiftPM targets.
- `LAYER-1`: Domain không import SwiftUI.
- `CMD-1`: production change phải build.
- `CMD-2`: full Swift test suite phải xanh.
