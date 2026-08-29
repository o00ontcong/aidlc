# AGENTS — SkyCast app code

SkyCast là iOS weather app Swift Package. Build/test thật bằng SwiftPM:

```bash
cd src && swift build
cd src && swift test
```

## Kiến trúc

```text
Sources/SkyCast/
  Domain/        City, WeatherSnapshot — value type thuần
  Data/          WeatherProviding, ForecastStore     — nơi duy nhất mutate state
  Presentation/  WeatherDashboardView                — SwiftUI chỉ đọc + gọi command
```

Luật phân tầng: `Presentation → Data → Domain`. `View` không tự suy diễn alert
hay mutate forecast; policy thuộc `ForecastStore`.

## Quy ước

- Public type phải có `public init`.
- `ForecastStore` là `@MainActor`; test store cũng phải là `@MainActor`.
- Không gọi network thật trong test. Dùng `StaticWeatherProvider` hoặc fake.
- Thêm rule mới thì cập nhật `PROJECT-RULES.json` qua workflow, không sửa Markdown render trực tiếp.
- Feature heat-alert phải bắt đầu bằng test đỏ có tên `testHighTemperatureAlertRequiresThreshold`; validator CoFoFo dùng test này để phân biệt RED khỏi lỗi compile/import.
