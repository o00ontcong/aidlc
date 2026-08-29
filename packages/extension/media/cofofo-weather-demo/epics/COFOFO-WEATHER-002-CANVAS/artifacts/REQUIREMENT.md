# Requirement — Heat alert

## Goal

Người dùng thấy một cảnh báo rõ ràng khi nhiệt độ hiện tại của thành phố vượt
ngưỡng nắng nóng đã cấu hình cho thành phố đó.

## Acceptance Criteria

- AC-1: `ForecastStore` phát hành heat alert khi `temperatureCelsius` lớn hơn
  `City.heatAlertThresholdCelsius`.
- AC-2: Bằng đúng ngưỡng không tạo alert.
- AC-3: `WeatherDashboardView` chỉ hiển thị alert do Data/Domain cung cấp; nó
  không tự so sánh nhiệt độ.
- AC-4: Unit test bao phủ vượt ngưỡng và đúng ngưỡng, không gọi network.

## Non-goals

- Không gọi API thời tiết thật.
- Không thêm notification nền hay persistence trong feature này.
