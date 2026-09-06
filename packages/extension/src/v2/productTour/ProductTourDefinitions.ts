import type {
  ProductTourAnchor,
  ProductTourId,
  ProductTourRuntimeSnapshot,
  ProductTourView,
} from '../../shared/productTour';

export type ProductTourRequirement = 'evidence' | 'change-binding' | 'proposal-binding' | 'acknowledgement';

export interface ProductTourDefinitionStep {
  id: string;
  title: string;
  body: string;
  target?: ProductTourAnchor;
  targetView?: ProductTourView;
  requires: ProductTourRequirement;
  complete: (snapshot: ProductTourRuntimeSnapshot, bound: { changeId?: string; proposalId?: string }, acknowledged: ReadonlySet<string>) => boolean;
}

export interface ProductTourDefinition {
  id: ProductTourId;
  title: string;
  steps: readonly ProductTourDefinitionStep[];
}

const acknowledged = (id: string) => (_snapshot: ProductTourRuntimeSnapshot, _bound: unknown, values: ReadonlySet<string>) => values.has(id);

const lifecycle: ProductTourDefinition = {
  id: 'lifecycle-basics',
  title: 'Vòng đời Change → Epic → Context',
  steps: [
    {
      id: 'lifecycle.bind-change', title: 'Chọn một Change',
      body: 'Chọn đúng Change bạn muốn theo dõi. Tour chỉ theo Change này, không suy diễn từ các task khác.',
      target: 'project-new-change', targetView: 'project', requires: 'change-binding',
      complete: (_snapshot, bound) => Boolean(bound.changeId),
    },
    {
      id: 'lifecycle.link-epic', title: 'Khởi chạy Epic',
      body: 'Từ Change, chọn Start Epic. AIDLC pin Context và source snapshot rồi mới liên kết Epic với Change.',
      target: 'change-route-start-epic', targetView: 'project', requires: 'evidence',
      complete: (snapshot, bound) => snapshot.changes.some((change) => change.id === bound.changeId && change.epicLinked),
    },
    {
      id: 'lifecycle.delivery-complete', title: 'Ghi nhận delivery',
      body: 'Hoàn tất pipeline và review artifact/code. Delivery xong sẽ chuyển sang chờ quyết định Context, chưa tự Done.',
      target: 'epic-delivery-review', targetView: 'epics', requires: 'evidence',
      complete: (snapshot, bound) => snapshot.changes.some((change) =>
        change.id === bound.changeId && ['delivery-review', 'delivered', 'done'].includes(change.derivedState)),
    },
    {
      id: 'lifecycle.context-closeout', title: 'Khép vòng Context',
      body: 'Apply Context Proposal, hoặc chọn “Không cần cập nhật Context” kèm lý do. Đây là human decision bắt buộc.',
      target: 'epic-context-closeout', targetView: 'epics', requires: 'evidence',
      complete: (snapshot, bound) => snapshot.changes.some((change) =>
        change.id === bound.changeId && ['applied', 'not-required'].includes(change.contextSyncStatus)),
    },
    {
      id: 'lifecycle.done', title: 'Change đã Done',
      body: 'Tour chỉ hoàn tất khi cùng Change đã Done; không có thao tác “đánh dấu xong” riêng.',
      requires: 'evidence',
      complete: (snapshot, bound) => snapshot.changes.some((change) => change.id === bound.changeId && change.derivedState === 'done'),
    },
  ],
};

const safeScan: ProductTourDefinition = {
  id: 'safe-scan',
  title: 'Quét an toàn như Git',
  steps: [
    {
      id: 'scan.pinned-source', title: 'Chạy scan có snapshot',
      body: 'Mở Discover và chạy Scan. Bước chỉ qua khi run có source snapshot; scan không được tự ghi vào Project Context.',
      target: 'discover-scan', targetView: 'discover', requires: 'evidence',
      complete: (snapshot) => snapshot.scans.some((scan) => scan.hasPinnedSource),
    },
    {
      id: 'scan.review-proposal', title: 'Review proposal tách biệt',
      body: 'Kết quả cần review ở Context Proposal. Chọn proposal cụ thể để tour không lẫn thay đổi của thành viên khác.',
      target: 'context-proposal-review', targetView: 'discover', requires: 'proposal-binding',
      complete: (_snapshot, bound) => Boolean(bound.proposalId),
    },
    {
      id: 'scan.resolve-proposal', title: 'Apply, discard hoặc rebase',
      body: 'Nếu Context đã di chuyển, rebase proposal; nếu không phù hợp, discard kèm lý do. Không có thao tác ghi đè Context.',
      target: 'context-proposal-rebase', targetView: 'discover', requires: 'evidence',
      complete: (snapshot, bound) => snapshot.proposals.some((proposal) =>
        proposal.id === bound.proposalId && ['applied', 'discarded'].includes(proposal.status)),
    },
  ],
};

const rejectionRecovery: ProductTourDefinition = {
  id: 'rejection-recovery',
  title: 'Khi impact không phù hợp',
  steps: [
    {
      id: 'recovery.impact-advisory', title: 'Impact chỉ là tư vấn',
      body: 'Không có “Confirm impact” để mở khoá workflow. Bạn vẫn có thể sửa requirement, phân tích lại, Explore, Start Epic hoặc Shelve.',
      target: 'project-new-change', targetView: 'project', requires: 'acknowledgement',
      complete: acknowledged('recovery.impact-advisory'),
    },
    {
      id: 'recovery.no-dead-end', title: 'Chọn đường tiếp theo',
      body: 'Feedback về impact phải ghi nhận được cùng route tiếp theo. “Reject” không phải trạng thái terminal và không để Change bị mắc kẹt.',
      requires: 'acknowledgement',
      complete: acknowledged('recovery.no-dead-end'),
    },
  ],
};

export const PRODUCT_TOUR_DEFINITIONS: Record<ProductTourId, ProductTourDefinition> = {
  'lifecycle-basics': lifecycle,
  'safe-scan': safeScan,
  'rejection-recovery': rejectionRecovery,
};
