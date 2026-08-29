import SkyCast
import SwiftUI

/// A real runnable host for the package's iOS-compatible weather dashboard.
/// `swift run SkyCastDemoApp` opens it on macOS; the same view targets iOS 16+
/// when embedded in an app target in Xcode.
@main
struct SkyCastDemoApp: App {
    var body: some Scene {
        WindowGroup {
            WeatherDashboardView(store: ForecastStore())
                .frame(minWidth: 360, minHeight: 520)
        }
    }
}
