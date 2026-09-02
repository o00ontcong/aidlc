/* Copy for the Discover tab. One table per language, no interpolation helper
 * beyond a few functions — the tab has enough strings that a lookup object
 * reads better than inline ternaries at every call site.
 */

export type DiscoverLanguage = 'en' | 'vi';

/** Hover help for every interactive control in the Discover (formerly Ideas) tab. */
export interface DiscoverHints {
  seedInput: string;
  startBlueprint: string;
  scanExisting: string;
  scanProject: string;
  openGuide: string;
  showPipeline: string;
  showDocs: string;
  showChecks: string;
  reloadDocs: string;
  openCurrentDoc: string;
  runPipeline: string;
  showDiff: string;
  keepRun: string;
  revertRun: string;
  showStructured: string;
  showRaw: string;
  showPreview: string;
  runStep: string;
  advanceStep: string;
  selectStep: (step: string) => string;
  openDoc: (path: string) => string;
  addEntry: string;
  itemInput: string;
  groupInput: string;
  confirmAdd: string;
  cancelAdd: string;
  recordTitleInput: string;
  recordField: (label: string) => string;
  saveEntry: string;
  cancelEdit: string;
  rawEditor: string;
  discardRaw: string;
  saveRaw: string;
  openRunDiff: string;
  undoRun: string;
  generateDevDocs: string;
  selectDoc: (path: string) => string;
  openFile: (path: string) => string;
  back: string;
  undoEntry: string;
  keepEntry: string;
  undoAll: string;
  keepAll: string;
  openEpic: string;
  configureEpic: string;
  epicTitleInput: string;
  recipeSelect: string;
  createEpic: string;
}

export interface DiscoverCopy {
  tab: string;
  languageSettings: string;
  hints: DiscoverHints;

  // empty state
  emptyTitle: string;
  emptyBody: string;
  emptyHint: string;
  openGuide: string;
  seedPlaceholder: string;
  seedShortcutHint: string;
  start: string;
  orDivider: string;
  scanExisting: string;
  scanExistingHint: string;
  scanProject: string;
  scanBadge: string;

  // chrome
  modePipeline: string;
  modeDocs: string;
  openInEditor: string;
  reload: string;
  checks: string;

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
  runStep: string;
  runPipeline: string;
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
  editBanner: (runId: string, mode: string) => string;
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

const HINTS_VI: DiscoverHints = {
  seedInput: 'Nhập mô tả sản phẩm (một câu hoặc nhiều đoạn) để khởi tạo blueprint 12 bước.',
  startBlueprint: 'Tạo blueprint và các tài liệu Markdown ban đầu từ mô tả sản phẩm.',
  scanExisting: 'Bỏ qua ý tưởng — đọc mã nguồn đã có trong workspace và tự điền 12 mục từ đó.',
  scanProject: 'Đọc lại mã nguồn hiện tại và đối chiếu với 12 mục; phần lệch sẽ hiện ở diff để bạn xem trước khi giữ lại.',
  openGuide: 'Mở hướng dẫn giải thích 12 bước, định dạng tài liệu và cách chạy agent.',
  showPipeline: 'Xem và chỉnh sửa blueprint theo thứ tự 12 bước phát triển.',
  showDocs: 'Xem toàn bộ tài liệu blueprint theo cây thư mục và file.',
  showChecks: 'Mở danh sách lỗi, cảnh báo và liên kết còn thiếu trong blueprint.',
  reloadDocs: 'Đọc lại các file Markdown từ ổ đĩa và cập nhật nội dung trong tab.',
  openCurrentDoc: 'Mở file chính của bước đang xem trong VS Code editor.',
  runPipeline: 'Chạy agent cho bước hiện tại của pipeline; mỗi lần chỉ xử lý một bước.',
  showDiff: 'Xem các mục agent vừa thêm, sửa hoặc xoá trong run này.',
  keepRun: 'Chấp nhận toàn bộ thay đổi của run và bỏ snapshot hoàn tác.',
  revertRun: 'Khôi phục toàn bộ tài liệu về trạng thái trước run này.',
  showStructured: 'Hiển thị tài liệu thành các section và mục có thể chỉnh sửa riêng.',
  showRaw: 'Chỉnh sửa trực tiếp toàn bộ nội dung Markdown của file.',
  showPreview: 'Xem bản render của Markdown mà không chỉnh sửa nội dung.',
  runStep: 'Chạy agent để điền hoặc cải thiện tài liệu của riêng bước đang xem.',
  advanceStep: 'Chốt bước hiện tại và chuyển pipeline sang bước kế tiếp.',
  selectStep: (step) => `Mở bước ${step} để xem hoặc chỉnh sửa; thao tác này không đổi tiến độ pipeline.`,
  openDoc: (path) => `Mở ${path} trong VS Code editor.`,
  addEntry: 'Thêm một mục mới vào section này và tự cấp ID tiếp theo.',
  itemInput: 'Nhập nội dung mục; Enter để lưu, Esc để huỷ.',
  groupInput: 'Nhập mã nhóm dùng để tạo ID cho mục mới.',
  confirmAdd: 'Lưu mục mới vào tài liệu.',
  cancelAdd: 'Huỷ việc thêm mục mới.',
  recordTitleInput: 'Nhập tiêu đề cho mục có cấu trúc này.',
  recordField: (label) => `Nhập giá trị cho trường ${label}.`,
  saveEntry: 'Lưu mục và các trường vừa chỉnh sửa.',
  cancelEdit: 'Huỷ chỉnh sửa và giữ nguyên nội dung hiện tại.',
  rawEditor: 'Chỉnh sửa trực tiếp Markdown; khi lưu, toàn bộ file sẽ được thay bằng nội dung này.',
  discardRaw: 'Bỏ các thay đổi Markdown chưa lưu và nạp lại nội dung hiện tại.',
  saveRaw: 'Ghi toàn bộ nội dung Markdown đang sửa xuống file.',
  openRunDiff: 'Mở diff chi tiết của run để kiểm tra từng thay đổi.',
  undoRun: 'Hoàn tác toàn bộ thay đổi của run này nếu snapshot vẫn còn.',
  generateDevDocs: 'Sinh CODING_RULES.md, TESTING_RULES.md và GIT_WORKFLOW.md từ tech stack đã chốt.',
  selectDoc: (path) => `Chọn ${path} để xem nội dung, trạng thái và liên kết truy vết.`,
  openFile: (path) => `Mở ${path} trong VS Code editor.`,
  back: 'Quay lại màn hình pipeline.',
  undoEntry: 'Chỉ hoàn tác thay đổi của mục này, giữ nguyên các thay đổi khác trong run.',
  keepEntry: 'Chỉ xác nhận thay đổi của mục này; các mục khác trong run vẫn chờ quyết định.',
  undoAll: 'Hoàn tác tất cả thay đổi của run và khôi phục snapshot trước đó.',
  keepAll: 'Chấp nhận tất cả thay đổi và xoá snapshot hoàn tác của run.',
  openEpic: 'Mở danh sách Epic và đi tới Epic đã được tạo từ phase này.',
  configureEpic: 'Mở form chọn tên và recipe để bàn giao phase thành một Epic.',
  epicTitleInput: 'Tên Epic sẽ được tạo từ phase của Implementation Plan.',
  recipeSelect: 'Chọn recipe CoFoFo quyết định pipeline thực thi của Epic.',
  createEpic: 'Tạo Epic và chụp INTENT.md từ trạng thái blueprint hiện tại.',
};

const HINTS_EN: DiscoverHints = {
  seedInput: 'Enter a product description (one sentence or several paragraphs) to initialise the 12-step blueprint.',
  startBlueprint: 'Create the blueprint and its initial Markdown documents from the product description.',
  scanExisting: 'Skip the idea — read the source code already in this workspace and fill the 12 sections from that.',
  scanProject: 'Re-read the current source code and reconcile it against the 12 sections; anything that drifted shows up in the diff for you to review before keeping it.',
  openGuide: 'Open the guide to the 12 steps, document format, and agent workflow.',
  showPipeline: 'View and edit the blueprint in its 12-step development order.',
  showDocs: 'Browse all blueprint documents by folder and file.',
  showChecks: 'Open blueprint errors, warnings, and missing traceability links.',
  reloadDocs: 'Re-read the Markdown files from disk and refresh this tab.',
  openCurrentDoc: 'Open the selected step\'s primary file in the VS Code editor.',
  runPipeline: 'Run the agent for the pipeline\'s current step; one step is processed per run.',
  showDiff: 'Review the entries the agent added, changed, or removed in this run.',
  keepRun: 'Accept every change in this run and discard its undo snapshot.',
  revertRun: 'Restore all documents to their state before this run.',
  showStructured: 'Show the document as separately editable sections and entries.',
  showRaw: 'Edit the file\'s complete Markdown content directly.',
  showPreview: 'Render the Markdown for reading without editing it.',
  runStep: 'Run the agent to fill or refine only the selected step\'s documents.',
  advanceStep: 'Complete the current step and move the pipeline to the next one.',
  selectStep: (step) => `Open ${step} for viewing or editing without changing pipeline progress.`,
  openDoc: (path) => `Open ${path} in the VS Code editor.`,
  addEntry: 'Add an entry to this section and allocate its next ID.',
  itemInput: 'Enter the entry text; press Enter to save or Escape to cancel.',
  groupInput: 'Enter the group code used to generate the new entry ID.',
  confirmAdd: 'Save the new entry to the document.',
  cancelAdd: 'Cancel adding the new entry.',
  recordTitleInput: 'Enter the title of this structured entry.',
  recordField: (label) => `Enter the value for ${label}.`,
  saveEntry: 'Save the entry and its edited fields.',
  cancelEdit: 'Cancel editing and keep the current content.',
  rawEditor: 'Edit Markdown directly; saving replaces the complete file with this content.',
  discardRaw: 'Discard unsaved Markdown changes and restore the current file content.',
  saveRaw: 'Write the complete edited Markdown content to the file.',
  openRunDiff: 'Open the run diff to inspect every change.',
  undoRun: 'Undo every change in this run while its snapshot is available.',
  generateDevDocs: 'Generate CODING_RULES.md, TESTING_RULES.md, and GIT_WORKFLOW.md from the chosen stack.',
  selectDoc: (path) => `Select ${path} to inspect its content, status, and traceability.`,
  openFile: (path) => `Open ${path} in the VS Code editor.`,
  back: 'Return to the pipeline view.',
  undoEntry: 'Undo only this entry\'s change and keep the other changes in the run.',
  keepEntry: 'Confirm only this entry\'s change; the rest of the run still awaits a decision.',
  undoAll: 'Undo every change in this run and restore the preceding snapshot.',
  keepAll: 'Accept every change and discard the run\'s undo snapshot.',
  openEpic: 'Open the Epics list and navigate to the Epic created from this phase.',
  configureEpic: 'Choose a title and recipe before handing this phase off as an Epic.',
  epicTitleInput: 'The title of the Epic created from this Implementation Plan phase.',
  recipeSelect: 'Choose the CoFoFo recipe that determines the Epic\'s execution pipeline.',
  createEpic: 'Create the Epic and snapshot INTENT.md from the current blueprint.',
};

const VI: DiscoverCopy = {
  tab: 'Discover',
  languageSettings: 'Ngôn ngữ hiển thị',
  hints: HINTS_VI,

  emptyTitle: 'Bắt đầu một blueprint',
  emptyBody:
    'Một câu mô tả sản phẩm là đủ để bắt đầu, hoặc viết dài hơn — mục tiêu, người dùng, ràng buộc đã biết — để agent có thêm ngữ cảnh. Discover đưa nó đi qua 12 bước — Idea → Product Definition → Requirements → Features → Use Cases → User Flow → Data Model → Architecture → Tech Decisions → Project Structure → Implementation Plan → Project Skeleton — và ghi kết quả thẳng vào các file Markdown trong docs/.',
  emptyHint: 'Các file .md trong docs/ là source of truth; agent điền và cập nhật từng mục trong đó.',
  openGuide: 'Mở hướng dẫn pipeline',
  seedPlaceholder: 'Mô tả sản phẩm — một câu là đủ, hoặc viết dài hơn để thêm ngữ cảnh…',
  seedShortcutHint: '⌘/Ctrl + Enter để bắt đầu',
  start: 'Bắt đầu',
  orDivider: 'hoặc',
  scanExisting: 'Quét mã nguồn có sẵn',
  scanExistingHint: 'Đã có sourcecode trong workspace này? Quét thay vì gõ ý tưởng — agent đọc code và tự điền 12 mục.',
  scanProject: 'Quét dự án',
  scanBadge: 'quét',

  modePipeline: 'Pipeline',
  modeDocs: 'Docs',
  openInEditor: 'Mở trong editor',
  reload: 'Đọc lại docs',
  checks: 'Kiểm tra',

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
  runStep: 'Chạy agent cho bước này',
  runPipeline: 'Chạy pipeline',
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
  editBanner: (runId) => `Bạn vừa sửa ${runId}`,
  runLabel: (runId, step) => `${runId} · ${step}`,
};

const EN: DiscoverCopy = {
  tab: 'Discover',
  languageSettings: 'Display language',
  hints: HINTS_EN,

  emptyTitle: 'Start a blueprint',
  emptyBody:
    'One sentence about the product is enough to start, or write more — goals, users, known constraints — to give the agent more context. Discover takes it through 12 steps — Idea → Product Definition → Requirements → Features → Use Cases → User Flow → Data Model → Architecture → Tech Decisions → Project Structure → Implementation Plan → Project Skeleton — writing the result straight into the Markdown files under docs/.',
  emptyHint: 'The .md files under docs/ are the source of truth; the agent fills and updates each section in them.',
  openGuide: 'Open the pipeline guide',
  seedPlaceholder: 'Describe the product — one sentence is enough, or write more for extra context…',
  seedShortcutHint: '⌘/Ctrl + Enter to start',
  start: 'Start',
  orDivider: 'or',
  scanExisting: 'Scan existing source code',
  scanExistingHint: 'Already have source code in this workspace? Scan it instead of typing an idea — the agent reads the code and fills the 12 sections itself.',
  scanProject: 'Scan project',
  scanBadge: 'scan',

  modePipeline: 'Pipeline',
  modeDocs: 'Docs',
  openInEditor: 'Open in editor',
  reload: 'Re-read docs',
  checks: 'Checks',

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
  runStep: 'Run the agent on this step',
  runPipeline: 'Run pipeline',
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
  editBanner: (runId) => `You just edited ${runId}`,
  runLabel: (runId, step) => `${runId} · ${step}`,
};

export function discoverCopy(language: DiscoverLanguage): DiscoverCopy {
  return language === 'vi' ? VI : EN;
}
