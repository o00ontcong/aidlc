import Foundation

/// A single to-do item. Immutable value type — the store owns mutation.
public struct Todo: Identifiable, Equatable, Codable, Sendable {
    public let id: UUID
    public var title: String
    public var isDone: Bool
    public var dueDate: Date?
    public let createdAt: Date

    public init(
        id: UUID = UUID(),
        title: String,
        isDone: Bool = false,
        dueDate: Date? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.isDone = isDone
        self.dueDate = dueDate
        self.createdAt = createdAt
    }

    /// BR-3: một todo quá hạn khi có dueDate ở quá khứ và chưa hoàn thành.
    public func isOverdue(now: Date = Date()) -> Bool {
        guard let dueDate, !isDone else { return false }
        return dueDate < now
    }
}

public enum TodoFilter: String, CaseIterable, Sendable {
    case all, active, done
}
