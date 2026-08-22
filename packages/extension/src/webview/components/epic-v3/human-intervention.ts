import type { EpicStepDetailFull } from '@/lib/types';

/**
 * Human-facing recovery guidance for the AIDLC pipeline steps. Keep this
 * close to the Epic UI rather than persisting it in run state: it is
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
  plan: {
    fixAt: 'Sửa Problem/Goal, scope và Acceptance Criteria trong PRD để mô tả đúng hành vi sản phẩm; chốt các Discovery decisions còn treo.',
    source: 'PRD.md',
    feedback: 'Hiện tại: … . Mong muốn: … . In scope: …; out of scope: … . Hãy sửa PRD và acceptance criteria.',
    followUp: 'Chạy lại plan; các step phía sau cần chạy lại nếu PRD đổi.',
  },
  prototype: {
    fixAt: 'Chỉnh phương án UI đã chọn, các option so sánh và lý do chọn; sửa prototype HTML tương ứng.',
    source: 'PROTOTYPE.md + các file prototype HTML',
    feedback: 'Option hiện tại chưa đạt vì: … . Hướng UI mong muốn: … . Ràng buộc thiết kế cần giữ: … .',
    followUp: 'Chạy lại prototype rồi cập nhật design nếu phương án UI thay đổi.',
  },
  design: {
    fixAt: 'Sửa kiến trúc, API contract, DI plan và File Impact để khớp quyết định đã chốt; ghi rõ invariant không được phá.',
    source: 'TECH-DESIGN.md',
    feedback: 'Phương án hiện tại: … . Hãy dùng phương án: … vì … . Giữ các ràng buộc: … .',
    followUp: 'Chạy lại design rồi làm mới test plan và implementation phụ thuộc.',
  },
  'test-plan': {
    fixAt: 'Bổ sung loại kiểm thử còn thiếu (UT/UI/integration/performance), device matrix và mapping tới từng acceptance criteria.',
    source: 'TEST-PLAN.md',
    feedback: 'Test plan còn thiếu: … . AC chưa được phủ: … . Môi trường/thiết bị cần bổ sung: … .',
    followUp: 'Chạy lại test-plan trước khi sinh test cases.',
  },
  implement: {
    fixAt: 'Sửa source code tại hành vi tái hiện được, bổ sung/điều chỉnh unit test liên quan; chỉ đổi tech design nếu design mới là nguồn sai.',
    source: 'Source code + TECH-DESIGN.md',
    feedback: 'Bug hiện tại: … . Kết quả mong muốn: … . Cách tái hiện/AC: … . Giữ contract đã chốt: … .',
    followUp: 'Rerun implement rồi chạy lại execute-test để lấy evidence mới.',
  },
  'generate-test-cases': {
    fixAt: 'Bổ sung case còn thiếu, dữ liệu/fixture và trace từng case về requirement hoặc AC mà nó chứng minh.',
    source: 'TEST-CASES.md',
    feedback: 'Case còn thiếu: … . Dữ liệu/fixture cần có: … . Mỗi case phải trace được về AC: … .',
    followUp: 'Chạy lại generate-test-cases trước khi execute-test.',
  },
  'execute-test': {
    fixAt: 'Lấy lệnh fail, log và bước tái hiện từ report; sửa nguyên nhân ở implement hoặc design, rồi chạy lại đúng bộ kiểm thử để cập nhật evidence.',
    source: 'TEST-REPORT.md, rồi source/design gây fail',
    feedback: 'Lệnh/kiểm tra fail: … . Kết quả hiện tại: … . Kết quả mong muốn: … . Log hoặc bước tái hiện: … .',
    followUp: 'Không vá báo cáo cuối: sửa nguyên nhân rồi rerun execute-test.',
  },
};

function stepId(step: StepLike): string {
  return (step.stepName ?? step.agent ?? '').trim().toLowerCase().replace(/\s+/g, '-');
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
