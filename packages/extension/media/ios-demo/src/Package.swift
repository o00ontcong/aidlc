// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TodoKit",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "TodoKit", targets: ["TodoKit"]),
    ],
    targets: [
        .target(name: "TodoKit"),
        .testTarget(name: "TodoKitTests", dependencies: ["TodoKit"]),
    ]
)
