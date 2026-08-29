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
  prepPending: { title: string; body: string };
  actions: { shelve: string; reopen: string };
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
  prepPending: {
    title: 'Question preparation is not wired up yet',
    body: 'Your sentence is saved and safe. The self-answering + question batch is landing in a follow-up pass.',
  },
  actions: { shelve: 'Set aside', reopen: 'Reopen' },
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
  prepPending: {
    title: 'Bước chuẩn bị câu hỏi chưa được nối dây',
    body: 'Câu ý tưởng của bạn đã được lưu an toàn. Phần agent tự trả lời + lô câu hỏi sẽ có trong một đợt cập nhật kế tiếp.',
  },
  actions: { shelve: 'Gác lại', reopen: 'Mở lại' },
  languageSettings: 'Ngôn ngữ hiển thị',
};

const IDEAS_COPY: Record<IdeasLanguage, IdeasCopy> = { en, vi };

export function ideasCopy(language: IdeasLanguage): IdeasCopy {
  return IDEAS_COPY[language];
}
