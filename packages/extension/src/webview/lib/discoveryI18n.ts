export type DiscoveryLanguage = 'en' | 'vi';

type DiscoveryStatus = 'draft' | 'exploring' | 'ready' | 'accepted' | 'converted' | 'shelved';

type EngineeringLoopStageId = 'research' | 'plan' | 'test' | 'implement' | 'review' | 'verify' | 'remember' | 'improve';

interface EngineeringLoopStage {
  id: EngineeringLoopStageId;
  label: string;
  description: string;
  /** This stage starts only after the human approves the Idea. */
  handoff?: boolean;
}

interface EngineeringPillar {
  stageIds: [EngineeringLoopStageId, EngineeringLoopStageId];
  label: string;
  description: string;
}

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
  engineeringLoopTitle: string;
  engineeringLoopBody: string;
  engineeringLoop: EngineeringLoopStage[];
  engineeringPillars: EngineeringPillar[];
  approvalGate: string;
  deliveryHandoffTitle: string;
  deliveryHandoffBody: string;
  deliveryHandoffReady: string;
  deliveryHandoffActive: string;
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
    eyebrow: 'FROM IDEA TO APPROVED PLAN',
    title: 'Describe the change. Review the plan. Stay in control.',
    subtitle: 'Tell AIDLC what should improve. It studies the project and prepares a plan you can review before any code changes.',
    languageSettings: 'Change language',
    howItWorks: 'How this works',
    closeGuide: 'Hide guide',
    guideTitle: 'What happens from idea to delivery',
    guideBody: 'AIDLC first learns how your project already works, then drafts a plan. You can change or approve it. After approval, delivery uses tests, an independent review, final checks, and saved lessons.',
    steps: [
      { label: 'Describe', description: 'Explain the problem and the result you want.' },
      { label: 'Review', description: 'Let AIDLC study the project and prepare a draft.' },
      { label: 'Approve & start', description: 'Approve the plan before delivery begins.' },
    ],
    engineeringLoopTitle: 'Why delivery is safer with ECC',
    engineeringLoopBody: 'ECC is the behind-the-scenes engineering workflow. Open this only when you want to see its delivery safeguards.',
    engineeringLoop: [
      { id: 'research', label: 'Research', description: 'Use project context and relevant code patterns as evidence.' },
      { id: 'plan', label: 'Plan', description: 'Set scope, risks, acceptance evidence, and validation.' },
      { id: 'test', label: 'Test first', description: 'Turn accepted behavior into a failing test before code changes.', handoff: true },
      { id: 'implement', label: 'Implement', description: 'Make the smallest change that satisfies the test.', handoff: true },
      { id: 'review', label: 'Review', description: 'Inspect the implementation from a fresh context.', handoff: true },
      { id: 'verify', label: 'Verify', description: 'Run the agreed tests and capture actual evidence.', handoff: true },
      { id: 'remember', label: 'Remember', description: 'Keep decisions and evidence with the delivery record.', handoff: true },
      { id: 'improve', label: 'Improve', description: 'Turn repeating wins into reusable workflow knowledge.', handoff: true },
    ],
    engineeringPillars: [
      { stageIds: ['research', 'plan'], label: 'Understand before deciding', description: 'AIDLC checks project context and existing patterns before recommending a plan.' },
      { stageIds: ['test', 'implement'], label: 'Prove before changing', description: 'Delivery starts with a failing test, then makes the smallest change needed.' },
      { stageIds: ['review', 'verify'], label: 'Check with fresh eyes', description: 'A separate review looks for blind spots before final tests confirm the result.' },
      { stageIds: ['remember', 'improve'], label: 'Keep what was learned', description: 'Evidence and useful lessons stay with the work instead of disappearing in chat.' },
    ],
    approvalGate: 'Nothing is implemented until you approve the plan.',
    deliveryHandoffTitle: 'Delivery handoff',
    deliveryHandoffBody: 'The approved plan becomes the test contract for the Epic: write the failing test, implement the smallest change, review from a fresh context, verify the result, and save evidence and learnings.',
    deliveryHandoffReady: 'Approved — ready for test-first delivery',
    deliveryHandoffActive: 'Delivery created — follow the engineering loop in the Epic',
    contextTitle: 'Project knowledge',
    contextReady: 'Ready',
    contextNeedsSetup: 'One-time setup needed',
    contextNeedsUpdate: 'Needs an update',
    contextReadyBody: 'AIDLC understands enough about this project to prepare a grounded plan.',
    contextSetupBody: 'Let AIDLC learn the project once before starting your first idea.',
    contextUpdateBody: 'The project changed. Refresh what AIDLC knows before continuing.',
    prepareContext: 'Learn this project',
    updateContext: 'Refresh project knowledge',
    createContext: 'Set up project knowledge',
    technicalDetails: 'Technical details',
    revision: 'Context version',
    sourceCommit: 'Source version',
    startIdea: 'Start with an idea',
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
    suggestPlan: 'Research the project and draft my plan',
    suggestPlanHelp: 'AIDLC checks the relevant parts of the project, compares practical options, and prepares a draft for you. Nothing changes until you review and apply it.',
    generatingPlan: 'AIDLC is studying the project and preparing your draft…',
    generatingPlanHelp: 'It is checking existing patterns, risks, and how the result can be proven.',
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
    eyebrow: 'TỪ Ý TƯỞNG ĐẾN KẾ HOẠCH ĐÃ DUYỆT',
    title: 'Mô tả thay đổi. Xem lại kế hoạch. Bạn luôn quyết định.',
    subtitle: 'Cho AIDLC biết điều cần cải thiện. AIDLC sẽ tìm hiểu dự án và chuẩn bị một kế hoạch để bạn xem lại trước khi mã nguồn thay đổi.',
    languageSettings: 'Đổi ngôn ngữ',
    howItWorks: 'Quy trình hoạt động thế nào',
    closeGuide: 'Ẩn hướng dẫn',
    guideTitle: 'Điều gì xảy ra từ ý tưởng đến thực thi',
    guideBody: 'AIDLC trước tiên tìm hiểu cách dự án đang hoạt động, rồi chuẩn bị kế hoạch. Bạn có thể yêu cầu sửa hoặc phê duyệt. Sau đó phần thực thi dùng kiểm thử, review độc lập, kiểm tra cuối và lưu lại bài học.',
    steps: [
      { label: 'Mô tả', description: 'Nêu vấn đề và kết quả bạn mong muốn.' },
      { label: 'Xem lại', description: 'Để AIDLC tìm hiểu dự án và chuẩn bị bản nháp.' },
      { label: 'Duyệt & bắt đầu', description: 'Duyệt kế hoạch trước khi thực thi.' },
    ],
    engineeringLoopTitle: 'Vì sao ECC giúp thực thi an toàn hơn',
    engineeringLoopBody: 'ECC là quy trình kỹ thuật hoạt động phía sau. Chỉ mở phần này khi bạn muốn xem các lớp bảo vệ trong lúc thực thi.',
    engineeringLoop: [
      { id: 'research', label: 'Nghiên cứu', description: 'Dùng bối cảnh dự án và các mẫu mã liên quan làm bằng chứng.' },
      { id: 'plan', label: 'Lập kế hoạch', description: 'Chốt phạm vi, rủi ro, bằng chứng chấp nhận và cách kiểm chứng.' },
      { id: 'test', label: 'Test trước', description: 'Chuyển hành vi đã chấp nhận thành test thất bại trước khi sửa mã.', handoff: true },
      { id: 'implement', label: 'Triển khai', description: 'Chỉ thực hiện thay đổi nhỏ nhất để test đạt.', handoff: true },
      { id: 'review', label: 'Review', description: 'Kiểm tra phần triển khai từ ngữ cảnh mới, độc lập.', handoff: true },
      { id: 'verify', label: 'Kiểm chứng', description: 'Chạy các test đã thống nhất và lưu bằng chứng thực tế.', handoff: true },
      { id: 'remember', label: 'Ghi nhớ', description: 'Lưu quyết định và bằng chứng cùng hồ sơ thực thi.', handoff: true },
      { id: 'improve', label: 'Cải thiện', description: 'Biến kết quả lặp lại thành kiến thức quy trình có thể tái sử dụng.', handoff: true },
    ],
    engineeringPillars: [
      { stageIds: ['research', 'plan'], label: 'Hiểu trước khi quyết định', description: 'AIDLC kiểm tra bối cảnh và các mẫu hiện có trước khi đề xuất kế hoạch.' },
      { stageIds: ['test', 'implement'], label: 'Chứng minh trước khi thay đổi', description: 'Phần thực thi bắt đầu bằng test thất bại, rồi chỉ thay đổi phần nhỏ nhất cần thiết.' },
      { stageIds: ['review', 'verify'], label: 'Kiểm tra bằng góc nhìn mới', description: 'Một lượt review độc lập tìm điểm mù trước khi kiểm thử cuối xác nhận kết quả.' },
      { stageIds: ['remember', 'improve'], label: 'Giữ lại điều đã học', description: 'Bằng chứng và bài học hữu ích được lưu cùng công việc thay vì mất trong đoạn chat.' },
    ],
    approvalGate: 'Không có phần triển khai nào bắt đầu cho đến khi bạn duyệt kế hoạch.',
    deliveryHandoffTitle: 'Bàn giao thực thi',
    deliveryHandoffBody: 'Kế hoạch đã duyệt trở thành hợp đồng kiểm thử cho Epic: viết test thất bại, thực hiện thay đổi nhỏ nhất, review từ ngữ cảnh mới, kiểm chứng kết quả, rồi lưu bằng chứng và bài học.',
    deliveryHandoffReady: 'Đã duyệt — sẵn sàng thực thi test-first',
    deliveryHandoffActive: 'Đã tạo phần thực thi — theo dõi vòng kỹ thuật trong Epic',
    contextTitle: 'Hiểu biết về dự án',
    contextReady: 'Đã sẵn sàng',
    contextNeedsSetup: 'Cần thiết lập một lần',
    contextNeedsUpdate: 'Cần cập nhật',
    contextReadyBody: 'AIDLC đã hiểu đủ về dự án để chuẩn bị một kế hoạch có căn cứ.',
    contextSetupBody: 'Hãy để AIDLC tìm hiểu dự án một lần trước khi bắt đầu ý tưởng đầu tiên.',
    contextUpdateBody: 'Dự án đã thay đổi. Hãy làm mới hiểu biết của AIDLC trước khi tiếp tục.',
    prepareContext: 'Tìm hiểu dự án',
    updateContext: 'Làm mới hiểu biết dự án',
    createContext: 'Thiết lập hiểu biết dự án',
    technicalDetails: 'Chi tiết kỹ thuật',
    revision: 'Phiên bản thông tin',
    sourceCommit: 'Phiên bản mã nguồn',
    startIdea: 'Bắt đầu với một ý tưởng',
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
    suggestPlan: 'Nghiên cứu dự án và soạn kế hoạch cho tôi',
    suggestPlanHelp: 'AIDLC kiểm tra các phần liên quan của dự án, so sánh các lựa chọn thực tế và chuẩn bị bản nháp cho bạn. Không có gì thay đổi cho đến khi bạn xem và áp dụng.',
    generatingPlan: 'AIDLC đang tìm hiểu dự án và chuẩn bị bản nháp…',
    generatingPlanHelp: 'AIDLC đang kiểm tra các mẫu hiện có, rủi ro và cách chứng minh kết quả.',
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
