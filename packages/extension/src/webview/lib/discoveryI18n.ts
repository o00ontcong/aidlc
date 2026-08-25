export type DiscoveryLanguage = 'en' | 'vi';

type DiscoveryStatus = 'draft' | 'exploring' | 'ready' | 'accepted' | 'converted' | 'shelved';

interface DiscoveryCopy {
  tab: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  languageSettings: string;
  howItWorks: string;
  closeGuide: string;
  guideTitle: string;
  guideBody: string;
  steps: Array<{ label: string; description: string }>;
  contextTitle: string;
  contextReady: string;
  contextNeedsSetup: string;
  contextNeedsUpdate: string;
  contextReadyBody: string;
  contextSetupBody: string;
  contextUpdateBody: string;
  prepareContext: string;
  updateContext: string;
  createContext: string;
  technicalDetails: string;
  revision: string;
  sourceCommit: string;
  startIdea: string;
  ideasTitle: string;
  ideasSubtitle: string;
  noIdeasTitle: string;
  noIdeasBody: string;
  wizard: {
    title: string;
    step: string;
    cancel: string;
    back: string;
    continue: string;
    start: string;
    problemTitle: string;
    problemHelp: string;
    problemPlaceholder: string;
    outcomeTitle: string;
    outcomeHelp: string;
    outcomePlaceholder: string;
    effortTitle: string;
    effortHelp: string;
    shortName: string;
    shortNameHelp: string;
    shortNamePlaceholder: string;
  };
  efforts: Array<{ value: string; label: string; description: string }>;
  status: Record<DiscoveryStatus, string>;
  suggestPlan: string;
  suggestPlanHelp: string;
  generatingPlan: string;
  generatingPlanHelp: string;
  proposalReady: string;
  proposalReadyBody: string;
  proposalPreview: string;
  applyProposal: string;
  discussProposal: string;
  discardProposal: string;
  tryAgain: string;
  generationError: string;
  generationErrorBody: string;
  editAnswers: string;
  closeEditor: string;
  planNeedsWork: string;
  planNeedsWorkBody: string;
  planReady: string;
  planReadyBody: string;
  checkPlan: string;
  approvePlan: string;
  startWork: string;
  reopen: string;
  setAside: string;
  workStarted: string;
  save: string;
  cancel: string;
  summaryTitle: string;
  fields: {
    title: string;
    problem: string;
    outcome: string;
    effort: string;
    approach: string;
    rationale: string;
    constraints: string;
    noGos: string;
    acceptance: string;
    risks: string;
    architecture: string;
    questions: string;
    options: string;
  };
  onePerLine: string;
  emptyDetailTitle: string;
  emptyDetailBody: string;
  blockers: Record<string, string>;
}

export const DISCOVERY_COPY: Record<DiscoveryLanguage, DiscoveryCopy> = {
  en: {
    tab: 'Ideas',
    eyebrow: 'PLAN BEFORE BUILDING',
    title: 'Turn an idea into a clear plan',
    subtitle: 'AIDLC helps you explain the problem, compare choices, and decide what success looks like. No code changes happen here.',
    languageSettings: 'Change language',
    howItWorks: 'How this works',
    closeGuide: 'Hide guide',
    guideTitle: 'Four simple steps',
    guideBody: 'You stay in control. AIDLC can suggest answers, but only you can approve the plan and start the work.',
    steps: [
      { label: 'Describe', description: 'Explain what should improve.' },
      { label: 'Discuss', description: 'Compare choices with AIDLC.' },
      { label: 'Review', description: 'Check the plan in plain language.' },
      { label: 'Start', description: 'Approve it and create the work.' },
    ],
    contextTitle: 'Project context',
    contextReady: 'Ready',
    contextNeedsSetup: 'One-time setup needed',
    contextNeedsUpdate: 'Needs an update',
    contextReadyBody: 'AIDLC has enough background to discuss a new idea safely.',
    contextSetupBody: 'Prepare the shared project background before starting your first idea.',
    contextUpdateBody: 'The project changed. Update the shared background before continuing.',
    prepareContext: 'Prepare project context',
    updateContext: 'Update project context',
    createContext: 'Create project context',
    technicalDetails: 'Technical details',
    revision: 'Context version',
    sourceCommit: 'Source version',
    startIdea: 'Explore a new idea',
    ideasTitle: 'Your ideas',
    ideasSubtitle: 'Pick one to continue where you left off.',
    noIdeasTitle: 'No ideas here yet',
    noIdeasBody: 'Start with a problem or improvement. AIDLC will help turn it into a clear plan.',
    wizard: {
      title: 'Explore a new idea',
      step: 'Question',
      cancel: 'Cancel',
      back: 'Back',
      continue: 'Continue',
      start: 'Start discussion',
      problemTitle: 'What would you like to improve?',
      problemHelp: 'Describe what feels difficult, risky, slow, or confusing. You do not need to know the solution.',
      problemPlaceholder: 'Example: New users are unsure how to finish setting up their account.',
      outcomeTitle: 'What should be better when this is solved?',
      outcomeHelp: 'Describe the result in a way that you could notice or verify.',
      outcomePlaceholder: 'Example: A new user can finish setup without asking for help.',
      effortTitle: 'How much effort feels right?',
      effortHelp: 'Choose a rough size. You can change this later.',
      shortName: 'Short name (optional)',
      shortNameHelp: 'AIDLC will make one from your description if you leave this blank.',
      shortNamePlaceholder: 'Example: Easier account setup',
    },
    efforts: [
      { value: 'A small improvement', label: 'Small improvement', description: 'A narrow change that should be quick to validate.' },
      { value: 'One focused delivery cycle', label: 'Focused work cycle', description: 'A meaningful improvement with a clear boundary.' },
      { value: 'A larger initiative split into stages', label: 'Larger initiative', description: 'A broad change that may need several stages.' },
    ],
    status: {
      draft: 'Draft', exploring: 'In discussion', ready: 'Ready to approve', accepted: 'Approved', converted: 'Work started', shelved: 'Set aside',
    },
    suggestPlan: 'Let AIDLC suggest the plan',
    suggestPlanHelp: 'AIDLC will use the answers already saved in this idea and relevant project context. You do not need to repeat the discussion or paste JSON. The recommendation is saved as a draft; your plan changes only when you apply it.',
    generatingPlan: 'AIDLC is preparing a recommendation…',
    generatingPlanHelp: 'You can stay on this page. This usually takes less than a minute.',
    proposalReady: 'AIDLC has a recommendation',
    proposalReadyBody: 'This draft is saved and will still be here when you reopen the app. Apply it only when it matches what you want.',
    proposalPreview: 'Proposed plan',
    applyProposal: 'Apply this plan',
    discussProposal: 'Discuss with the agent',
    discardProposal: 'Discard',
    tryAgain: 'Try again',
    generationError: 'AIDLC could not prepare the plan',
    generationErrorBody: 'Your idea is unchanged. Try again, or edit the description before asking AIDLC once more.',
    editAnswers: 'Edit plan',
    closeEditor: 'Close editor',
    planNeedsWork: 'A few decisions are still needed',
    planNeedsWorkBody: 'Complete these items yourself or ask AIDLC to recommend an answer.',
    planReady: 'The plan is complete',
    planReadyBody: 'Review the summary below, then mark it ready for approval.',
    checkPlan: 'Mark plan ready',
    approvePlan: 'Approve this plan',
    startWork: 'Create the work',
    reopen: 'Make changes',
    setAside: 'Set aside',
    workStarted: 'Work created',
    save: 'Save changes',
    cancel: 'Cancel',
    summaryTitle: 'Plan summary',
    fields: {
      title: 'Idea name', problem: 'What should improve', outcome: 'Successful result', effort: 'Effort', approach: 'Chosen approach', rationale: 'Why this approach', constraints: 'Constraints', noGos: 'Out of scope', acceptance: 'How we will know it works', risks: 'Risks', architecture: 'Technical impact', questions: 'Questions still open', options: 'Options considered',
    },
    onePerLine: 'one item per line',
    emptyDetailTitle: 'Choose an idea',
    emptyDetailBody: 'Select an idea from the list, or start a new one.',
    blockers: {
      'Project Foundation changed after this Shape was started. Reopen the Shape against the current Foundation.': 'The project background changed. Reopen this idea so it can use the latest information.',
      'Project Foundation is not ready.': 'Prepare the project context before continuing.',
      'Problem is required.': 'Describe what you want to improve.',
      'Desired outcome is required.': 'Describe what a successful result looks like.',
      'Appetite is required.': 'Choose a rough amount of effort.',
      'Selected approach is required.': 'Choose the approach you want to use.',
      'Approach rationale is required.': 'Explain why the chosen approach is a good fit.',
      'At least one no-go is required.': 'Name at least one thing this work should not include.',
      'At least one acceptance criterion is required.': 'Add at least one clear way to check that the result works.',
      'Resolve or explicitly remove all open questions.': 'Answer or remove the remaining open questions.',
    },
  },
  vi: {
    tab: 'Ý tưởng',
    eyebrow: 'LẬP KẾ HOẠCH TRƯỚC KHI XÂY DỰNG',
    title: 'Biến ý tưởng thành kế hoạch rõ ràng',
    subtitle: 'AIDLC giúp bạn mô tả vấn đề, so sánh lựa chọn và xác định thế nào là thành công. Giai đoạn này không thay đổi mã nguồn.',
    languageSettings: 'Đổi ngôn ngữ',
    howItWorks: 'Quy trình hoạt động thế nào',
    closeGuide: 'Ẩn hướng dẫn',
    guideTitle: 'Bốn bước đơn giản',
    guideBody: 'Bạn luôn là người quyết định. AIDLC có thể đề xuất câu trả lời, nhưng chỉ bạn mới có thể duyệt kế hoạch và bắt đầu công việc.',
    steps: [
      { label: 'Mô tả', description: 'Nói điều bạn muốn cải thiện.' },
      { label: 'Thảo luận', description: 'So sánh các lựa chọn với AIDLC.' },
      { label: 'Xem lại', description: 'Kiểm tra kế hoạch bằng ngôn ngữ dễ hiểu.' },
      { label: 'Bắt đầu', description: 'Duyệt và tạo công việc.' },
    ],
    contextTitle: 'Thông tin dự án',
    contextReady: 'Đã sẵn sàng',
    contextNeedsSetup: 'Cần thiết lập một lần',
    contextNeedsUpdate: 'Cần cập nhật',
    contextReadyBody: 'AIDLC đã có đủ thông tin nền để thảo luận ý tưởng mới một cách an toàn.',
    contextSetupBody: 'Chuẩn bị thông tin chung của dự án trước khi bắt đầu ý tưởng đầu tiên.',
    contextUpdateBody: 'Dự án đã thay đổi. Hãy cập nhật thông tin chung trước khi tiếp tục.',
    prepareContext: 'Chuẩn bị thông tin dự án',
    updateContext: 'Cập nhật thông tin dự án',
    createContext: 'Tạo thông tin dự án',
    technicalDetails: 'Chi tiết kỹ thuật',
    revision: 'Phiên bản thông tin',
    sourceCommit: 'Phiên bản mã nguồn',
    startIdea: 'Khám phá ý tưởng mới',
    ideasTitle: 'Ý tưởng của bạn',
    ideasSubtitle: 'Chọn một ý tưởng để tiếp tục từ chỗ đã dừng.',
    noIdeasTitle: 'Chưa có ý tưởng nào',
    noIdeasBody: 'Hãy bắt đầu bằng một vấn đề hoặc điều muốn cải thiện. AIDLC sẽ giúp biến nó thành kế hoạch rõ ràng.',
    wizard: {
      title: 'Khám phá ý tưởng mới',
      step: 'Câu hỏi',
      cancel: 'Hủy',
      back: 'Quay lại',
      continue: 'Tiếp tục',
      start: 'Bắt đầu thảo luận',
      problemTitle: 'Bạn muốn cải thiện điều gì?',
      problemHelp: 'Mô tả điều đang khó khăn, rủi ro, chậm hoặc gây bối rối. Bạn chưa cần biết giải pháp.',
      problemPlaceholder: 'Ví dụ: Người dùng mới không biết cách hoàn tất thiết lập tài khoản.',
      outcomeTitle: 'Khi giải quyết xong, điều gì sẽ tốt hơn?',
      outcomeHelp: 'Mô tả kết quả theo cách có thể quan sát hoặc kiểm tra được.',
      outcomePlaceholder: 'Ví dụ: Người dùng mới có thể tự hoàn tất thiết lập mà không cần hỏi trợ giúp.',
      effortTitle: 'Mức công sức nào là phù hợp?',
      effortHelp: 'Chọn kích thước gần đúng. Bạn có thể thay đổi sau.',
      shortName: 'Tên ngắn (không bắt buộc)',
      shortNameHelp: 'AIDLC sẽ tạo tên từ mô tả nếu bạn để trống.',
      shortNamePlaceholder: 'Ví dụ: Thiết lập tài khoản dễ hơn',
    },
    efforts: [
      { value: 'Một cải tiến nhỏ', label: 'Cải tiến nhỏ', description: 'Thay đổi hẹp, có thể kiểm chứng nhanh.' },
      { value: 'Một chu kỳ thực hiện tập trung', label: 'Một chu kỳ tập trung', description: 'Cải tiến đáng kể với phạm vi rõ ràng.' },
      { value: 'Một sáng kiến lớn chia thành nhiều giai đoạn', label: 'Sáng kiến lớn', description: 'Thay đổi rộng, có thể cần nhiều giai đoạn.' },
    ],
    status: {
      draft: 'Bản nháp', exploring: 'Đang thảo luận', ready: 'Sẵn sàng duyệt', accepted: 'Đã duyệt', converted: 'Đã bắt đầu', shelved: 'Tạm gác',
    },
    suggestPlan: 'Để AIDLC đề xuất kế hoạch',
    suggestPlanHelp: 'AIDLC sẽ dùng các câu trả lời đã lưu trong ý tưởng này và thông tin dự án liên quan. Bạn không cần thảo luận lại hoặc dán JSON. Đề xuất được lưu dưới dạng bản nháp; kế hoạch chỉ thay đổi khi bạn áp dụng.',
    generatingPlan: 'AIDLC đang chuẩn bị đề xuất…',
    generatingPlanHelp: 'Bạn có thể ở lại trang này. Quá trình thường mất chưa đến một phút.',
    proposalReady: 'AIDLC đã có đề xuất',
    proposalReadyBody: 'Bản nháp này đã được lưu và vẫn còn khi bạn mở lại ứng dụng. Chỉ áp dụng khi nội dung đúng với mong muốn của bạn.',
    proposalPreview: 'Kế hoạch được đề xuất',
    applyProposal: 'Áp dụng kế hoạch này',
    discussProposal: 'Thảo luận thêm với agent',
    discardProposal: 'Bỏ đề xuất',
    tryAgain: 'Thử lại',
    generationError: 'AIDLC chưa thể chuẩn bị kế hoạch',
    generationErrorBody: 'Ý tưởng của bạn không bị thay đổi. Hãy thử lại hoặc sửa mô tả trước khi nhờ AIDLC lần nữa.',
    editAnswers: 'Sửa kế hoạch',
    closeEditor: 'Đóng trình sửa',
    planNeedsWork: 'Vẫn còn một vài quyết định cần chốt',
    planNeedsWorkBody: 'Bạn có thể tự hoàn thành hoặc nhờ AIDLC đề xuất câu trả lời.',
    planReady: 'Kế hoạch đã đầy đủ',
    planReadyBody: 'Xem lại bản tóm tắt bên dưới rồi đánh dấu sẵn sàng để duyệt.',
    checkPlan: 'Đánh dấu kế hoạch sẵn sàng',
    approvePlan: 'Duyệt kế hoạch này',
    startWork: 'Tạo công việc',
    reopen: 'Chỉnh sửa lại',
    setAside: 'Tạm gác',
    workStarted: 'Đã tạo công việc',
    save: 'Lưu thay đổi',
    cancel: 'Hủy',
    summaryTitle: 'Tóm tắt kế hoạch',
    fields: {
      title: 'Tên ý tưởng', problem: 'Điều cần cải thiện', outcome: 'Kết quả thành công', effort: 'Mức công sức', approach: 'Hướng tiếp cận đã chọn', rationale: 'Lý do chọn hướng này', constraints: 'Ràng buộc', noGos: 'Ngoài phạm vi', acceptance: 'Cách kiểm tra kết quả', risks: 'Rủi ro', architecture: 'Ảnh hưởng kỹ thuật', questions: 'Câu hỏi còn mở', options: 'Các lựa chọn đã cân nhắc',
    },
    onePerLine: 'mỗi dòng một mục',
    emptyDetailTitle: 'Chọn một ý tưởng',
    emptyDetailBody: 'Chọn ý tưởng trong danh sách hoặc bắt đầu một ý tưởng mới.',
    blockers: {
      'Project Foundation changed after this Shape was started. Reopen the Shape against the current Foundation.': 'Thông tin dự án đã thay đổi. Hãy mở lại ý tưởng để dùng thông tin mới nhất.',
      'Project Foundation is not ready.': 'Chuẩn bị thông tin dự án trước khi tiếp tục.',
      'Problem is required.': 'Mô tả điều bạn muốn cải thiện.',
      'Desired outcome is required.': 'Mô tả kết quả thành công sẽ như thế nào.',
      'Appetite is required.': 'Chọn mức công sức gần đúng.',
      'Selected approach is required.': 'Chọn hướng tiếp cận bạn muốn sử dụng.',
      'Approach rationale is required.': 'Giải thích vì sao hướng tiếp cận này phù hợp.',
      'At least one no-go is required.': 'Nêu ít nhất một việc không nằm trong phạm vi.',
      'At least one acceptance criterion is required.': 'Thêm ít nhất một cách rõ ràng để kiểm tra kết quả.',
      'Resolve or explicitly remove all open questions.': 'Trả lời hoặc xóa các câu hỏi còn lại.',
    },
  },
};

export function discoveryCopy(language: DiscoveryLanguage): DiscoveryCopy {
  return DISCOVERY_COPY[language];
}

export function translateDiscoveryBlocker(blocker: string, language: DiscoveryLanguage): string {
  return DISCOVERY_COPY[language].blockers[blocker] ?? blocker;
}
