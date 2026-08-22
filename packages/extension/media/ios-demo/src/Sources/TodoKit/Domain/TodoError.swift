import Foundation

public enum TodoError: Error, Equatable, LocalizedError {
    case emptyTitle
    case titleTooLong(max: Int)
    case duplicateTitle(String)

    public var errorDescription: String? {
        switch self {
        case .emptyTitle:
            return "Tiêu đề không được để trống."
        case let .titleTooLong(max):
            return "Tiêu đề tối đa \(max) ký tự."
        case let .duplicateTitle(title):
            return "Đã có việc tên \"\(title)\" chưa hoàn thành."
        }
    }
}
