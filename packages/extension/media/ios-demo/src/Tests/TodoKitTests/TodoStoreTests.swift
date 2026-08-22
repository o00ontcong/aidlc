import XCTest
@testable import TodoKit

@MainActor
final class TodoStoreTests: XCTestCase {

    func testAddRejectsEmptyTitle() {
        let store = TodoStore()
        XCTAssertThrowsError(try store.add(title: "   ")) { error in
            XCTAssertEqual(error as? TodoError, .emptyTitle)
        }
        XCTAssertTrue(store.todos.isEmpty)
    }

    /// BR-2
    func testAddRejectsDuplicateActiveTitle() throws {
        let store = TodoStore()
        try store.add(title: "Mua sữa")
        XCTAssertThrowsError(try store.add(title: "  mua sữa ")) { error in
            XCTAssertEqual(error as? TodoError, .duplicateTitle("mua sữa"))
        }
        XCTAssertEqual(store.todos.count, 1)
    }

    /// BR-2: đã hoàn thành thì không còn chặn tên trùng.
    func testDuplicateAllowedOnceOriginalIsDone() throws {
        let store = TodoStore()
        let first = try store.add(title: "Tưới cây")
        store.toggle(first.id)
        XCTAssertNoThrow(try store.add(title: "Tưới cây"))
        XCTAssertEqual(store.todos.count, 2)
    }

    /// BR-5
    func testToggleIsReversible() throws {
        let store = TodoStore()
        let todo = try store.add(title: "Gọi điện")
        store.toggle(todo.id)
        XCTAssertTrue(store.todos[0].isDone)
        store.toggle(todo.id)
        XCTAssertFalse(store.todos[0].isDone)
    }

    /// BR-6
    func testClearCompletedKeepsActive() throws {
        let store = TodoStore()
        let done = try store.add(title: "Xong rồi")
        try store.add(title: "Chưa xong")
        store.toggle(done.id)
        store.clearCompleted()
        XCTAssertEqual(store.todos.map(\.title), ["Chưa xong"])
    }

    /// BR-4
    func testVisibleTodosPutActiveFirst() throws {
        let store = TodoStore()
        let a = try store.add(title: "A")
        try store.add(title: "B")
        store.toggle(a.id)
        XCTAssertEqual(store.visibleTodos.map(\.title), ["B", "A"])
    }

    /// BR-3
    func testOverdueOnlyWhenUnfinished() throws {
        let past = Date().addingTimeInterval(-3600)
        let store = TodoStore()
        let todo = try store.add(title: "Nộp báo cáo", dueDate: past)
        XCTAssertTrue(store.todos[0].isOverdue())
        store.toggle(todo.id)
        XCTAssertFalse(store.todos[0].isOverdue())
    }
}
