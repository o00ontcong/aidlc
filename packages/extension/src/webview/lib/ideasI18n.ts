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
  filters: { all: string; awaitingYou: string; agentRunning: string; blocked: string; done: string; shelved: string };
  list: { emptyTitle: string; emptyBody: string; savedAutomatically: string; resume: string };
  checkpointLabel: Record<IdeasCheckpoint, string>;
  capture: {
    prompt: string;
    placeholder: string;
    hint: string;
    start: string;
    edit: string;
    saveAndRerun: string;
    editConfirmTitle: string;
    editConfirmBody: string;
    editConfirm: string;
  };
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
    readyTitle: string;
    readyBody: string;
    runningTitle: string;
    runningBody: string;
    waitingTitle: string;
    waitingBody: string;
    runInTerminal: string;
    openTerminal: string;
    failedTitle: string;
    stoppedTitle: string;
    stoppedBody: string;
    retry: string;
    stop: string;
    stopConfirmTitle: string;
    stopConfirmBody: string;
    stopConfirm: string;
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
    editAnswers: string;
    editAnswersConfirmTitle: string;
    editAnswersConfirmBody: string;
    editAnswersConfirm: string;
  };
  route: {
    readyTitle: string;
    readyBody: string;
    runInTerminal: string;
    viewIntent: string;
    title: string;
    bootstrapBanner: string;
    assumptionsHeader: (count: number) => string;
    footerNote: string;
    confirm: string;
    viewRoute: string;
    blockedTitle: string;
    stoppedTitle: string;
    stoppedBody: string;
    retry: string;
    stop: string;
    stopConfirmTitle: string;
    stopConfirmBody: string;
    stopConfirm: string;
  };
  delivery: {
    title: (recipeId: string) => string;
    openCanvas: string;
    childStatus: string;
  };
  closed: { title: string; viewEvidence: string };
  completed: { title: string };
  corrupted: {
    banner: (count: number) => string;
    body: string;
    openState: string;
    repair: string;
    delete: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    deleteConfirm: string;
  };
  /** Recap copy shown when a stepper station is clicked but isn't the live/current one. */
  stationRecap: {
    notReached: string;
    captureDone: string;
    intentDone: string;
    routeDone: string;
    routeClosed: string;
    deliveryNone: string;
  };
  actions: {
    shelve: string;
    reopen: string;
    delete: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    deleteConfirm: string;
  };
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
    all: 'All',
    awaitingYou: 'Awaiting you',
    agentRunning: 'Terminal running',
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
    captured: 'Ready to prepare',
    preparing: 'Preparation in terminal',
    awaiting_human: 'Question for you',
    intent_drafted: 'Ready to route',
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
    edit: 'Edit',
    saveAndRerun: 'Save & re-run',
    editConfirmTitle: 'Run again with this edit?',
    editConfirmBody: 'The current preparation and answers will be replaced by a fresh run. Your earlier attempt remains in the audit log.',
    editConfirm: 'Save & re-run',
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
    readyTitle: 'Ready to prepare your questions',
    readyBody: 'Open the configured provider in its native terminal. It will ask you there only when an answer changes the outcome.',
    runningTitle: 'Preparation is running in a terminal',
    runningBody: 'The provider is working in its visible terminal. Its saved checkpoints update this Idea automatically.',
    waitingTitle: 'Your answer is needed in the terminal',
    waitingBody: 'Answer in the provider’s native UI. AIDLC updates automatically as soon as the agent saves the answer.',
    runInTerminal: 'Run in terminal',
    openTerminal: 'Open terminal',
    failedTitle: 'Preparation could not finish',
    stoppedTitle: 'Preparation stopped',
    stoppedBody: 'No answers were discarded. You can safely run this step again when you are ready.',
    retry: 'Re-run',
    stop: 'Stop',
    stopConfirmTitle: 'Stop preparation?',
    stopConfirmBody: 'The agent process will be cancelled. Your idea stays saved and you can re-run this step later.',
    stopConfirm: 'Stop preparation',
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
    editAnswers: 'Edit answers and re-run',
    editAnswersConfirmTitle: 'Re-run the native questions?',
    editAnswersConfirmBody: 'Routing will stop and preparation will reopen in the configured provider, where you can change your answers using its native UI.',
    editAnswersConfirm: 'Open provider again',
  },
  route: {
    readyTitle: 'Ready to route in a terminal',
    readyBody: 'Run the configured provider in its visible terminal. It saves the route directly to this Idea when ready.',
    runInTerminal: 'Run in terminal',
    viewIntent: 'View INTENT.md',
    title: 'Proposed route',
    bootstrapBanner: 'CONTEXT-MANIFEST.json is missing or out of date — cofofo-bootstrap is queued first, ahead of everything else.',
    assumptionsHeader: (count) => `${count} assumption${count === 1 ? '' : 's'} — reviewed once at the plan canvas`,
    footerNote: 'This is an operational confirmation. The content itself is reviewed once, at the plan canvas for the first step.',
    confirm: 'Confirm & run',
    viewRoute: 'View ROUTE.md',
    blockedTitle: 'Routing could not finish',
    stoppedTitle: 'Routing stopped',
    stoppedBody: 'Your answers are saved. You can re-run routing without starting the idea over.',
    retry: 'Re-run',
    stop: 'Stop',
    stopConfirmTitle: 'Stop routing?',
    stopConfirmBody: 'The agent process will be cancelled. Your answers stay saved and you can re-run routing later.',
    stopConfirm: 'Stop routing',
  },
  delivery: {
    title: (recipeId) => `Running ${recipeId}`,
    openCanvas: 'Open plan canvas',
    childStatus: 'Status',
  },
  closed: { title: 'Closed — no build was needed', viewEvidence: 'View EVIDENCE.md' },
  completed: { title: 'Completed' },
  corrupted: {
    banner: (count) => `${count} idea${count === 1 ? '' : 's'} could not be read`,
    body: 'Its saved state no longer matches the expected format — likely a provider wrote an invalid checkpoint. Open the raw state file to inspect or fix it by hand.',
    openState: 'Open state.json',
    repair: 'Repair',
    delete: 'Delete',
    deleteConfirmTitle: 'Delete this idea permanently?',
    deleteConfirmBody: 'Its state was already unreadable. Deleting removes the machine state and its docs/ideas files — this cannot be undone.',
    deleteConfirm: 'Delete permanently',
  },
  stationRecap: {
    notReached: "This idea hasn't reached this step yet.",
    captureDone: 'Preparation is done for this idea.',
    intentDone: 'INTENT.md was written and used to route this idea.',
    routeDone: 'This route was confirmed and is running.',
    routeClosed: 'Routing decided to close this idea — no epic was created.',
    deliveryNone: 'No epic exists at this step.',
  },
  actions: {
    shelve: 'Set aside',
    reopen: 'Reopen',
    delete: 'Delete',
    deleteConfirmTitle: 'Delete this idea permanently?',
    deleteConfirmBody: 'This removes the saved state and its docs/ideas files. Any epic already created from it stays untouched — this cannot be undone.',
    deleteConfirm: 'Delete permanently',
  },
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
    all: 'Tất cả',
    awaitingYou: 'Chờ bạn',
    agentRunning: 'Terminal đang chạy',
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
    captured: 'Sẵn sàng chuẩn bị',
    preparing: 'Chuẩn bị trong terminal',
    awaiting_human: 'Câu hỏi cho bạn',
    intent_drafted: 'Sẵn sàng định tuyến',
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
    edit: 'Chỉnh sửa',
    saveAndRerun: 'Lưu & chạy lại',
    editConfirmTitle: 'Chạy lại với nội dung đã sửa?',
    editConfirmBody: 'Phần chuẩn bị và câu trả lời hiện tại sẽ được thay bằng một lượt chạy mới. Lần trước vẫn còn trong nhật ký.',
    editConfirm: 'Lưu & chạy lại',
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
    readyTitle: 'Sẵn sàng chuẩn bị câu hỏi',
    readyBody: 'Mở provider mặc định trong terminal native. Provider chỉ hỏi bạn tại đó khi câu trả lời thực sự làm thay đổi kết quả.',
    runningTitle: 'Bước chuẩn bị đang chạy trong terminal',
    runningBody: 'Provider đang làm việc trong terminal hiển thị. Mỗi checkpoint provider lưu sẽ tự cập nhật Idea này.',
    waitingTitle: 'Cần câu trả lời của bạn trong terminal',
    waitingBody: 'Hãy trả lời bằng giao diện native của provider. AIDLC tự cập nhật ngay khi agent lưu câu trả lời.',
    runInTerminal: 'Chạy trong terminal',
    openTerminal: 'Mở terminal',
    failedTitle: 'Chuẩn bị chưa xong được',
    stoppedTitle: 'Đã dừng chuẩn bị',
    stoppedBody: 'Không có câu trả lời nào bị mất. Bạn có thể chạy lại bước này khi sẵn sàng.',
    retry: 'Chạy lại',
    stop: 'Dừng',
    stopConfirmTitle: 'Dừng bước chuẩn bị?',
    stopConfirmBody: 'Tiến trình agent sẽ bị huỷ. Ý tưởng vẫn được lưu và bạn có thể chạy lại bước này sau.',
    stopConfirm: 'Dừng chuẩn bị',
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
    editAnswers: 'Sửa câu trả lời và chạy lại',
    editAnswersConfirmTitle: 'Chạy lại câu hỏi native?',
    editAnswersConfirmBody: 'Định tuyến sẽ dừng và bước chuẩn bị sẽ mở lại trong provider mặc định; bạn sửa câu trả lời ngay bằng giao diện native của provider.',
    editAnswersConfirm: 'Mở lại provider',
  },
  route: {
    readyTitle: 'Sẵn sàng định tuyến trong terminal',
    readyBody: 'Chạy provider mặc định trong terminal hiển thị. Khi sẵn sàng, provider sẽ tự lưu tuyến vào Idea này.',
    runInTerminal: 'Chạy trong terminal',
    viewIntent: 'Xem INTENT.md',
    title: 'Tuyến đề xuất',
    bootstrapBanner: 'CONTEXT-MANIFEST.json hết hiệu lực hoặc chưa có — cofofo-bootstrap được xếp chạy trước, trước mọi việc khác.',
    assumptionsHeader: (count) => `${count} giả định — sẽ được duyệt một lần ở plan canvas`,
    footerNote: 'Đây là xác nhận thao tác. Nội dung được review một lần ở plan canvas của bước đầu tiên.',
    confirm: 'Xác nhận & chạy',
    viewRoute: 'Xem ROUTE.md',
    blockedTitle: 'Định tuyến chưa xong được',
    stoppedTitle: 'Đã dừng định tuyến',
    stoppedBody: 'Câu trả lời của bạn vẫn được lưu. Bạn có thể chạy lại định tuyến mà không phải bắt đầu lại ý tưởng.',
    retry: 'Chạy lại',
    stop: 'Dừng',
    stopConfirmTitle: 'Dừng định tuyến?',
    stopConfirmBody: 'Tiến trình agent sẽ bị huỷ. Câu trả lời vẫn được lưu và bạn có thể chạy lại định tuyến sau.',
    stopConfirm: 'Dừng định tuyến',
  },
  delivery: {
    title: (recipeId) => `Đang chạy ${recipeId}`,
    openCanvas: 'Mở plan canvas',
    childStatus: 'Trạng thái',
  },
  closed: { title: 'Đã đóng — không cần xây gì', viewEvidence: 'Xem EVIDENCE.md' },
  completed: { title: 'Đã hoàn tất' },
  corrupted: {
    banner: (count) => `${count} ý tưởng không đọc được`,
    body: 'Trạng thái đã lưu không còn khớp định dạng mong đợi — nhiều khả năng provider đã ghi một checkpoint không hợp lệ. Mở file trạng thái gốc để kiểm tra hoặc sửa tay.',
    openState: 'Mở state.json',
    repair: 'Sửa',
    delete: 'Xoá',
    deleteConfirmTitle: 'Xoá vĩnh viễn ý tưởng này?',
    deleteConfirmBody: 'Trạng thái của nó đã không đọc được rồi. Xoá sẽ gỡ cả state máy lẫn các file trong docs/ideas — không thể hoàn tác.',
    deleteConfirm: 'Xoá vĩnh viễn',
  },
  stationRecap: {
    notReached: 'Idea chưa tới bước này.',
    captureDone: 'Bước chuẩn bị đã hoàn tất.',
    intentDone: 'INTENT.md đã được ghi và dùng để định tuyến idea này.',
    routeDone: 'Tuyến này đã được xác nhận và đang chạy.',
    routeClosed: 'Routing quyết định đóng idea này — không tạo epic nào.',
    deliveryNone: 'Chưa có epic nào ở bước này.',
  },
  actions: {
    shelve: 'Gác lại',
    reopen: 'Mở lại',
    delete: 'Xoá',
    deleteConfirmTitle: 'Xoá vĩnh viễn ý tưởng này?',
    deleteConfirmBody: 'Thao tác này xoá state đã lưu và các file trong docs/ideas. Epic đã tạo từ idea này (nếu có) vẫn giữ nguyên — không thể hoàn tác.',
    deleteConfirm: 'Xoá vĩnh viễn',
  },
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
