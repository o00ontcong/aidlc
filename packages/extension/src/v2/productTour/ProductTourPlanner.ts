import type {
  ProductTourAnchor,
  ProductTourGoalId,
  ProductTourGoalOffer,
  ProductTourId,
  ProductTourRuntimeSnapshot,
  ProductTourView,
} from '../../shared/productTour';
import { PRODUCT_TOUR_GOAL_IDS } from '../../shared/productTour';

export type ProductTourRequirement = 'evidence' | 'change-binding' | 'proposal-binding' | 'acknowledgement';

export interface ProductTourCatalogStep {
  id: string;
  title: string;
  body: string;
  target?: ProductTourAnchor;
  targetView?: ProductTourView;
  requires: ProductTourRequirement;
  complete: (
    snapshot: ProductTourRuntimeSnapshot,
    bound: { changeId?: string; proposalId?: string },
    acknowledged: ReadonlySet<string>,
  ) => boolean;
}

export interface ProductTourGoalDefinition {
  id: ProductTourGoalId;
  title: string;
  detail: string;
  stepIds: readonly string[];
  /** Soft ranking hint from current snapshot — does not mutate domain data. */
  recommend: (snapshot: ProductTourRuntimeSnapshot) => { recommended: boolean; reason?: string };
}

const acknowledged = (id: string) =>
  (_snapshot: ProductTourRuntimeSnapshot, _bound: unknown, values: ReadonlySet<string>) => values.has(id);

const discoverContextReady = (snapshot: ProductTourRuntimeSnapshot) =>
  snapshot.discoverContextStatus === 'ready' || snapshot.discoverContextStatus === 'not-required';

export const PRODUCT_TOUR_STEP_CATALOG: Record<string, ProductTourCatalogStep> = {
  'lifecycle.discover-context-ready': {
    id: 'lifecycle.discover-context-ready', title: 'Publish Discover Context',
    body: 'Pipeline cofofo-feature / cofofo-bugfix chỉ chạy khi Context · ready. Nếu badge stale/draft/missing, mở Discover → Publish context trước khi Start Epic.',
    target: 'discover-publish-context', targetView: 'discover', requires: 'evidence',
    complete: (snapshot) => discoverContextReady(snapshot),
  },
  'lifecycle.bind-change': {
    id: 'lifecycle.bind-change', title: 'Chọn một Change',
    body: 'Nhấn New change để tạo, hoặc chọn đúng Change có sẵn. Tour chỉ theo Change bạn chọn — không suy diễn từ task khác.',
    target: 'project-new-change', targetView: 'project', requires: 'change-binding',
    complete: (_snapshot, bound) => Boolean(bound.changeId),
  },
  'lifecycle.link-epic': {
    id: 'lifecycle.link-epic', title: 'Khởi chạy Epic',
    body: 'Mở Start Epic từ nút trong tour (hoặc trong Active work), chọn pipeline cofofo-feature / cofofo-bugfix, rồi xác nhận. AIDLC pin Context và source snapshot rồi mới liên kết Epic với Change. Nếu Change đã có Epic (kể cả pending khởi tạo dở) thì bước này đã xong.',
    target: 'change-route-start-epic', targetView: 'project', requires: 'evidence',
    complete: (snapshot, bound) => snapshot.changes.some((change) =>
      change.id === bound.changeId && (change.epicLinked || change.epicLinkPending)),
  },
  'lifecycle.delivery-complete': {
    id: 'lifecycle.delivery-complete', title: 'Ghi nhận delivery',
    body: 'Làm việc trong Flow / Gate bên dưới: Run hoặc Approve từng step đến khi Epic vào review hoặc completed. Không có nút “ghi nhận delivery” riêng — badge Owning change sẽ đổi khi pipeline xong.',
    target: 'epic-delivery-pipeline', targetView: 'epics', requires: 'evidence',
    complete: (snapshot, bound) => snapshot.changes.some((change) =>
      change.id === bound.changeId && ['delivery-review', 'delivered', 'done'].includes(change.derivedState)),
  },
  'lifecycle.context-closeout': {
    id: 'lifecycle.context-closeout', title: 'Khép vòng Context',
    body: 'Apply Context Proposal, hoặc chọn “Không cần cập nhật Context” kèm lý do. Đây là human decision bắt buộc.',
    target: 'epic-context-closeout', targetView: 'epics', requires: 'evidence',
    complete: (snapshot, bound) => snapshot.changes.some((change) =>
      change.id === bound.changeId && ['applied', 'not-required'].includes(change.contextSyncStatus)),
  },
  'lifecycle.done': {
    id: 'lifecycle.done', title: 'Change đã Done',
    body: 'Tour chỉ hoàn tất khi cùng Change đã Done; không có thao tác “đánh dấu xong” riêng.',
    requires: 'evidence',
    complete: (snapshot, bound) => snapshot.changes.some((change) => change.id === bound.changeId && change.derivedState === 'done'),
  },
  'scan.pinned-source': {
    id: 'scan.pinned-source', title: 'Chạy scan có snapshot',
    body: 'Mở tab Dự án → Quét an toàn như Git và chạy Scan (ít nhất pass có snapshot). Scan không được tự ghi vào Project Context. Không cần xong cả 3 pass.',
    target: 'project-scan', targetView: 'project', requires: 'evidence',
    complete: (snapshot) => snapshot.scans.some((scan) => scan.hasPinnedSource),
  },
  'scan.review-proposal': {
    id: 'scan.review-proposal', title: 'Review proposal tách biệt',
    body: 'Nếu scan tạo Context Proposal: chọn proposal để review. Nếu scan không đổi gì (hoặc path chưa tạo CP): xác nhận “không có proposal” — đó vẫn là kết quả an toàn hợp lệ.',
    target: 'context-proposal-review', targetView: 'project', requires: 'proposal-binding',
    complete: (snapshot, bound, values) => {
      if (bound.proposalId) return true;
      const open = snapshot.proposals.some((proposal) => !['applied', 'discarded'].includes(proposal.status));
      return !open && values.has('scan.no-proposal');
    },
  },
  'scan.resolve-proposal': {
    id: 'scan.resolve-proposal', title: 'Apply, discard hoặc rebase',
    body: 'Có proposal thì apply/discard/rebase. Không có proposal (scan không đổi) thì bước này đã đạt sau khi bạn xác nhận ở bước trước.',
    target: 'context-proposal-rebase', targetView: 'project', requires: 'evidence',
    complete: (snapshot, bound, values) => {
      if (values.has('scan.no-proposal') && !bound.proposalId) return true;
      return snapshot.proposals.some((proposal) =>
        proposal.id === bound.proposalId && ['applied', 'discarded'].includes(proposal.status));
    },
  },
  'recovery.impact-advisory': {
    id: 'recovery.impact-advisory', title: 'Impact chỉ là tư vấn',
    body: 'Không có “Confirm impact” để mở khoá workflow. Bạn vẫn có thể sửa requirement, phân tích lại, Explore, Start Epic hoặc Shelve.',
    target: 'project-new-change', targetView: 'project', requires: 'acknowledgement',
    complete: acknowledged('recovery.impact-advisory'),
  },
  'recovery.no-dead-end': {
    id: 'recovery.no-dead-end', title: 'Chọn đường tiếp theo',
    body: 'Feedback về impact phải ghi nhận được cùng route tiếp theo. “Reject” không phải trạng thái terminal và không để Change bị mắc kẹt.',
    requires: 'acknowledgement',
    complete: acknowledged('recovery.no-dead-end'),
  },
};

const hasOpenChange = (snapshot: ProductTourRuntimeSnapshot) =>
  snapshot.changes.some((change) => !['done', 'cancelled', 'shelved', 'superseded'].includes(change.derivedState));

const needsContextCloseout = (snapshot: ProductTourRuntimeSnapshot) =>
  snapshot.changes.some((change) =>
    ['delivery-review', 'delivered'].includes(change.derivedState)
    && !['applied', 'not-required'].includes(change.contextSyncStatus));

export const PRODUCT_TOUR_GOALS: Record<ProductTourGoalId, ProductTourGoalDefinition> = {
  'publish-context': {
    id: 'publish-context',
    title: 'Publish Discover Context',
    detail: 'Đưa Context về ready trước khi Start Epic CoFoFo.',
    stepIds: ['lifecycle.discover-context-ready'],
    recommend: (snapshot) => {
      const status = snapshot.discoverContextStatus;
      if (status === 'ready' || status === 'not-required') return { recommended: false };
      return { recommended: true, reason: `Context · ${status}` };
    },
  },
  'start-delivery': {
    id: 'start-delivery',
    title: 'Bắt đầu giao việc (Change → Epic)',
    detail: 'Publish Context nếu cần, tạo/chọn Change, rồi Start Epic.',
    stepIds: ['lifecycle.discover-context-ready', 'lifecycle.bind-change', 'lifecycle.link-epic'],
    recommend: (snapshot) => {
      if (!discoverContextReady(snapshot)) {
        return { recommended: true, reason: 'Context chưa ready — sẽ gồm bước Publish' };
      }
      const unbound = snapshot.changes.some((change) =>
        !change.epicLinked && !change.epicLinkPending && !['done', 'cancelled'].includes(change.derivedState));
      if (unbound || snapshot.changes.length === 0) {
        return { recommended: true, reason: unbound ? 'Có Change chưa gắn Epic' : 'Chưa có Change' };
      }
      return { recommended: false };
    },
  },
  'finish-change': {
    id: 'finish-change',
    title: 'Khép vòng Change → Done',
    detail: 'Theo một Change từ Context ready đến Done (Epic, delivery, closeout).',
    stepIds: [
      'lifecycle.discover-context-ready',
      'lifecycle.bind-change',
      'lifecycle.link-epic',
      'lifecycle.delivery-complete',
      'lifecycle.context-closeout',
      'lifecycle.done',
    ],
    recommend: (snapshot) => ({
      recommended: hasOpenChange(snapshot) && !needsContextCloseout(snapshot),
      reason: hasOpenChange(snapshot) ? 'Có Change đang mở' : undefined,
    }),
  },
  'safe-scan': {
    id: 'safe-scan',
    title: 'Quét an toàn như Git',
    detail: 'Scan có snapshot, chọn proposal, rồi apply/discard/rebase. Không cần hoàn tất cả 3 pass.',
    stepIds: ['scan.pinned-source', 'scan.review-proposal', 'scan.resolve-proposal'],
    recommend: (snapshot) => {
      const open = snapshot.proposals.some((proposal) => !['applied', 'discarded'].includes(proposal.status));
      const scanned = snapshot.scans.some((scan) => scan.hasPinnedSource);
      if (open) return { recommended: true, reason: 'Có Context Proposal đang mở' };
      if (scanned) {
        return { recommended: true, reason: 'Đã có scan snapshot — có thể xác nhận nhánh không có proposal' };
      }
      return {
        recommended: false,
        reason: 'Chạy Scan trên tab Dự án; nếu không có thay đổi có thể xác nhận “không có proposal”.',
      };
    },
  },
  'close-context': {
    id: 'close-context',
    title: 'Khép Context sau delivery',
    detail: 'Chọn Change đã delivery rồi Apply / Không cần cập nhật Context.',
    stepIds: ['lifecycle.bind-change', 'lifecycle.context-closeout', 'lifecycle.done'],
    recommend: (snapshot) => needsContextCloseout(snapshot)
      ? { recommended: true, reason: 'Có Change chờ quyết định Context' }
      : { recommended: false },
  },
  'rejection-recovery': {
    id: 'rejection-recovery',
    title: 'Khi impact không phù hợp',
    detail: 'Impact chỉ tư vấn — không có confirmation gate hay dead-end.',
    stepIds: ['recovery.impact-advisory', 'recovery.no-dead-end'],
    recommend: () => ({ recommended: false }),
  },
};

export interface ProductTourPlan {
  goalId: ProductTourGoalId;
  title: string;
  steps: ProductTourCatalogStep[];
  skipped: ProductTourCatalogStep[];
}

export function resolveCatalogSteps(stepIds: readonly string[]): ProductTourCatalogStep[] {
  return stepIds.map((id) => {
    const step = PRODUCT_TOUR_STEP_CATALOG[id];
    if (!step) throw new Error(`Unknown product-tour step: ${id}`);
    return step;
  });
}

/**
 * Build a tour for one goal against current project evidence.
 * Steps already satisfied (without needing a bound subject for subject-scoped
 * predicates that can't pass yet) stay in the plan when they require binding —
 * only globally-satisfied evidence steps are skipped up-front.
 */
export function planProductTour(
  goalId: ProductTourGoalId,
  snapshot: ProductTourRuntimeSnapshot,
  bound: { changeId?: string; proposalId?: string } = {},
): ProductTourPlan {
  const goal = PRODUCT_TOUR_GOALS[goalId];
  const catalog = resolveCatalogSteps(goal.stepIds);
  const acknowledged = new Set<string>();
  const skipped: ProductTourCatalogStep[] = [];
  const remaining: ProductTourCatalogStep[] = [];

  for (const step of catalog) {
    // Subject-binding steps never skip from empty binding — user must choose.
    if (step.requires === 'change-binding' || step.requires === 'proposal-binding') {
      remaining.push(step);
      continue;
    }
    // Acknowledgement always needs the user in this run.
    if (step.requires === 'acknowledgement') {
      remaining.push(step);
      continue;
    }
    // Evidence that already holds (e.g. Context ready) is skipped.
    if (step.complete(snapshot, bound, acknowledged)) {
      skipped.push(step);
      continue;
    }
    remaining.push(step);
  }

  return { goalId, title: goal.title, steps: remaining, skipped };
}

export function listGoalOffers(snapshot: ProductTourRuntimeSnapshot): ProductTourGoalOffer[] {
  return PRODUCT_TOUR_GOAL_IDS.map((goalId) => {
    const goal = PRODUCT_TOUR_GOALS[goalId];
    const plan = planProductTour(goalId, snapshot);
    const hint = goal.recommend(snapshot);
    // Advisory only — never hard-block starting a tour. Mid-run pause/exit must
    // remain resumable; step predicates already keep Pass honest.
    return {
      id: goalId,
      title: goal.title,
      detail: goal.detail,
      recommended: hint.recommended && plan.steps.length > 0,
      reason: hint.reason,
      remainingCount: plan.steps.length,
      skippedCount: plan.skipped.length,
      remainingTitles: plan.steps.map((step) => step.title),
    };
  }).sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.title.localeCompare(b.title));
}

/** Compatibility / fixed-scenario metadata (full step lists, no plan-time skip). */
export const PRODUCT_TOUR_FIXED: Record<ProductTourId, { id: ProductTourId; title: string; detail: string; stepIds: readonly string[] }> = {
  'lifecycle-basics': {
    id: 'lifecycle-basics',
    title: 'Vòng đời Change → Epic → Context',
    detail: 'Theo một Change thật đến khi khép Context.',
    stepIds: [
      'lifecycle.discover-context-ready',
      'lifecycle.bind-change',
      'lifecycle.link-epic',
      'lifecycle.delivery-complete',
      'lifecycle.context-closeout',
      'lifecycle.done',
    ],
  },
  'safe-scan': {
    id: 'safe-scan',
    title: 'Quét an toàn như Git',
    detail: 'Scan trên tab Dự án → proposal riêng → resolve. Không cần xong cả 3 pass.',
    stepIds: ['scan.pinned-source', 'scan.review-proposal', 'scan.resolve-proposal'],
  },
  'rejection-recovery': {
    id: 'rejection-recovery',
    title: 'Khi impact không phù hợp',
    detail: 'Không có confirmation gate hoặc dead-end sau feedback.',
    stepIds: ['recovery.impact-advisory', 'recovery.no-dead-end'],
  },
};

/** Compatibility shim — old fixed tours mapped onto goals. */
export const PRODUCT_TOUR_DEFINITIONS = {
  'lifecycle-basics': PRODUCT_TOUR_FIXED['lifecycle-basics'],
  'safe-scan': PRODUCT_TOUR_FIXED['safe-scan'],
  'rejection-recovery': PRODUCT_TOUR_FIXED['rejection-recovery'],
} as const;
