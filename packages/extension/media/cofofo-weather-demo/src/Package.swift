// swift-tools-version: 5.9
//
// Manifest-only fixture: this file exists so CoFoFo's stack detector reads a
// real `Package.swift` (single SwiftPM stack, `mode: 'cofofo'`) and every
// Foundation artifact it seeds — STACK-PROFILE, PROJECT-RULES, evidence
// scope — is genuine. The demo ships no Sources/Tests; every path those
// artifacts cite (`ForecastStore.swift`, `WeatherDashboardView.swift`, …) is
// documentation-level illustration, not code you can build or run.
import PackageDescription

let package = Package(name: "SkyCast")
