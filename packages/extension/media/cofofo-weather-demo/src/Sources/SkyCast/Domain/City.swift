import Foundation

/// A city the user follows. The alert threshold belongs to product policy,
/// not to a SwiftUI view, so downstream code can use the same value.
public struct City: Identifiable, Equatable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let countryCode: String
    public let heatAlertThresholdCelsius: Double

    public init(
        id: String,
        name: String,
        countryCode: String,
        heatAlertThresholdCelsius: Double = 35
    ) {
        self.id = id
        self.name = name
        self.countryCode = countryCode
        self.heatAlertThresholdCelsius = heatAlertThresholdCelsius
    }

    public static let hoChiMinhCity = City(
        id: "vn-hcmc",
        name: "Hồ Chí Minh",
        countryCode: "VN",
        heatAlertThresholdCelsius: 35
    )
}
