import Foundation

/// The single owner of weather state and refresh lifecycle. Presentation reads
/// published values but never chooses thresholds or writes snapshots itself.
@MainActor
public final class ForecastStore: ObservableObject {
    @Published public private(set) var snapshot: WeatherSnapshot?
    @Published public private(set) var refreshError: String?
    @Published public private(set) var isRefreshing = false

    private let provider: any WeatherProviding

    public init(provider: any WeatherProviding = StaticWeatherProvider.preview()) {
        self.provider = provider
    }

    public func refresh(for city: City) async {
        isRefreshing = true
        refreshError = nil
        defer { isRefreshing = false }

        do {
            snapshot = try await provider.currentWeather(for: city)
        } catch {
            refreshError = "Không thể cập nhật thời tiết. Hãy thử lại."
        }
    }
}
