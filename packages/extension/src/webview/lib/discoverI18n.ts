/* Copy for the Discover tab. One table per language, no interpolation helper
 * beyond a few functions — the tab has enough strings that a lookup object
 * reads better than inline ternaries at every call site.
 */

export type DiscoverLanguage = 'en' | 'vi';

export interface DiscoverCopy {
  tab: string;
  languageSettings: string;

  // empty state
  emptyTitle: string;
  emptyBody: string;
  emptyHint: string;
  openGuide: string;
  seedPlaceholder: string;
  start: string;

  // chrome
  modePipeline: string;
  modeDocs: string;
  openInEditor: string;
  reload: string;
  checks: string;
  step: string;

  // step rail + detail
  steps: string;
  selectedStep: string;
  missing: string;
  nextStep: string;
  nextStepBlocked: string;
  viewStructured: string;
  viewMarkdown: string;
  viewPreview: string;
  viewDiff: string;
  doneWhen: string;

  // section editing
  entries: string;
  emptySection: string;
  addEntry: string;
  editHint: string;
  pinnedHint: string;
  pin: string;
  unpin: string;
  flag: string;
  flagged: string;
  delete: string;
  confirmDelete: string;
  byAi: string;
  byYou: string;
  newEntryPlaceholder: string;
  titlePlaceholder: string;
  onePerLine: string;
  cancel: string;
  save: string;
  untitled: string;
  proseHint: string;
  yourSection: string;
  yourSectionHint: string;

  // agent panel
  agent: string;
  notePlaceholder: string;
  runStep: string;
  runPipeline: string;
  modeFillHint: string;
  modeRefineHint: string;
  history: string;
  noRuns: string;
  keep: string;
  revert: string;
  guardrail: string;
  devDocs: string;
  generateDevDocs: string;

  // diff
  diffTitle: string;
  added: string;
  updated: string;
  removed: string;
  undo: string;
  keepAll: string;
  undoAll: string;
  noDiff: string;
  snapshotNote: string;
  back: string;

  // docs mode
  fileInfo: string;
  belongsTo: string;
  lastEdited: string;
  neverWritten: string;
  trace: string;
  dangling: string;
  noTrace: string;
  unsaved: string;
  rawHint: string;

  // hand-off
  handoffTitle: string;
  handoffHint: string;
  handoffPlanIncomplete: string;
  handoffNoPhases: string;
  handoffIntentNote: string;
  createEpic: string;
  epicTitle: string;
  recipe: string;
  deliverables: string;

  // functions
  handoffBlocked: (ids: string) => string;
  recipeHint: (recipeId: string) => string;
  strayLines: (n: number) => string;
  groupPlaceholder: (prefix: string) => string;
  runBanner: (runId: string, mode: string) => string;
  runLabel: (runId: string, step: string) => string;
}

const RECIPE_HINT_VI: Record<string, string> = {
  'cofofo-feature': 'xây hành vi mới',
  'cofofo-bugfix': 'sửa hành vi sai',
  'cofofo-bootstrap': 'dựng nền tảng project',
  'cofofo-refresh-context': 'làm mới stack/system map',
  'cofofo-update-rules': 'cập nhật project rules',
  'cofofo-repin-bundle': 'cài lại pinned ECC catalog',
};

const RECIPE_HINT_EN: Record<string, string> = {
  'cofofo-feature': 'build new behaviour',
  'cofofo-bugfix': 'fix wrong behaviour',
  'cofofo-bootstrap': 'build the project foundation',
  'cofofo-refresh-context': 'refresh stack / system map',
  'cofofo-update-rules': 'update project rules',
  'cofofo-repin-bundle': 'reinstall the pinned ECC catalog',
};

const VI: DiscoverCopy = {
  tab: 'Discover',
  languageSettings: 'Ngôn ngữ hiển thị',

  emptyTitle: 'Bắt đầu một blueprint',
  emptyBody:
    'Một câu mô tả sản phẩm là đủ để bắt đầu. Discover đưa nó đi qua 12 bước — Idea → Product Definition → Requirements → Features → Use Cases → User Flow → Data Model → Architecture → Tech Decisions → Project Structure → Implementation Plan → Project Skeleton — và ghi kết quả thẳng vào các file Markdown trong docs/.',
  emptyHint: 'Các file .md trong docs/ là source of truth; agent điền và cập nhật từng mục trong đó.',
  openGuide: 'Mở hướng dẫn pipeline',
  seedPlaceholder: 'Mô tả sản phẩm bằng một câu…',
  start: 'Bắt đầu',

  modePipeline: 'Pipeline',
  modeDocs: 'Docs',
  openInEditor: 'Mở trong editor',
  reload: 'Đọc lại docs',
  checks: 'Kiểm tra',
  step: 'Bước',

  steps: '12 BƯỚC',
  selectedStep: 'BƯỚC ĐANG XEM',
  missing: 'Còn thiếu',
  nextStep: 'Sang bước tiếp →',
  nextStepBlocked: 'Hoàn tất các mục còn thiếu trước khi sang bước tiếp',
  viewStructured: 'Có cấu trúc',
  viewMarkdown: 'Markdown thô',
  viewPreview: 'Xem trước',
  viewDiff: 'Diff',
  doneWhen: 'Xong khi',

  entries: 'mục',
  emptySection: 'Chưa có gì ở đây.',
  addEntry: 'Thêm mục',
  editHint: 'Bấm để sửa',
  pinnedHint: 'Mục đã ghim — bỏ ghim trước khi sửa',
  pin: 'Ghim (agent không được sửa)',
  unpin: 'Bỏ ghim',
  flag: 'Gắn cờ cần xem lại',
  flagged: 'Cần xem lại',
  delete: 'Xoá',
  confirmDelete: 'Bấm lần nữa để xoá',
  byAi: 'ai',
  byYou: 'bạn',
  newEntryPlaceholder: 'Nội dung mục mới…',
  titlePlaceholder: 'Tiêu đề…',
  onePerLine: ' (mỗi dòng một ý)',
  cancel: 'Huỷ',
  save: 'Lưu',
  untitled: 'Chưa đặt tên',
  proseHint: 'Markdown được giữ nguyên. Esc để huỷ, click ra ngoài để lưu.',
  yourSection: 'của bạn',
  yourSectionHint: 'Section này không thuộc hợp đồng — agent không được đụng vào.',

  agent: 'AI',
  notePlaceholder: 'Ghi chú cho agent (tuỳ chọn)…',
  runStep: 'Chạy agent cho bước này',
  runPipeline: 'Chạy pipeline',
  modeFillHint: 'Chế độ điền mới — bước này chưa có nội dung nào.',
  modeRefineHint: 'Chế độ bổ sung/sửa — agent giữ nguyên ID cũ.',
  history: 'Lịch sử run',
  noRuns: 'Chưa chạy agent lần nào.',
  keep: 'Giữ',
  revert: 'Hoàn tác run',
  guardrail: 'Guardrail',
  devDocs: 'Tài liệu phát triển',
  generateDevDocs: 'Sinh tài liệu phát triển',

  diffTitle: 'Thay đổi theo mục',
  added: 'Thêm',
  updated: 'Sửa',
  removed: 'Xoá',
  undo: 'Hoàn tác',
  keepAll: 'Giữ tất cả',
  undoAll: 'Hoàn tác cả run',
  noDiff: 'Chưa có thay đổi nào trong run này.',
  snapshotNote: 'Snapshot còn giữ tới khi bạn bấm Giữ tất cả.',
  back: '← Quay lại',

  fileInfo: 'THÔNG TIN FILE',
  belongsTo: 'Thuộc bước',
  lastEdited: 'Sửa lần cuối',
  neverWritten: 'Chưa được tạo',
  trace: 'Truy vết',
  dangling: 'Không tồn tại',
  noTrace: 'Mục này chưa liên kết với mục nào khác.',
  unsaved: 'chưa lưu',
  rawHint: 'Sửa trực tiếp file. Lưu sẽ ghi đè toàn bộ nội dung file này.',

  handoffTitle: 'Bàn giao sang Epic',
  handoffHint: 'Mỗi phase của Implementation Plan thành một Epic riêng — không đưa cả project cho agent làm một lần.',
  handoffPlanIncomplete: 'Bước Implementation Plan chưa đủ điều kiện; vẫn bàn giao được nhưng brief sẽ thiếu.',
  handoffNoPhases: 'Chưa có phase nào trong plans/IMPLEMENTATION_PLAN.md.',
  handoffIntentNote: 'INTENT.md được chụp lại ngay lúc tạo Epic — sửa blueprint sau đó không đổi file này.',
  createEpic: 'Tạo Epic',
  epicTitle: 'Tên Epic',
  recipe: 'Recipe',
  deliverables: 'deliverable',

  handoffBlocked: (ids) => `Phase phụ thuộc chưa bàn giao: ${ids}`,
  recipeHint: (recipeId) => RECIPE_HINT_VI[recipeId] ?? '',
  strayLines: (n) => `${n} dòng không đúng định dạng, không được theo dõi`,
  groupPlaceholder: (prefix) => `${prefix}-<nhóm>`,
  runBanner: (runId, mode) => `Agent vừa chạy ${runId} (${mode === 'fill' ? 'điền mới' : 'bổ sung/sửa'})`,
  runLabel: (runId, step) => `${runId} · ${step}`,
};

const EN: DiscoverCopy = {
  tab: 'Discover',
  languageSettings: 'Display language',

  emptyTitle: 'Start a blueprint',
  emptyBody:
    'One sentence about the product is enough to start. Discover takes it through 12 steps — Idea → Product Definition → Requirements → Features → Use Cases → User Flow → Data Model → Architecture → Tech Decisions → Project Structure → Implementation Plan → Project Skeleton — writing the result straight into the Markdown files under docs/.',
  emptyHint: 'The .md files under docs/ are the source of truth; the agent fills and updates each section in them.',
  openGuide: 'Open the pipeline guide',
  seedPlaceholder: 'Describe the product in one sentence…',
  start: 'Start',

  modePipeline: 'Pipeline',
  modeDocs: 'Docs',
  openInEditor: 'Open in editor',
  reload: 'Re-read docs',
  checks: 'Checks',
  step: 'Step',

  steps: '12 STEPS',
  selectedStep: 'SELECTED STEP',
  missing: 'Missing',
  nextStep: 'Next step →',
  nextStepBlocked: 'Finish what is missing before moving on',
  viewStructured: 'Structured',
  viewMarkdown: 'Raw Markdown',
  viewPreview: 'Preview',
  viewDiff: 'Diff',
  doneWhen: 'Done when',

  entries: 'entries',
  emptySection: 'Nothing here yet.',
  addEntry: 'Add entry',
  editHint: 'Click to edit',
  pinnedHint: 'Pinned — unpin it before editing',
  pin: 'Pin (agents may not touch it)',
  unpin: 'Unpin',
  flag: 'Flag for review',
  flagged: 'Needs review',
  delete: 'Delete',
  confirmDelete: 'Click again to delete',
  byAi: 'ai',
  byYou: 'you',
  newEntryPlaceholder: 'New entry…',
  titlePlaceholder: 'Title…',
  onePerLine: ' (one per line)',
  cancel: 'Cancel',
  save: 'Save',
  untitled: 'Untitled',
  proseHint: 'Markdown is kept as written. Esc to cancel, click away to save.',
  yourSection: 'yours',
  yourSectionHint: 'Not part of the contract — agents may not touch this section.',

  agent: 'AI',
  notePlaceholder: 'Note for the agent (optional)…',
  runStep: 'Run the agent on this step',
  runPipeline: 'Run pipeline',
  modeFillHint: 'Fill mode — this step has no content yet.',
  modeRefineHint: 'Refine mode — existing ids are kept.',
  history: 'Run history',
  noRuns: 'No agent run yet.',
  keep: 'Keep',
  revert: 'Undo run',
  guardrail: 'Guardrail',
  devDocs: 'Development docs',
  generateDevDocs: 'Generate development docs',

  diffTitle: 'Changes by entry',
  added: 'Added',
  updated: 'Changed',
  removed: 'Removed',
  undo: 'Undo',
  keepAll: 'Keep all',
  undoAll: 'Undo whole run',
  noDiff: 'Nothing has changed in this run yet.',
  snapshotNote: 'The snapshot is kept until you press Keep all.',
  back: '← Back',

  fileInfo: 'FILE',
  belongsTo: 'Step',
  lastEdited: 'Last edited',
  neverWritten: 'Not created yet',
  trace: 'Traceability',
  dangling: 'Does not exist',
  noTrace: 'This entry is not linked to any other yet.',
  unsaved: 'unsaved',
  rawHint: 'Edit the file directly. Saving replaces the whole file.',

  handoffTitle: 'Hand off to an epic',
  handoffHint: 'Each Implementation Plan phase becomes its own epic — never hand the whole project to an agent at once.',
  handoffPlanIncomplete: 'The Implementation Plan step is not complete; you can still hand off, but the brief will be thin.',
  handoffNoPhases: 'No phases in plans/IMPLEMENTATION_PLAN.md yet.',
  handoffIntentNote: 'INTENT.md is snapshotted when the epic is created — editing the blueprint afterwards does not change it.',
  createEpic: 'Create epic',
  epicTitle: 'Epic title',
  recipe: 'Recipe',
  deliverables: 'deliverables',

  handoffBlocked: (ids) => `Phases it depends on are not handed off yet: ${ids}`,
  recipeHint: (recipeId) => RECIPE_HINT_EN[recipeId] ?? '',
  strayLines: (n) => `${n} line(s) not in the item format — untracked`,
  groupPlaceholder: (prefix) => `${prefix}-<group>`,
  runBanner: (runId, mode) => `Agent run ${runId} (${mode})`,
  runLabel: (runId, step) => `${runId} · ${step}`,
};

export function discoverCopy(language: DiscoverLanguage): DiscoverCopy {
  return language === 'vi' ? VI : EN;
}
