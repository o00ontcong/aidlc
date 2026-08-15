import type { EpicStepDetailFull } from '@/lib/types';

/**
 * Human-facing recovery guidance for the Cohesive Feature pipeline.  Keep
 * this close to the Epic UI rather than persisting it in run state: it is
 * explanatory copy, not a new workflow contract.
 */
export interface HumanInterventionGuide {
  /** Concrete edits the user should make at this step's source of truth. */
  fixAt: string;
  /** Canonical artifact or source to correct. */
  source: string;
  /** A feedback starter the user can adapt before requesting a rerun. */
  feedback: string;
  /** What to do after the source has been corrected. */
  followUp: string;
}

type StepLike = Pick<EpicStepDetailFull, 'agent' | 'stepName' | 'artifact'>;

const GUIDE_BY_STEP: Record<string, HumanInterventionGuide> = {
  'capture-context': {
    fixAt: 'Đối chiếu snapshot với project context hiện tại; bổ sung convention, dependency hoặc ràng buộc bị thiếu trước khi các step sau đọc nó.',
    source: 'PROJECT-CONTEXT-SNAPSHOT.md',
    feedback: 'Bối cảnh hiện tại thiếu/sai: …; ràng buộc cần giữ là: … . Hãy cập nhật snapshot trước khi tiếp tục.',
    followUp: 'Chạy lại step này; các step đã dựa vào snapshot cũ cũng cần được xem xét chạy lại.',
  },
  specify: {
    fixAt: 'Sửa Functional Requirements, Acceptance Criteria và Out of Scope để mô tả đúng hành vi sản phẩm; không sửa thẳng code ở step này.',
    source: 'SPEC.md',
    feedback: 'Hiện tại: … . Mong muốn: … . In scope: …; out of scope: … . Hãy sửa SPEC và acceptance criteria.',
    followUp: 'Rerun specify; nếu đã qua clarify thì rerun các step phía sau để chúng dùng SPEC mới.',
  },
  clarify: {
    fixAt: 'Thêm quyết định rõ ràng vào phần Clarifications: ai dùng, khi nào xảy ra, dữ liệu nào hợp lệ và AC nào chứng minh kết quả.',
    source: 'SPEC.md · Clarifications',
    feedback: 'Cần chốt rõ: … . Hành vi mong muốn: … . Tiêu chí nghiệm thu: … .',
    followUp: 'Reject/Request update rồi chạy lại clarify; downstream cần chạy lại nếu quyết định thay đổi.',
  },
  plan: {
    fixAt: 'Sửa approach kỹ thuật, Shared Contract Impact, File Impact và traceability để kiến trúc/điểm tích hợp khớp quyết định đã chốt.',
    source: 'PLAN.md',
    feedback: 'Phương án hiện tại: … . Hãy dùng phương án: … vì … . Giữ các ràng buộc: … .',
    followUp: 'Chạy lại plan rồi làm mới task/contract/flow phụ thuộc để tránh triển khai theo hướng cũ.',
  },
  'plan-tasks': {
    fixAt: 'Thêm task thiếu, đặt lại dependency/thứ tự và gắn mỗi task với requirement hoặc AC mà nó thực hiện.',
    source: 'TASKS.md',
    feedback: 'Bổ sung/chỉnh task: … . Thứ tự phụ thuộc cần là: … . Mỗi task phải trace được về requirement: … .',
    followUp: 'Chạy lại plan-tasks trước khi sửa contract hoặc implementation.',
  },
  'tasks-package': {
    fixAt: 'Thêm task thiếu, đặt lại dependency/thứ tự và gắn mỗi task với requirement hoặc AC mà nó thực hiện.',
    source: 'TASKS.md',
    feedback: 'Bổ sung/chỉnh task: … . Thứ tự phụ thuộc cần là: … . Mỗi task phải trace được về requirement: … .',
    followUp: 'Chạy lại step này trước khi sửa contract hoặc implementation.',
  },
  'analyze-contract': {
    fixAt: 'Chỉnh request/response, ownership dữ liệu, API và boundary giữa layer; ghi rõ invariant không được phá trước khi implement.',
    source: 'FEATURE-CONTRACT.md',
    feedback: 'Contract hiện tại sai ở: … . Contract mong muốn: … . Boundary/ràng buộc không được phá: … .',
    followUp: 'Chạy lại analyze-contract, sau đó cập nhật flow và implementation theo contract đã chốt.',
  },
  'map-feature-flow': {
    fixAt: 'Vẽ lại entry point, transition giữa layer, callback/error state và edge case trong cả JSON lẫn Mermaid để flow khớp hành vi mong muốn.',
    source: 'FEATURE-FLOW.json / FEATURE-FLOW.mmd',
    feedback: 'Luồng hiện tại: … . Luồng mong muốn từ điểm vào đến kết quả: … . Edge case cần có: … .',
    followUp: 'Chạy lại map-feature-flow trước implement để code không đi theo flow cũ.',
  },
  implement: {
    fixAt: 'Sửa source code tại hành vi tái hiện được, bổ sung/điều chỉnh test liên quan và cập nhật implementation summary; chỉ đổi contract nếu contract mới là nguồn sai.',
    source: 'Source code + IMPLEMENTATION-SUMMARY.md',
    feedback: 'Bug hiện tại: … . Kết quả mong muốn: … . Cách tái hiện/AC: … . Giữ contract đã chốt: … .',
    followUp: 'Rerun implement; sau đó chạy lại cohesion-review và system-test.',
  },
  'implementation-context': {
    fixAt: 'Cập nhật Planned Versus Actual, Implemented Behavior, traceability và remaining risks để phản ánh đúng code đã merge vào branch.',
    source: 'IMPLEMENTATION-CONTEXT.md',
    feedback: 'Hành vi thực tế cần ghi nhận là: … . Sai khác với kế hoạch: … . Risk còn lại: … .',
    followUp: 'Cập nhật context rồi rerun review/test nếu thông tin này làm thay đổi đánh giá.',
  },
  'cohesion-review': {
    fixAt: 'Dùng report để tìm contract hoặc source code gây lệch; sửa nguyên nhân đó thay vì sửa kết luận trong report, rồi tạo report mới.',
    source: 'COHESION-REPORT.md, rồi source/FEATURE-CONTRACT.md gây lệch',
    feedback: 'Review phát hiện lệch: … . Hãy sửa ở nguồn: … . Kết quả cần chứng minh lại: … .',
    followUp: 'Không vá báo cáo cuối: quay về contract hoặc implement, rồi rerun cohesion-review.',
  },
  'system-test': {
    fixAt: 'Lấy lệnh fail, log và bước tái hiện từ report; sửa source/contract gây lỗi, rồi chạy lại đúng kiểm tra hệ thống để cập nhật evidence.',
    source: 'SYSTEM-TEST-REPORT.md, rồi source/contract gây fail',
    feedback: 'Lệnh/kiểm tra fail: … . Kết quả hiện tại: … . Kết quả mong muốn: … . Log hoặc bước tái hiện: … .',
    followUp: 'Sửa nguyên nhân ở implement/contract, sau đó rerun system-test.',
  },
  'open-pr': {
    fixAt: 'Kiểm tra head/base branch, PR URL và evidence test; sửa branch hoặc mở lại PR đúng target rồi cập nhật record ship.',
    source: 'PR-LINK.md',
    feedback: 'PR cần trỏ từ branch … vào … . Thiếu/sai evidence: … .',
    followUp: 'Chạy lại open-pr sau khi branch và kiểm thử đã đúng.',
  },
  'await-merge': {
    fixAt: 'Kiểm tra trạng thái PR thật trên remote; hoàn tất review/merge theo policy và chỉ cập nhật status sau khi merge đã được xác minh.',
    source: 'PR-LINK.md',
    feedback: 'PR cần được xử lý như sau: … . Trạng thái merge thực tế: … .',
    followUp: 'Đây là human gate: review/merge PR theo policy, rồi xác nhận lại step. Agent không tự merge branch mặc định.',
  },
  'project-sync': {
    fixAt: 'Cập nhật kiến thức Reality sau merge: behavior mới, contract thay đổi và evidence; không chỉnh charter Intent hoặc conventions tại đây.',
    source: 'PROJECT-UPDATE.md',
    feedback: 'Sau merge cần cập nhật Reality: … . Không thay đổi charter Intent hoặc conventions: … .',
    followUp: 'Chạy lại project-sync sau khi merge đã được xác minh.',
  },
};

function stepId(step: StepLike): string {
  return (step.stepName ?? step.agent).trim().toLowerCase().replace(/\s+/g, '-');
}

export function humanInterventionGuide(step: StepLike): HumanInterventionGuide {
  const id = stepId(step);
  const guide = GUIDE_BY_STEP[id];
  if (guide) { return guide; }

  const label = step.stepName ?? step.agent;
  const source = step.artifact || 'artifact/source của step này';
  return {
    fixAt: `Mở ${source}, xác định phần tạo ra kết quả lệch của ${label}, rồi sửa yêu cầu/artefact/code tại nguồn đó.`,
    source,
    feedback: `Hiện tại: … . Mong muốn: … . Điều kiện/ràng buộc cần giữ: … .`,
    followUp: 'Sửa ở nguồn của step này, gửi feedback rõ ràng rồi rerun; kiểm tra lại các step phụ thuộc phía sau.',
  };
}

/** Compact native-tooltip text for every step row. */
export function humanInterventionTooltip(step: StepLike): string {
  const guide = humanInterventionGuide(step);
  return [
    'Cách sửa khi kết quả chưa đúng',
    guide.fixAt,
    `Sửa tại: ${guide.source}`,
    `Sau đó: ${guide.followUp}`,
  ].join('\n');
}
