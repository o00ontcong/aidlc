import Foundation

public protocol WeatherProviding: Sendable {
    func currentWeather(for city: City) async throws -> WeatherSnapshot
}

public enum WeatherProviderError: Error, Equatable {
    case unavailable
}

/// Deterministic data makes the full CoFoFo workflow runnable offline. A real
/// adapter can replace this protocol implementation without moving policy into
/// the presentation layer.
public struct StaticWeatherProvider: WeatherProviding {
    public let result: Result<WeatherSnapshot, WeatherProviderError>

    public init(result: Result<WeatherSnapshot, WeatherProviderError>) {
        self.result = result
    }

    public func currentWeather(for city: City) async throws -> WeatherSnapshot {
        try result.get()
    }

    public static func preview(for city: City = .hoChiMinhCity) -> StaticWeatherProvider {
        StaticWeatherProvider(result: .success(WeatherSnapshot(
            city: city,
            temperatureCelsius: 32,
            feelsLikeCelsius: 38,
            humidityPercent: 74,
            windKph: 13,
            condition: .cloudy,
            observedAt: Date(timeIntervalSince1970: 1_725_000_000)
        )))
    }
}
