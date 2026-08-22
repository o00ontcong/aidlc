import Foundation

public protocol TodoPersisting: Sendable {
    func load() throws -> [Todo]
    func save(_ todos: [Todo]) throws
}

/// Bản mặc định cho demo + unit test. Bản thật sẽ ghi xuống đĩa.
public final class InMemoryTodoPersistence: TodoPersisting, @unchecked Sendable {
    private var storage: [Todo]
    private let lock = NSLock()

    public init(seed: [Todo] = []) { self.storage = seed }

    public func load() throws -> [Todo] {
        lock.lock(); defer { lock.unlock() }
        return storage
    }

    public func save(_ todos: [Todo]) throws {
        lock.lock(); defer { lock.unlock() }
        storage = todos
    }
}
