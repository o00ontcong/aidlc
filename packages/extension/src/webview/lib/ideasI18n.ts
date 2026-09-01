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
  header: { eyebrow: string; title: string; subtitle: string; openGuide: string };
  newIdea: string;
  filters: { all: string; writing: string; ready: string; blocked: string; done: string; shelved: string };
  list: {
    emptyTitle: string; emptyBody: string; savedAutomatically: string; resume: string;
    missingCount: (n: number) => string;
    needsReview: string;
  };
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
    /** F22 — Canvas gate on the routing decision, before it can be confirmed or (for a close outcome) finalized. */
    reviewGateTitle: string;
    reviewGateBodyEpics: string;
    reviewGateBodyClose: string;
    approvedNote: (reviewer: string) => string;
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
  stages: {
    subtitle: string;
    labels: Record<'understand' | 'research' | 'explore' | 'decide' | 'ready', string>;
    save: string;
    saving: string;
    add: string;
    remove: string;
    edit: string;
    continueWithAi: string;
    runPipeline: string;
    runPipelineHint: string;
    runStage: (stage: string) => string;
    runStageHint: (stage: string) => string;
    copyCommand: string;
    copyCommandHint: string;
    copyFullPrompt: string;
    copyFullPromptHint: string;
    notePlaceholder: string;
    pasteFromAi: string;
    importFromFile: string;
    importFromFileHint: string;
    foundFilesTitle: string;
    importFile: string;
    agentOutputNotCreated: string;
    pasteModalTitle: string;
    pastePlaceholder: string;
    pasteSubmit: string;
    importIssuesTitle: string;
    aiProposes: string;
    accept: string;
    reject: string;
    quickReplies: string[];
    needsReviewBanner: (reason: string) => string;
    understand: {
      originalIdea: string;
      problem: string;
      context: string;
      users: string;
      usersHint: string;
      assumptions: string;
      unknowns: string;
      continueTo: string;
    };
    research: {
      findings: string;
      noFindings: string;
      findingTypeLabel: Record<'fact' | 'assumption' | 'inference', string>;
      findingType: string;
      findingText: string;
      existingSolutions: string;
      sourcesTitle: string;
      sourcePath: string;
      sourceQuestion: string;
      read: string;
      unknowns: string;
      continueTo: string;
    };
    explore: {
      options: string;
      noOptions: string;
      optionTitle: string;
      description: string;
      pros: string;
      cons: string;
      risks: string;
      tradeoffs: string;
      validation: string;
      ideaValidations: string;
      continueTo: string;
    };
    decide: {
      status: string;
      statusLabel: Record<'go' | 'no-go' | 'later' | 'more-research' | 'change-direction', string>;
      recommendation: string;
      finalIdea: string;
      scope: string;
      outOfScope: string;
      validation: string;
      successCriteria: string;
      nextStep: string;
      markReady: string;
      markReadyHint: string;
      epicTitle: string;
      recipe: string;
    };
    ready: {
      hint: string;
      notReadyYet: string;
      scaffoldEpic: string;
      scaffoldedBody: string;
      openResearchFile: string;
      viewResearch: string;
    };
    translateArtifacts: string;
  };
}

const en: IdeasCopy = {
  tab: 'Ideas',
  header: {
    eyebrow: 'IDEAS',
    title: 'Your ideas',
    subtitle: 'A research workspace for each idea — Understand, Research, Explore, Decide, then Ready.',
    openGuide: 'Open Ideas pipeline guide',
  },
  newIdea: '+ New idea',
  filters: {
    all: 'All',
    writing: 'In progress',
    ready: 'Ready',
    blocked: 'Blocked',
    done: 'Done',
    shelved: 'Shelved',
  },
  list: {
    emptyTitle: 'No ideas yet',
    emptyBody: 'Describe what should change — no need to know the fix, or how hard it is.',
    savedAutomatically: 'Saved automatically. Open an in-progress idea to pick up right where you left it.',
    resume: 'Continue',
    missingCount: (n) => `${n} missing`,
    needsReview: 'needs review',
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
    hint: 'One sentence is enough. You will work through Understand, Research, Explore and Decide next.',
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
    footerNote: 'ROUTE.md was approved in Canvas. Confirming now scaffolds the epic(s) below.',
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
    reviewGateTitle: 'Awaiting Canvas review',
    reviewGateBodyEpics: 'Review ROUTE.md in Canvas before this route can be confirmed. Request changes to send routing back for a redo.',
    reviewGateBodyClose: 'Review EVIDENCE.md in Canvas — approving it closes this idea; request changes to send routing back for a redo.',
    approvedNote: (reviewer) => `Approved by ${reviewer}.`,
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
  stages: {
    subtitle: 'The app tracks what stage this idea is at and what is still missing — AI may help fill it in, you decide what sticks.',
    labels: { understand: 'Understand', research: 'Research', explore: 'Explore', decide: 'Decide', ready: 'Ready' },
    save: 'Save',
    saving: 'Saving…',
    add: 'Add',
    remove: 'Remove',
    edit: 'Edit',
    continueWithAi: 'Continue with AI',
    runPipeline: 'Continue Idea pipeline with AI',
    runPipelineHint: 'Continues the Idea from its actual current workflow stage. The agent detects that stage from RESEARCH.md and handles one stage per run.',
    runStage: (stage) => `Run ${stage} with AI`,
    runStageHint: (stage) => `Runs the agent only for the selected ${stage} stage and includes the optional note above. It does not change the Idea's current workflow stage.`,
    copyCommand: 'Copy command',
    copyCommandHint: 'Paste into Claude Code, Cursor, Codex, or OpenCode already open in this workspace — it runs with the right agent, skill, rules, and validation, then writes its findings to a notes file for you to read back in.',
    copyFullPrompt: 'Copy full prompt',
    copyFullPromptHint: 'For a plain chat with no file access (ChatGPT web, Claude.ai web, ...) — copies the whole prompt as text; paste its reply back below.',
    notePlaceholder: 'Optional note for the agent…',
    pasteFromAi: 'Paste result from AI',
    importFromFile: 'Read from file',
    importFromFileHint: "Reads a .md file the agent already wrote into this idea's docs folder — no copy/paste needed.",
    foundFilesTitle: 'Found on disk',
    importFile: 'Import',
    agentOutputNotCreated: 'not created yet',
    pasteModalTitle: 'Paste the AI reply',
    pastePlaceholder: 'Paste the Markdown the agent wrote back…',
    pasteSubmit: 'Import',
    importIssuesTitle: "Couldn't use some of it",
    aiProposes: 'AI proposes',
    accept: 'Accept',
    reject: 'Reject',
    quickReplies: ['Yes', 'No', 'Not sure'],
    needsReviewBanner: (reason) => `Needs review: ${reason}`,
    understand: {
      originalIdea: 'Original idea',
      problem: 'Problem',
      context: 'Context',
      users: 'Users / use cases',
      usersHint: 'Who is affected, and in what situation?',
      assumptions: 'Assumptions',
      unknowns: 'Unknowns',
      continueTo: 'Continue to Research →',
    },
    research: {
      findings: 'Findings',
      noFindings: 'No findings yet.',
      findingTypeLabel: { fact: 'Fact', assumption: 'Assumption', inference: 'Inference' },
      findingType: 'Type',
      findingText: 'Finding',
      existingSolutions: 'Existing solutions',
      sourcesTitle: 'Sources',
      sourcePath: 'Path or URL',
      sourceQuestion: 'Question to answer',
      read: 'Read',
      unknowns: 'Unknowns',
      continueTo: 'Continue to Explore →',
    },
    explore: {
      options: 'Options',
      noOptions: 'No options yet — add at least two to compare.',
      optionTitle: 'Option title',
      description: 'Description',
      pros: 'Pros',
      cons: 'Cons',
      risks: 'Risks',
      tradeoffs: 'Trade-offs',
      validation: 'Validation',
      ideaValidations: 'Validation ideas',
      continueTo: 'Continue to Decide →',
    },
    decide: {
      status: 'Decision',
      statusLabel: { go: 'GO', 'no-go': 'NO-GO', later: 'LATER', 'more-research': 'NEED MORE RESEARCH', 'change-direction': 'CHANGE DIRECTION' },
      recommendation: 'Recommendation',
      finalIdea: 'Final idea',
      scope: 'Scope',
      outOfScope: 'Out of scope',
      validation: 'Validation',
      successCriteria: 'Success criteria',
      nextStep: 'Next step',
      markReady: 'Mark Ready →',
      markReadyHint: 'Pick a CoFoFo recipe and epic title to mark this idea Ready.',
      epicTitle: 'Epic title',
      recipe: 'Recipe',
    },
    ready: {
      hint: 'Ready for the next AIDLC step — this does not start implementation.',
      notReadyYet: 'Not ready yet — finish Decide first, then Mark Ready there.',
      scaffoldEpic: 'Scaffold epic',
      scaffoldedBody: 'This idea was scaffolded. Track delivery below.',
      openResearchFile: 'Open RESEARCH.md',
      viewResearch: 'View RESEARCH.md',
    },
    translateArtifacts: 'Translate to English',
  },
};

const vi: IdeasCopy = {
  tab: 'Ý tưởng',
  header: {
    eyebrow: 'Ý TƯỞNG',
    title: 'Ý tưởng của bạn',
    subtitle: 'Workspace nghiên cứu cho từng ý tưởng — Understand, Research, Explore, Decide, rồi Ready.',
    openGuide: 'Mở hướng dẫn pipeline Ideas',
  },
  newIdea: '+ Ý tưởng mới',
  filters: {
    all: 'Tất cả',
    writing: 'Đang viết',
    ready: 'Sẵn sàng',
    blocked: 'Bị chặn',
    done: 'Đã xong',
    shelved: 'Đã gác',
  },
  list: {
    emptyTitle: 'Chưa có ý tưởng nào',
    emptyBody: 'Mô tả điều bạn muốn khác đi — không cần biết cách sửa, cũng không cần biết nó khó hay dễ.',
    savedAutomatically: 'Được lưu tự động. Mở một ý tưởng đang dở để tiếp tục đúng chỗ bạn dừng.',
    resume: 'Tiếp tục',
    missingCount: (n) => `thiếu ${n}`,
    needsReview: 'cần xem lại',
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
    hint: 'Một câu là đủ. Tiếp theo bạn sẽ đi qua Understand, Research, Explore rồi Decide.',
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
    footerNote: 'ROUTE.md đã được duyệt ở Canvas. Xác nhận bây giờ sẽ scaffold (các) epic bên dưới.',
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
    reviewGateTitle: 'Đang chờ review ở Canvas',
    reviewGateBodyEpics: 'Review ROUTE.md ở Canvas trước khi tuyến này được xác nhận. Request changes để trả việc định tuyến lại cho agent làm lại.',
    reviewGateBodyClose: 'Review EVIDENCE.md ở Canvas — duyệt sẽ đóng idea này; request changes để trả việc định tuyến lại cho agent làm lại.',
    approvedNote: (reviewer) => `Đã duyệt bởi ${reviewer}.`,
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
  stages: {
    subtitle: 'App theo dõi ý tưởng đang ở stage nào và còn thiếu gì — AI có thể hỗ trợ điền, bạn quyết định giữ lại gì.',
    labels: { understand: 'Understand', research: 'Research', explore: 'Explore', decide: 'Decide', ready: 'Ready' },
    save: 'Lưu',
    saving: 'Đang lưu…',
    add: 'Thêm',
    remove: 'Xoá',
    edit: 'Sửa',
    continueWithAi: 'Tiếp tục với AI',
    runPipeline: 'Tiếp tục pipeline Idea với AI',
    runPipelineHint: 'Tiếp tục Idea từ stage thực tế hiện tại. Agent tự đọc stage đó từ RESEARCH.md và xử lý một stage trong mỗi lần chạy.',
    runStage: (stage) => `Chạy ${stage} với AI`,
    runStageHint: (stage) => `Chỉ chạy agent cho stage ${stage} đang được chọn và gửi kèm ghi chú ở trên. Action này không đổi stage hiện tại của Idea.`,
    copyCommand: 'Copy command',
    copyCommandHint: 'Dán vào Claude Code / Cursor / Codex / OpenCode đang mở sẵn trong workspace — tự chạy đúng agent, đúng skill, đúng rule, đúng validation, xong sẽ tự ghi kết quả ra file notes để bạn đọc lại.',
    copyFullPrompt: 'Copy full prompt',
    copyFullPromptHint: 'Dùng khi chat không đọc được file (ChatGPT web, Claude.ai web, ...) — copy nguyên prompt dạng text; dán kết quả trả về ở dưới.',
    notePlaceholder: 'Ghi chú thêm cho agent (tuỳ chọn)…',
    pasteFromAi: 'Dán kết quả từ AI',
    importFromFile: 'Đọc từ file',
    importFromFileHint: 'Đọc file .md agent đã ghi sẵn trong thư mục docs của idea này — không cần copy/paste.',
    foundFilesTitle: 'Đã tìm thấy trên đĩa',
    importFile: 'Nhập',
    agentOutputNotCreated: 'chưa tạo',
    pasteModalTitle: 'Dán câu trả lời của AI',
    pastePlaceholder: 'Dán Markdown agent đã viết ra…',
    pasteSubmit: 'Nhập vào',
    importIssuesTitle: 'Vài phần không dùng được',
    aiProposes: 'AI đề xuất',
    accept: 'Chấp nhận',
    reject: 'Từ chối',
    quickReplies: ['Có', 'Không', 'Chưa chắc'],
    needsReviewBanner: (reason) => `Cần xem lại: ${reason}`,
    understand: {
      originalIdea: 'Ý tưởng gốc',
      problem: 'Vấn đề',
      context: 'Bối cảnh',
      users: 'Người dùng / tình huống dùng',
      usersHint: 'Ai bị ảnh hưởng, trong tình huống nào?',
      assumptions: 'Giả định',
      unknowns: 'Điều chưa biết',
      continueTo: 'Sang Research →',
    },
    research: {
      findings: 'Findings',
      noFindings: 'Chưa có finding nào.',
      findingTypeLabel: { fact: 'Fact', assumption: 'Assumption', inference: 'Inference' },
      findingType: 'Loại',
      findingText: 'Nội dung',
      existingSolutions: 'Giải pháp đã có',
      sourcesTitle: 'Nguồn',
      sourcePath: 'Đường dẫn hoặc URL',
      sourceQuestion: 'Câu hỏi cần trả lời',
      read: 'Đã đọc',
      unknowns: 'Điều chưa biết',
      continueTo: 'Sang Explore →',
    },
    explore: {
      options: 'Phương án',
      noOptions: 'Chưa có phương án — thêm ít nhất 2 để so sánh.',
      optionTitle: 'Tên phương án',
      description: 'Mô tả',
      pros: 'Ưu điểm',
      cons: 'Nhược điểm',
      risks: 'Rủi ro',
      tradeoffs: 'Đánh đổi',
      validation: 'Cách kiểm chứng',
      ideaValidations: 'Ý tưởng kiểm chứng',
      continueTo: 'Sang Decide →',
    },
    decide: {
      status: 'Quyết định',
      statusLabel: { go: 'GO', 'no-go': 'NO-GO', later: 'LATER', 'more-research': 'CẦN NGHIÊN CỨU THÊM', 'change-direction': 'ĐỔI HƯỚNG' },
      recommendation: 'Khuyến nghị',
      finalIdea: 'Ý tưởng cuối cùng',
      scope: 'Phạm vi',
      outOfScope: 'Ngoài phạm vi',
      validation: 'Cách kiểm chứng',
      successCriteria: 'Tiêu chí thành công',
      nextStep: 'Bước tiếp theo',
      markReady: 'Đánh dấu Sẵn sàng →',
      markReadyHint: 'Chọn recipe CoFoFo và tên epic để đánh dấu ý tưởng này Sẵn sàng.',
      epicTitle: 'Tên epic',
      recipe: 'Recipe',
    },
    ready: {
      hint: 'Sẵn sàng cho bước AIDLC tiếp theo — chưa bắt đầu implement.',
      notReadyYet: 'Chưa sẵn sàng — hoàn tất Decide trước, rồi bấm Đánh dấu Sẵn sàng ở đó.',
      scaffoldEpic: 'Scaffold epic',
      scaffoldedBody: 'Idea đã được scaffold. Theo dõi delivery bên dưới.',
      openResearchFile: 'Mở RESEARCH.md',
      viewResearch: 'Xem RESEARCH.md',
    },
    translateArtifacts: 'Dịch sang tiếng Việt',
  },
};

const IDEAS_COPY: Record<IdeasLanguage, IdeasCopy> = { en, vi };

export function ideasCopy(language: IdeasLanguage): IdeasCopy {
  return IDEAS_COPY[language];
}
