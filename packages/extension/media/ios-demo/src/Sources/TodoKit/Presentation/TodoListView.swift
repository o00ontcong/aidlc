import SwiftUI

/// Màn chính: danh sách việc + ô nhập nhanh + bộ lọc.
/// Layout/số đo lấy từ `docs/epics/<EPIC>/artifacts/UI-SPEC.md`.
public struct TodoListView: View {
    @ObservedObject private var store: TodoStore
    @State private var draftTitle: String = ""
    @State private var errorMessage: String?

    public init(store: TodoStore) {
        self.store = store
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            composer
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }
            filterBar
            list
            footer
        }
    }

    private var header: some View {
        HStack {
            Text("Việc cần làm")
                .font(.title2.weight(.bold))
            Spacer()
            Text("\(store.activeCount) chưa xong")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(16)
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("Thêm việc mới…", text: $draftTitle)
                .textFieldStyle(.roundedBorder)
                .onSubmit(submit)
            Button("Thêm", action: submit)
                .buttonStyle(.borderedProminent)
                .disabled(draftTitle.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private var filterBar: some View {
        Picker("Bộ lọc", selection: $store.filter) {
            ForEach(TodoFilter.allCases, id: \.self) { filter in
                Text(label(for: filter)).tag(filter)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private var list: some View {
        List {
            ForEach(store.visibleTodos) { todo in
                TodoRow(todo: todo) { store.toggle(todo.id) }
            }
        }
        .listStyle(.plain)
    }

    private var footer: some View {
        HStack {
            Spacer()
            Button("Xoá việc đã xong") { store.clearCompleted() }
                .font(.footnote)
                .disabled(store.todos.allSatisfy { !$0.isDone })
        }
        .padding(16)
    }

    private func label(for filter: TodoFilter) -> String {
        switch filter {
        case .all:    return "Tất cả"
        case .active: return "Chưa xong"
        case .done:   return "Đã xong"
        }
    }

    private func submit() {
        do {
            try store.add(title: draftTitle)
            draftTitle = ""
            errorMessage = nil
        } catch {
            errorMessage = (error as? TodoError)?.errorDescription ?? "Không thêm được việc."
        }
    }
}

struct TodoRow: View {
    let todo: Todo
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                Image(systemName: todo.isDone ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(todo.isDone ? Color.accentColor : Color.secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(todo.title)
                    .strikethrough(todo.isDone)
                    .foregroundStyle(todo.isDone ? .secondary : .primary)
                if todo.isOverdue() {
                    Text("Quá hạn")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }
}
