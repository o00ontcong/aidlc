import SwiftUI

public struct WeatherDashboardView: View {
    @ObservedObject private var store: ForecastStore
    private let city: City

    public init(store: ForecastStore, city: City = .hoChiMinhCity) {
        self.store = store
        self.city = city
    }

    public var body: some View {
        VStack(spacing: 20) {
            header
            content
            if let refreshError = store.refreshError {
                Text(refreshError)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            Button(store.isRefreshing ? "Đang cập nhật…" : "Cập nhật") {
                Task { await store.refresh(for: city) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.isRefreshing)
        }
        .padding(24)
        .task { await store.refresh(for: city) }
    }

    private var header: some View {
        VStack(spacing: 4) {
            Text(city.name).font(.title2.weight(.bold))
            Text("Thời tiết hiện tại").font(.subheadline).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var content: some View {
        if let snapshot = store.snapshot {
            VStack(spacing: 12) {
                Image(systemName: snapshot.condition.symbolName)
                    .font(.system(size: 54))
                    .foregroundStyle(.orange)
                Text("\(snapshot.roundedTemperature)°")
                    .font(.system(size: 64, weight: .medium, design: .rounded))
                Text("Cảm giác như \(Int(snapshot.feelsLikeCelsius.rounded()))°")
                    .foregroundStyle(.secondary)
                HStack(spacing: 28) {
                    metric("Độ ẩm", "\(snapshot.humidityPercent)%")
                    metric("Gió", "\(Int(snapshot.windKph.rounded())) km/h")
                }
            }
        } else if store.isRefreshing {
            ProgressView("Đang tải thời tiết…")
        } else {
            VStack(spacing: 8) {
                Image(systemName: "cloud.sun")
                    .font(.title)
                    .foregroundStyle(.secondary)
                Text("Chưa có dữ liệu")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline)
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
    }
}
