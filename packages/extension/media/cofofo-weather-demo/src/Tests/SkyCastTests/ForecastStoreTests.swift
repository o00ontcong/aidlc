import XCTest
@testable import SkyCast

@MainActor
final class ForecastStoreTests: XCTestCase {
    func testRefreshPublishesSnapshotFromProvider() async {
        let city = City.hoChiMinhCity
        let expected = WeatherSnapshot(
            city: city,
            temperatureCelsius: 31.6,
            feelsLikeCelsius: 36.1,
            humidityPercent: 72,
            windKph: 12,
            condition: .rain
        )
        let store = ForecastStore(provider: StaticWeatherProvider(result: .success(expected)))

        await store.refresh(for: city)

        XCTAssertEqual(store.snapshot, expected)
        XCTAssertNil(store.refreshError)
        XCTAssertFalse(store.isRefreshing)
    }

    func testRefreshShowsFriendlyErrorAndKeepsNoSnapshot() async {
        let store = ForecastStore(provider: StaticWeatherProvider(result: .failure(.unavailable)))

        await store.refresh(for: .hoChiMinhCity)

        XCTAssertNil(store.snapshot)
        XCTAssertEqual(store.refreshError, "Không thể cập nhật thời tiết. Hãy thử lại.")
        XCTAssertFalse(store.isRefreshing)
    }

    func testConditionExposesStableSymbolForPresentation() {
        XCTAssertEqual(WeatherCondition.thunderstorm.symbolName, "cloud.bolt.rain.fill")
        XCTAssertEqual(WeatherCondition.clear.symbolName, "sun.max.fill")
    }

    func testRoundedTemperatureUsesNearestDegree() {
        let snapshot = WeatherSnapshot(
            city: .hoChiMinhCity,
            temperatureCelsius: 31.6,
            feelsLikeCelsius: 33,
            humidityPercent: 70,
            windKph: 10,
            condition: .cloudy
        )
        XCTAssertEqual(snapshot.roundedTemperature, 32)
    }
}
