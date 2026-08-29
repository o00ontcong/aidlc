/**
 * Ideas tab copy. Same two-language, no-interpolation pattern as the retired
 * `discoveryI18n.ts` (see docs/design/ideas-tab/*.canvas.tsx for the source
 * screens this covers) — a flat object per language, looked up by key.
 */
export type IdeasLanguage = 'en' | 'vi';

export type IdeasCheckpoint =
  | 'captured' | 'preparing' | 'awaiting_human' | 'intent_drafted'
  | 'route_proposed' | 'in_delivery' | 'closed' | 'completed' | 'shelved';

interface IdeasCopy {
  tab: string;
  header: { eyebrow: string; title: string; subtitle: string };
  newIdea: string;
  filters: { awaitingYou: string; agentRunning: string; blocked: string; done: string; shelved: string };
  list: { emptyTitle: string; emptyBody: string; savedAutomatically: string; resume: string };
  checkpointLabel: Record<IdeasCheckpoint, string>;
  capture: { prompt: string; placeholder: string; hint: string; start: string };
  resume: {
    savedAt: (time: string) => string;
    continueButton: string;
    saveAndExit: string;
    restart: string;
    restartConfirmTitle: string;
    restartConfirmBody: string;
    restartConfirm: string;
    cancel: string;
  };
  prep: {
    startingTitle: string;
    runningTitle: string;
    runningBody: string;
    failedTitle: string;
    retry: string;
    selfAnsweredHeader: (count: number) => string;
    selfAnsweredCaption: string;
    flagWrong: string;
    flagged: string;
  };
  intentPending: { title: string; body: string };
  batch: {
    progress: (answered: number, total: number) => string;
    decideRest: string;
    decideRestConfirmTitle: string;
    decideRestConfirmBody: string;
    decideRestConfirm: string;
    recommended: string;
    submit: string;
    saved: string;
    saving: string;
    saveFailed: string;
    retrySave: string;
  };
  route: {
    title: string;
    bootstrapBanner: string;
    assumptionsHeader: (count: number) => string;
    footerNote: string;
    confirm: string;
    blockedTitle: string;
    retry: string;
  };
  delivery: {
    title: (recipeId: string) => string;
    openCanvas: string;
    childStatus: string;
  };
  closed: { title: string };
  completed: { title: string };
  actions: { shelve: string; reopen: string };
  foundationStaleBanner: string;
  conflict: {
    title: string;
    body: string;
    reload: string;
  };
  switchConfirm: {
    title: string;
    body: string;
    discard: string;
    stay: string;
  };
  languageSettings: string;
}

const en: IdeasCopy = {
  tab: 'Ideas',
  header: {
    eyebrow: 'IDEAS',
    title: 'Your ideas',
    subtitle: 'One sentence is enough. An agent asks only what changes the outcome.',
  },
  newIdea: '+ New idea',
  filters: {
    awaitingYou: 'Awaiting you',
    agentRunning: 'Agent running',
    blocked: 'Blocked',
    done: 'Done',
    shelved: 'Shelved',
  },
  list: {
    emptyTitle: 'No ideas yet',
    emptyBody: 'Describe what should change — no need to know the fix, or how hard it is.',
    savedAutomatically: 'Saved automatically. Open an in-progress idea to pick up right where you left it.',
    resume: 'Continue',
  },
  checkpointLabel: {
    captured: 'Seed saved',
    preparing: 'Agent preparing',
    awaiting_human: 'Question for you',
    intent_drafted: 'Preparing route',
    route_proposed: 'Review route',
    in_delivery: 'In delivery',
    closed: 'Closed',
    completed: 'Completed',
    shelved: 'Shelved',
  },
  capture: {
    prompt: 'What do you want different?',
    placeholder: 'e.g. The list never refreshes, it feels stuck…',
    hint: 'The agent will read AGENTS.md, PROJECT-RULES.json, ARCHITECTURE-MAP.md and the code before asking anything.',
    start: 'Start',
  },
  resume: {
    savedAt: (time) => `Saved at ${time}`,
    continueButton: 'Continue',
    saveAndExit: 'Save & exit',
    restart: 'Start over',
    restartConfirmTitle: 'Start this idea over?',
    restartConfirmBody: 'The current seed and answers are superseded, not deleted — every prior attempt stays in the audit log.',
    restartConfirm: 'Start over',
    cancel: 'Cancel',
  },
  prep: {
    startingTitle: 'Saved. Preparing your questions…',
    runningTitle: 'Reading the project before asking anything',
    runningBody: 'The agent is reading AGENTS.md, PROJECT-RULES.json, ARCHITECTURE-MAP.md and the code — it will only ask what actually changes the outcome.',
    failedTitle: 'Preparation could not finish',
    retry: 'Retry',
    selfAnsweredHeader: (count) => `${count} question${count === 1 ? '' : 's'} the agent answered itself`,
    selfAnsweredCaption: 'Open one to check it against its source. A question it could have answered but still asks is a bug.',
    flagWrong: 'This is wrong',
    flagged: 'Flagged — will be asked instead next time',
  },
  intentPending: {
    title: 'Preparing the route',
    body: 'Your answers are saved. Routing to a recipe is landing in a follow-up pass.',
  },
  batch: {
    progress: (answered, total) => `${answered}/${total} answered`,
    decideRest: 'You decide the rest',
    decideRestConfirmTitle: 'Use the recommended answer for everything left?',
    decideRestConfirmBody: 'Unanswered questions become labeled assumptions, reviewed once where the plan itself is reviewed — not lost, not silent.',
    decideRestConfirm: 'Use recommendations',
    recommended: 'RECOMMENDED',
    submit: 'Done',
    saved: 'Saved',
    saving: 'Saving…',
    saveFailed: 'Could not save — try again before closing this tab.',
    retrySave: 'Retry',
  },
  route: {
    title: 'Proposed route',
    bootstrapBanner: 'CONTEXT-MANIFEST.json is missing or out of date — cofofo-bootstrap is queued first, ahead of everything else.',
    assumptionsHeader: (count) => `${count} assumption${count === 1 ? '' : 's'} — reviewed once at the plan canvas`,
    footerNote: 'This is an operational confirmation. The content itself is reviewed once, at the plan canvas for the first step.',
    confirm: 'Confirm & run',
    blockedTitle: 'Routing could not finish',
    retry: 'Retry',
  },
  delivery: {
    title: (recipeId) => `Running ${recipeId}`,
    openCanvas: 'Open plan canvas',
    childStatus: 'Status',
  },
  closed: { title: 'Closed — no build was needed' },
  completed: { title: 'Completed' },
  actions: { shelve: 'Set aside', reopen: 'Reopen' },
  foundationStaleBanner: 'CONTEXT-MANIFEST.json changed since you captured this idea — routing will prepend cofofo-bootstrap when you confirm.',
  conflict: {
    title: 'This idea was updated elsewhere',
    body: 'Another tab or session saved a newer version. Reload to continue with the latest state.',
    reload: 'Reload latest',
  },
  switchConfirm: {
    title: 'Discard unsaved changes?',
    body: 'You have an answer that has not finished saving. Switch anyway and lose it?',
    discard: 'Switch anyway',
    stay: 'Stay here',
  },
  languageSettings: 'Display language',
};

const vi: IdeasCopy = {
  tab: 'Ý tưởng',
  header: {
    eyebrow: 'Ý TƯỞNG',
    title: 'Ý tưởng của bạn',
    subtitle: 'Một câu là đủ. Agent chỉ hỏi những gì làm thay đổi kết quả.',
  },
  newIdea: '+ Ý tưởng mới',
  filters: {
    awaitingYou: 'Chờ bạn',
    agentRunning: 'Agent đang chạy',
    blocked: 'Bị chặn',
    done: 'Đã xong',
    shelved: 'Đã gác',
  },
  list: {
    emptyTitle: 'Chưa có ý tưởng nào',
    emptyBody: 'Mô tả điều bạn muốn khác đi — không cần biết cách sửa, cũng không cần biết nó khó hay dễ.',
    savedAutomatically: 'Được lưu tự động. Mở một ý tưởng đang dở để tiếp tục đúng chỗ bạn dừng.',
    resume: 'Tiếp tục',
  },
  checkpointLabel: {
    captured: 'Đã lưu câu ý tưởng',
    preparing: 'Agent đang chuẩn bị',
    awaiting_human: 'Câu hỏi cho bạn',
    intent_drafted: 'Đang chuẩn bị tuyến',
    route_proposed: 'Duyệt tuyến',
    in_delivery: 'Đang giao hàng',
    closed: 'Đã đóng',
    completed: 'Đã hoàn tất',
    shelved: 'Đã gác',
  },
  capture: {
    prompt: 'Bạn muốn điều gì khác đi?',
    placeholder: 'Ví dụ: Danh sách không cập nhật, mở app cứ tưởng nó treo…',
    hint: 'Agent sẽ đọc AGENTS.md, PROJECT-RULES.json, ARCHITECTURE-MAP.md và code trước khi hỏi bạn câu nào.',
    start: 'Bắt đầu',
  },
  resume: {
    savedAt: (time) => `Đã lưu lúc ${time}`,
    continueButton: 'Tiếp tục',
    saveAndExit: 'Lưu & thoát',
    restart: 'Bắt đầu lại',
    restartConfirmTitle: 'Bắt đầu lại ý tưởng này?',
    restartConfirmBody: 'Câu ý tưởng và câu trả lời hiện tại bị thay thế, không bị xoá — mọi lần thử trước vẫn còn trong nhật ký.',
    restartConfirm: 'Bắt đầu lại',
    cancel: 'Huỷ',
  },
  prep: {
    startingTitle: 'Đã lưu. Đang chuẩn bị câu hỏi cho bạn…',
    runningTitle: 'Đang đọc dự án trước khi hỏi bất cứ điều gì',
    runningBody: 'Agent đang đọc AGENTS.md, PROJECT-RULES.json, ARCHITECTURE-MAP.md và code — chỉ hỏi những gì thật sự làm thay đổi kết quả.',
    failedTitle: 'Chuẩn bị chưa xong được',
    retry: 'Thử lại',
    selfAnsweredHeader: (count) => `${count} câu agent đã tự trả lời`,
    selfAnsweredCaption: 'Mở ra xem để kiểm tra so với nguồn. Câu nào tra được mà vẫn hỏi là bug.',
    flagWrong: 'Câu này sai',
    flagged: 'Đã gắn cờ — lần sau sẽ hỏi lại câu này',
  },
  intentPending: {
    title: 'Đang chuẩn bị tuyến',
    body: 'Câu trả lời của bạn đã được lưu. Phần định tuyến sang recipe sẽ có trong một đợt cập nhật kế tiếp.',
  },
  batch: {
    progress: (answered, total) => `${answered}/${total} đã trả lời`,
    decideRest: 'Bạn quyết hết',
    decideRestConfirmTitle: 'Dùng khuyến nghị cho mọi câu còn lại?',
    decideRestConfirmBody: 'Câu chưa trả lời sẽ thành giả định có nhãn, được duyệt một lần ở chỗ review kế hoạch — không mất, không âm thầm.',
    decideRestConfirm: 'Dùng khuyến nghị',
    recommended: 'KHUYẾN NGHỊ',
    submit: 'Xong',
    saved: 'Đã lưu',
    saving: 'Đang lưu…',
    saveFailed: 'Không lưu được — thử lại trước khi đóng tab này.',
    retrySave: 'Thử lại',
  },
  route: {
    title: 'Tuyến đề xuất',
    bootstrapBanner: 'CONTEXT-MANIFEST.json hết hiệu lực hoặc chưa có — cofofo-bootstrap được xếp chạy trước, trước mọi việc khác.',
    assumptionsHeader: (count) => `${count} giả định — sẽ được duyệt một lần ở plan canvas`,
    footerNote: 'Đây là xác nhận thao tác. Nội dung được review một lần ở plan canvas của bước đầu tiên.',
    confirm: 'Xác nhận & chạy',
    blockedTitle: 'Định tuyến chưa xong được',
    retry: 'Thử lại',
  },
  delivery: {
    title: (recipeId) => `Đang chạy ${recipeId}`,
    openCanvas: 'Mở plan canvas',
    childStatus: 'Trạng thái',
  },
  closed: { title: 'Đã đóng — không cần xây gì' },
  completed: { title: 'Đã hoàn tất' },
  actions: { shelve: 'Gác lại', reopen: 'Mở lại' },
  foundationStaleBanner: 'CONTEXT-MANIFEST.json đã đổi kể từ khi bạn lưu ý tưởng — khi xác nhận tuyến sẽ chèn cofofo-bootstrap trước.',
  conflict: {
    title: 'Ý tưởng này vừa được cập nhật ở nơi khác',
    body: 'Tab hoặc phiên khác đã lưu bản mới hơn. Tải lại để tiếp tục với trạng thái mới nhất.',
    reload: 'Tải lại',
  },
  switchConfirm: {
    title: 'Bỏ thay đổi chưa lưu?',
    body: 'Bạn có câu trả lời đang lưu dở. Chuyển sang ý tưởng khác và mất nó?',
    discard: 'Vẫn chuyển',
    stay: 'Ở lại',
  },
  languageSettings: 'Ngôn ngữ hiển thị',
};

const IDEAS_COPY: Record<IdeasLanguage, IdeasCopy> = { en, vi };

export function ideasCopy(language: IdeasLanguage): IdeasCopy {
  return IDEAS_COPY[language];
}
