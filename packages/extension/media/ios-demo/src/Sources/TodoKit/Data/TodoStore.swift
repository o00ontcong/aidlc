import Foundation

/// Nơi duy nhất mutate danh sách todo. View chỉ đọc và gọi lệnh.
///
/// Business rule được thực thi ở đây, không ở View — xem
/// `docs/project/domain/BUSINESS-RULES.md`.
@MainActor
public final class TodoStore: ObservableObject {
    public static let maxTitleLength = 120

    @Published public private(set) var todos: [Todo] = []
    @Published public var filter: TodoFilter = .all

    private let persistence: TodoPersisting

    public init(persistence: TodoPersisting = InMemoryTodoPersistence()) {
        self.persistence = persistence
        self.todos = (try? persistence.load()) ?? []
    }

    public var visibleTodos: [Todo] {
        let filtered: [Todo]
        switch filter {
        case .all:    filtered = todos
        case .active: filtered = todos.filter { !$0.isDone }
        case .done:   filtered = todos.filter(\.isDone)
        }
        // BR-4: chưa xong lên trước, trong mỗi nhóm thì mới nhất lên trước.
        return filtered.sorted { lhs, rhs in
            if lhs.isDone != rhs.isDone { return !lhs.isDone }
            return lhs.createdAt > rhs.createdAt
        }
    }

    public var activeCount: Int { todos.filter { !$0.isDone }.count }

    /// BR-1 tiêu đề bắt buộc · BR-2 không trùng tên trong các việc chưa xong.
    @discardableResult
    public func add(title rawTitle: String, dueDate: Date? = nil) throws -> Todo {
        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw TodoError.emptyTitle }
        guard title.count <= Self.maxTitleLength else {
            throw TodoError.titleTooLong(max: Self.maxTitleLength)
        }
        let clash = todos.contains {
            !$0.isDone && $0.title.caseInsensitiveCompare(title) == .orderedSame
        }
        guard !clash else { throw TodoError.duplicateTitle(title) }

        let todo = Todo(title: title, dueDate: dueDate)
        todos.append(todo)
        persist()
        return todo
    }

    /// BR-5: đánh dấu xong/chưa xong luôn đảo được, không xoá dữ liệu.
    public func toggle(_ id: Todo.ID) {
        guard let idx = todos.firstIndex(where: { $0.id == id }) else { return }
        todos[idx].isDone.toggle()
        persist()
    }

    public func remove(_ id: Todo.ID) {
        todos.removeAll { $0.id == id }
        persist()
    }

    /// BR-6: chỉ xoá được việc ĐÃ hoàn thành; việc chưa xong không bị dọn nhầm.
    public func clearCompleted() {
        todos.removeAll(where: \.isDone)
        persist()
    }

    private func persist() {
        try? persistence.save(todos)
    }
}
