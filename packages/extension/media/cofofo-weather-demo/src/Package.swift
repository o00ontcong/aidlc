// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SkyCast",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "SkyCast", targets: ["SkyCast"]),
        .executable(name: "SkyCastDemoApp", targets: ["SkyCastDemoApp"]),
    ],
    targets: [
        .target(name: "SkyCast"),
        .executableTarget(name: "SkyCastDemoApp", dependencies: ["SkyCast"]),
        .testTarget(name: "SkyCastTests", dependencies: ["SkyCast"]),
    ]
)
