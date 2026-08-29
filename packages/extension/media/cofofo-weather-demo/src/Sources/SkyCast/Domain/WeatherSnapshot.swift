import Foundation

public enum WeatherCondition: String, CaseIterable, Equatable, Sendable {
    case clear
    case cloudy
    case rain
    case thunderstorm

    public var symbolName: String {
        switch self {
        case .clear: "sun.max.fill"
        case .cloudy: "cloud.fill"
        case .rain: "cloud.rain.fill"
        case .thunderstorm: "cloud.bolt.rain.fill"
        }
    }
}

public struct WeatherSnapshot: Equatable, Sendable {
    public let city: City
    public let temperatureCelsius: Double
    public let feelsLikeCelsius: Double
    public let humidityPercent: Int
    public let windKph: Double
    public let condition: WeatherCondition
    public let observedAt: Date

    public init(
        city: City,
        temperatureCelsius: Double,
        feelsLikeCelsius: Double,
        humidityPercent: Int,
        windKph: Double,
        condition: WeatherCondition,
        observedAt: Date = Date()
    ) {
        self.city = city
        self.temperatureCelsius = temperatureCelsius
        self.feelsLikeCelsius = feelsLikeCelsius
        self.humidityPercent = humidityPercent
        self.windKph = windKph
        self.condition = condition
        self.observedAt = observedAt
    }

    public var roundedTemperature: Int { Int(temperatureCelsius.rounded()) }
}
