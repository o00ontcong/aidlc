/* Copy for the Discover tab. One table per language, no interpolation helper
 * beyond a few functions — the tab has enough strings that a lookup object
 * reads better than inline ternaries at every call site.
 */

import type { DiscoverScopeSummary } from './types';

export type DiscoverLanguage = 'en' | 'vi';

/** Hover help for every interactive control in the Discover (formerly Ideas) tab. */
export interface DiscoverHints {
  seedInput: string;
  startBlueprint: string;
  scanExisting: string;
  scanProject: string;
  repoLayout: string;
  commitAll: string;
  openGuide: string;
  showPipeline: string;
  showDocs: string;
  showChecks: string;
  showAgentPanel: string;
  hideAgentPanel: string;
  reloadDocs: string;
  openCurrentDoc: string;
  runPipeline: string;
  showDiff: string;
  keepRun: string;
  revertRun: string;
  showRaw: string;
  showPreview: string;
  runStep: string;
  chatStep: string;
  selectStep: (step: string) => string;
  resizeRail: string;
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
  revealSource: string;
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
  createEpicAnyway: string;
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
  /** `quét 1/3 · Sản phẩm` — pass 1..3; omit pass for a generic badge. */
  scanPassBadge: (pass?: number) => string;
  /** Header button label: the declared layout, or an invitation to declare one. */
  repoLayout: (scope?: DiscoverScopeSummary) => string;

  /** Repo layout modal (in-webview — QuickPick is unreliable from a webview). */
  scopeModal: {
    confirmTitle: string;
    useSaved: (summary: string) => string;
    editSaved: string;
    layoutTitle: string;
    single: string;
    singleDetail: string;
    parent: string;
    parentDetail: string;
    child: string;
    childDetail: string;
    suggested: string;
    pickChildren: string;
    pickChildrenEmpty: string;
    browse: string;
    selected: (n: number) => string;
    parentPrompt: string;
    parentManual: string;
    detected: string;
    kindTitle: string;
    kindPrompt: (name: string) => string;
    kindHint: string;
    next: string;
    ok: string;
  };

  commitModal: {
    title: string;
    subtitle: (repo: string) => string;
    messageLabel: string;
    messagePlaceholder: string;
    changeHint: (count: number) => string;
    generateWithAi: string;
    confirm: string;
  };

  // chrome
  modePipeline: string;
  modeDocs: string;
  openInEditor: string;
  reload: string;
  commitAll: string;
  checks: string;
  checksHint: string;
  checksEmpty: string;
  startEpicFromCheck: string;
  suggestionKind: (kind: string) => string;

  // step rail + detail
  steps: string;
  stepTitle: (step: { label: string; labelVi?: string }) => string;
  selectedStep: string;
  viewMarkdown: string;
  viewPreview: string;
  viewDiff: string;

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
  chatStep: string;
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

  status: {
    inCode: string;
    missing: string;
    stale: string;
    mix: string;
    nfr: string;
    tree: string;
    diagram: string;
    counts: (inCode: number, missing: number, stale: number) => string;
    matcherNote: string;
    empty: string;
    covers: (ids: string) => string;
    searchPlaceholder: string;
    filterAll: string;
    screens: string;
    screenFlow: string;
    fullscreen: string;
    exitFullscreen: string;
  };

  // hand-off
  handoffTitle: string;
  handoffHint: string;
  handoffPlanIncomplete: string;
  handoffNoPhases: string;
  handoffIntentNote: string;
  handoffAlreadyBuilt: string;
  handoffCreateAnyway: string;
  handoffAllBuilt: string;
  handoffBuiltSummary: (n: number) => string;
  handoffGoal: string;
  handoffWhy: string;
  handoffInScope: string;
  handoffDod: string;
  handoffNoMatch: (tokens: string, scanned: number) => string;
  handoffPartialMatch: (files: string) => string;
  createEpic: string;
  epicTitle: string;
  recipe: string;
  deliverables: string;

  // functions
  handoffBlocked: (ids: string) => string;
  handoffCounts: (handed: number, built: number, pending: number) => string;
  recipeHint: (recipeId: string) => string;
  strayLines: (n: number) => string;
  groupPlaceholder: (prefix: string) => string;
  runBanner: (runId: string, mode: string) => string;
  editBanner: (runId: string, mode: string) => string;
  runLabel: (runId: string, step: string) => string;
}

const SUGGESTION_KIND_VI: Record<string, string> = {
  'no-skeleton': 'Dựng skeleton',
  'not-implemented': 'Chưa implement',
  'docs-stale': 'Docs lệch code',
  'undocumented': 'Code chưa có docs',
  'doc-gap': 'Thiếu truy vết docs',
};

const SUGGESTION_KIND_EN: Record<string, string> = {
  'no-skeleton': 'Build skeleton',
  'not-implemented': 'Not implemented',
  'docs-stale': 'Docs drift',
  'undocumented': 'Undocumented code',
  'doc-gap': 'Doc traceability gap',
};

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
  scanExisting: 'Bỏ qua ý tưởng — đọc mã nguồn đã có và điền blueprint qua 3 lượt (sản phẩm → kiến trúc → kế hoạch).',
  scanProject: 'Đối chiếu docs với code qua 3 lượt; mỗi lượt hiện diff để bạn giữ lại trước khi sang lượt sau.',
  repoLayout: 'Khai báo repo nào chứa code của blueprint này — một repo, repo cha nhiều con, hay một repo con. Scan chỉ đọc trong vùng đã khai báo.',
  commitAll: 'Stage và commit mọi thay đổi trong repo cha (hoặc repo duy nhất nếu chỉ có một).',
  openGuide: 'Mở hướng dẫn giải thích 12 bước, định dạng tài liệu và cách chạy agent.',
  showPipeline: 'Xem và chỉnh sửa blueprint theo thứ tự 12 bước phát triển.',
  showDocs: 'Xem toàn bộ tài liệu blueprint theo cây thư mục và file.',
  showChecks: 'Quét docs ↔ code và xem đề xuất Epic sẵn sàng chạy.',
  showAgentPanel: 'Mở panel AI — lịch sử run, kiểm tra và sinh tài liệu phát triển.',
  hideAgentPanel: 'Ẩn panel AI để dành chỗ cho nội dung bước đang xem.',
  reloadDocs: 'Đọc lại các file Markdown từ ổ đĩa và cập nhật nội dung trong tab.',
  openCurrentDoc: 'Mở file chính của bước đang xem trong VS Code editor.',
  runPipeline: 'Chạy agent cho bước hiện tại của pipeline; mỗi lần chỉ xử lý một bước.',
  showDiff: 'Xem các mục agent vừa thêm, sửa hoặc xoá trong run này.',
  keepRun: 'Chấp nhận thay đổi của lượt này và bỏ snapshot hoàn tác. Nếu đây là lượt quét, lượt sau sẽ chạy tiếp.',
  revertRun: 'Khôi phục toàn bộ tài liệu về trạng thái trước run này.',
  showRaw: 'Chỉnh sửa trực tiếp toàn bộ nội dung Markdown của file.',
  showPreview: 'Xem bản render của Markdown mà không chỉnh sửa nội dung.',
  runStep: 'Chạy agent để điền hoặc cải thiện tài liệu của riêng bước đang xem.',
  chatStep: 'Mở provider với bối cảnh bước này để trao đổi với agent — agent không tự viết lại tài liệu trừ khi bạn yêu cầu.',
  selectStep: (step) => `Mở bước ${step} để xem hoặc chỉnh sửa. Chọn bước trên rail là cách chuyển bước.`,
  resizeRail: 'Kéo để đổi độ rộng danh sách 12 bước.',
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
  revealSource: 'Mở file/folder khớp trong Explorer — cùng cách nút mở artifact.',
  back: 'Quay lại màn hình pipeline.',
  undoEntry: 'Chỉ hoàn tác thay đổi của mục này, giữ nguyên các thay đổi khác trong run.',
  keepEntry: 'Chỉ xác nhận thay đổi của mục này; các mục khác trong run vẫn chờ quyết định.',
  undoAll: 'Hoàn tác tất cả thay đổi của run và khôi phục snapshot trước đó.',
  keepAll: 'Chấp nhận tất cả thay đổi và xoá snapshot hoàn tác của run.',
  openEpic: 'Mở danh sách Epic và đi tới Epic đã được tạo từ phase này.',
  configureEpic: 'Mở form chọn tên và recipe để bàn giao phase thành một Epic.',
  epicTitleInput: 'Tên Epic sẽ được tạo từ phase của Implementation Plan.',
  recipeSelect: 'Chọn recipe: cofofo-feature (hành vi mới) hoặc cofofo-bugfix (sửa hành vi sai).',
  createEpic: 'Tạo Epic và chụp INTENT.md từ trạng thái blueprint hiện tại.',
  createEpicAnyway: 'Vẫn tạo Epic dù feature này đã có trong code — dùng khi muốn refactor, bugfix, hoặc bổ sung.',
};

const HINTS_EN: DiscoverHints = {
  seedInput: 'Enter a product description (one sentence or several paragraphs) to initialise the 12-step blueprint.',
  startBlueprint: 'Create the blueprint and its initial Markdown documents from the product description.',
  scanExisting: 'Skip the idea — read the source already in this workspace and fill the blueprint in 3 passes (product → architecture → plan).',
  scanProject: 'Reconcile docs against code in 3 passes; each pass shows a diff to keep before the next one starts.',
  repoLayout: 'Declare which repos hold this blueprint\'s code — one repo, a parent over several children, or one child. A scan reads only inside what you declare.',
  commitAll: 'Stage and commit every change in the parent repo (or the sole repo when there is only one).',
  openGuide: 'Open the guide to the 12 steps, document format, and agent workflow.',
  showPipeline: 'View and edit the blueprint in its 12-step development order.',
  showDocs: 'Browse all blueprint documents by folder and file.',
  showChecks: 'Scan docs ↔ code and review ready-to-start epic proposals.',
  showAgentPanel: 'Open the AI panel — run history, checks, and development-doc generation.',
  hideAgentPanel: 'Hide the AI panel to give the selected step more room.',
  reloadDocs: 'Re-read the Markdown files from disk and refresh this tab.',
  openCurrentDoc: 'Open the selected step\'s primary file in the VS Code editor.',
  runPipeline: 'Run the agent for the pipeline\'s current step; one step is processed per run.',
  showDiff: 'Review the entries the agent added, changed, or removed in this run.',
  keepRun: 'Accept this pass\'s changes and discard its undo snapshot. If this is a scan, the next pass starts afterwards.',
  revertRun: 'Restore all documents to their state before this run.',
  showRaw: 'Edit the file\'s complete Markdown content directly.',
  showPreview: 'Render the Markdown for reading without editing it.',
  runStep: 'Run the agent to fill or refine only the selected step\'s documents.',
  chatStep: 'Open the provider with this step as context so you can talk with the agent — it will not rewrite documents unless you ask.',
  selectStep: (step) => `Open ${step} to view or edit it. Selecting a step on the rail is how you move between steps.`,
  resizeRail: 'Drag to resize the 12-step list.',
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
  revealSource: 'Reveal the matched file or folder in Explorer — same as Open artifact.',
  back: 'Return to the pipeline view.',
  undoEntry: 'Undo only this entry\'s change and keep the other changes in the run.',
  keepEntry: 'Confirm only this entry\'s change; the rest of the run still awaits a decision.',
  undoAll: 'Undo every change in this run and restore the preceding snapshot.',
  keepAll: 'Accept every change and discard the run\'s undo snapshot.',
  openEpic: 'Open the Epics list and navigate to the Epic created from this phase.',
  configureEpic: 'Choose a title and recipe before handing this phase off as an Epic.',
  epicTitleInput: 'The title of the Epic created from this Implementation Plan phase.',
  recipeSelect: 'Choose cofofo-feature (new behaviour) or cofofo-bugfix (wrong behaviour).',
  createEpic: 'Create the Epic and snapshot INTENT.md from the current blueprint.',
  createEpicAnyway: 'Create an Epic anyway — for a refactor, bugfix, or follow-up, not to re-implement the feature.',
};

const VI: DiscoverCopy = {
  tab: 'Discover',
  languageSettings: 'Ngôn ngữ hiển thị',
  hints: HINTS_VI,

  emptyTitle: 'Bắt đầu một blueprint',
  emptyBody:
    'Một câu mô tả sản phẩm là đủ để bắt đầu, hoặc viết dài hơn — mục tiêu, người dùng, ràng buộc đã biết — để agent có thêm ngữ cảnh. Discover đưa nó đi qua 12 bước — Idea → Product Definition → Requirements → Feature Breakdown → Use Cases → User Flow / Screen Flow → Architecture → Data / API / Storage → Technical Decisions → Project Structure → Implementation Plan → Generate Skeleton — và ghi kết quả thẳng vào các file Markdown trong docs/.',
  emptyHint: 'Các file .md trong docs/ là source of truth; agent điền và cập nhật từng mục trong đó.',
  openGuide: 'Mở hướng dẫn pipeline',
  seedPlaceholder: 'Mô tả sản phẩm — một câu là đủ, hoặc viết dài hơn để thêm ngữ cảnh…',
  seedShortcutHint: '⌘/Ctrl + Enter để bắt đầu',
  start: 'Bắt đầu',
  orDivider: 'hoặc',
  scanExisting: 'Quét mã nguồn có sẵn',
  scanExistingHint: 'Đã có sourcecode trong workspace này? Quét thay vì gõ ý tưởng — agent đọc code qua 3 lượt (sản phẩm, kiến trúc, kế hoạch).',
  scanProject: 'Quét dự án',
  scanBadge: 'quét',
  scanPassBadge: (pass) => {
    const name = pass === 1 ? 'Sản phẩm' : pass === 2 ? 'Kiến trúc' : pass === 3 ? 'Kế hoạch' : '';
    return pass && name ? `quét ${pass}/3 · ${name}` : 'quét';
  },
  commitAll: 'Commit tất cả',
  repoLayout: (scope) => {
    if (!scope) { return 'Cấu trúc repo?'; }
    if (scope.layout === 'parent') { return `Cha + ${scope.repos.length} con`; }
    if (scope.layout === 'child') { return 'Repo con'; }
    return 'Một repo';
  },

  scopeModal: {
    confirmTitle: 'Cấu hình repo đã lưu',
    useSaved: (summary) => `Dùng cấu hình đã lưu — ${summary}`,
    editSaved: 'Chỉnh sửa cấu hình…',
    layoutTitle: 'Repo này có cấu trúc thế nào?',
    single: 'Một repo duy nhất',
    singleDetail: 'Code của sản phẩm nằm ngay trong repo này',
    parent: 'Repo cha quản lý nhiều repo con',
    parentDetail: 'Repo này giữ tài liệu, code nằm trong các repo con',
    child: 'Repo con của một repo cha',
    childDetail: 'Repo này là một phần hiện thực; tài liệu sản phẩm ở repo cha',
    suggested: 'đề xuất',
    pickChildren: 'Chọn các repo con chứa code (bỏ chọn thứ không phải sản phẩm)',
    pickChildrenEmpty: 'Chưa thấy repo con — chọn folder thủ công.',
    browse: 'Chọn folder khác…',
    selected: (n) => `${n} đã chọn`,
    parentPrompt: 'Repo cha nằm ở đâu?',
    parentManual: 'Hoặc nhập đường dẫn tương đối tới repo cha:',
    detected: 'phát hiện tự động',
    kindTitle: 'Loại repo',
    kindPrompt: (name) => `"${name}" là loại repo gì?`,
    kindHint: 'backend / frontend / mobile / infra / …',
    next: 'Tiếp',
    ok: 'OK',
  },

  commitModal: {
    title: 'Commit thay đổi blueprint',
    subtitle: (repo) => `Repo: ${repo}`,
    messageLabel: 'Message commit',
    messagePlaceholder: 'AIDLC Discover: …',
    changeHint: (count) => `${count} file đang thay đổi trong repo này.`,
    generateWithAi: 'Agent commit tất cả',
    confirm: 'Commit',
  },

  modePipeline: 'Pipeline',
  modeDocs: 'Docs',
  openInEditor: 'Mở trong editor',
  reload: 'Đọc lại docs',
  checks: 'Kiểm tra',
  checksHint: 'So khớp blueprint (docs/) với code thật và đề xuất Epic điền sẵn — bấm Tạo Epic để chạy ngay, không cần nhập thêm.',
  checksEmpty: 'Docs và code khớp — không có Epic nào cần tạo.',
  startEpicFromCheck: 'Tạo Epic',
  suggestionKind: (kind) => SUGGESTION_KIND_VI[kind] ?? kind,

  steps: '12 BƯỚC',
  stepTitle: (step) => (step.labelVi && step.labelVi !== step.label ? `${step.label} — ${step.labelVi}` : step.label),
  selectedStep: 'BƯỚC ĐANG XEM',
  viewMarkdown: 'Markdown thô',
  viewPreview: 'Xem trước',
  viewDiff: 'Diff',

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
  chatStep: 'Trao đổi với agent',
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

  status: {
    inCode: 'Đã có trong code',
    missing: 'Chưa làm',
    stale: 'Docs lệch code',
    mix: 'Hỗn hợp',
    nfr: 'Non-functional',
    tree: 'Cây',
    diagram: 'Cùng cây, dạng sơ đồ',
    counts: (inCode, missing, stale) =>
      `${inCode} đã có · ${missing} chưa làm · ${stale} lệch`,
    matcherNote: 'Khớp theo tên file/folder. Project mới = mọi mục ở “chưa làm”. Nếu feature đã có mà hiện chưa làm, đó là lệch matcher.',
    empty: 'Chưa có mục để đối chiếu.',
    covers: (ids) => ids,
    searchPlaceholder: 'Tìm id hoặc mô tả…',
    filterAll: 'Tất cả',
    screens: 'Màn hình',
    screenFlow: 'Luồng màn hình',
    fullscreen: 'Toàn màn hình',
    exitFullscreen: 'Thoát toàn màn hình (Esc)',
  },

  handoffTitle: 'Bàn giao sang Epic',
  handoffHint: 'Đề xuất từ phase trong Implementation Plan mà chưa thấy code tương ứng. Recipe chỉ có cofofo-feature hoặc cofofo-bugfix.',
  handoffPlanIncomplete: 'Bước Implementation Plan chưa đủ điều kiện; vẫn bàn giao được nhưng brief sẽ thiếu.',
  handoffNoPhases: 'Chưa có phase nào trong plans/IMPLEMENTATION_PLAN.md.',
  handoffIntentNote: 'INTENT.md được chụp lại ngay lúc tạo Epic — sửa blueprint sau đó không đổi file này.',
  handoffAlreadyBuilt: 'Đã có trong code',
  handoffCreateAnyway: 'Vẫn tạo Epic',
  handoffAllBuilt: 'Mọi phase đã có mã nguồn hoặc đã bàn giao — không còn Epic implement mới.',
  handoffBuiltSummary: (n) => `${n} phase đã có trong code — không đề xuất Epic`,
  handoffGoal: 'Mục tiêu',
  handoffWhy: 'Vì sao đề xuất',
  handoffInScope: 'Trong phạm vi',
  handoffDod: 'Definition of done',
  handoffNoMatch: (tokens, scanned) =>
    `Chưa thấy file khớp token ${tokens || '(không tách được)'} — đã quét ${scanned} file. Human review: nếu tính năng đã có, đây là lệch matcher chứ không phải việc mới.`,
  handoffPartialMatch: (files) => `Khớp một phần: ${files}`,
  createEpic: 'Tạo Epic',
  epicTitle: 'Tên Epic',
  recipe: 'Recipe',
  deliverables: 'deliverable',

  handoffBlocked: (ids) => `Phase phụ thuộc chưa xong: ${ids}`,
  handoffCounts: (handed, built, pending) =>
    `${pending} cần bàn giao · ${built} đã có code · ${handed} đã thành Epic`,
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
    'One sentence about the product is enough to start, or write more — goals, users, known constraints — to give the agent more context. Discover takes it through 12 steps — Idea → Product Definition → Requirements → Feature Breakdown → Use Cases → User Flow / Screen Flow → Architecture → Data / API / Storage → Technical Decisions → Project Structure → Implementation Plan → Generate Skeleton — writing the result straight into the Markdown files under docs/.',
  emptyHint: 'The .md files under docs/ are the source of truth; the agent fills and updates each section in them.',
  openGuide: 'Open the pipeline guide',
  seedPlaceholder: 'Describe the product — one sentence is enough, or write more for extra context…',
  seedShortcutHint: '⌘/Ctrl + Enter to start',
  start: 'Start',
  orDivider: 'or',
  scanExisting: 'Scan existing source code',
  scanExistingHint: 'Already have source code in this workspace? Scan it instead of typing an idea — the agent reads the code in 3 passes (product, architecture, plan).',
  scanProject: 'Scan project',
  scanBadge: 'scan',
  scanPassBadge: (pass) => {
    const name = pass === 1 ? 'Product' : pass === 2 ? 'Architecture' : pass === 3 ? 'Plan' : '';
    return pass && name ? `scan ${pass}/3 · ${name}` : 'scan';
  },
  commitAll: 'Commit all',
  repoLayout: (scope) => {
    if (!scope) { return 'Repo layout?'; }
    if (scope.layout === 'parent') { return `Parent + ${scope.repos.length}`; }
    if (scope.layout === 'child') { return 'Child repo'; }
    return 'Single repo';
  },

  scopeModal: {
    confirmTitle: 'Saved repo layout',
    useSaved: (summary) => `Use saved layout — ${summary}`,
    editSaved: 'Change layout…',
    layoutTitle: 'How is this repo laid out?',
    single: 'A single repo',
    singleDetail: 'The product\'s code lives in this repo',
    parent: 'A parent repo over several child repos',
    parentDetail: 'This repo holds the docs; the code lives in child repos',
    child: 'A child of a parent repo',
    childDetail: 'This repo is one implementation; product docs live in the parent',
    suggested: 'suggested',
    pickChildren: 'Pick the child repos that hold code (uncheck anything that is not the product)',
    pickChildrenEmpty: 'No child repo found — pick a folder by hand.',
    browse: 'Pick another folder…',
    selected: (n) => `${n} selected`,
    parentPrompt: 'Where is the parent repo?',
    parentManual: 'Or enter a relative path to the parent repo:',
    detected: 'auto-detected',
    kindTitle: 'Repo kind',
    kindPrompt: (name) => `What kind of repo is "${name}"?`,
    kindHint: 'backend / frontend / mobile / infra / …',
    next: 'Next',
    ok: 'OK',
  },

  commitModal: {
    title: 'Commit blueprint changes',
    subtitle: (repo) => `Repo: ${repo}`,
    messageLabel: 'Commit message',
    messagePlaceholder: 'AIDLC Discover: …',
    changeHint: (count) => `${count} changed file${count === 1 ? '' : 's'} in this repo.`,
    generateWithAi: 'Let agent commit all',
    confirm: 'Commit',
  },

  modePipeline: 'Pipeline',
  modeDocs: 'Docs',
  openInEditor: 'Open in editor',
  reload: 'Re-read docs',
  checks: 'Checks',
  checksHint: 'Reconcile blueprint (docs/) with source code and propose pre-filled epics — click Create epic to start immediately.',
  checksEmpty: 'Docs and code are aligned — no epics to create.',
  startEpicFromCheck: 'Create epic',
  suggestionKind: (kind) => SUGGESTION_KIND_EN[kind] ?? kind,

  steps: '12 STEPS',
  stepTitle: (step) => step.label,
  selectedStep: 'SELECTED STEP',
  viewMarkdown: 'Raw Markdown',
  viewPreview: 'Preview',
  viewDiff: 'Diff',

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
  chatStep: 'Talk with the agent',
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

  status: {
    inCode: 'In code',
    missing: 'Not built',
    stale: 'Docs drift',
    mix: 'Mixed',
    nfr: 'Non-functional',
    tree: 'Tree',
    diagram: 'Same tree as a diagram',
    counts: (inCode, missing, stale) =>
      `${inCode} in code · ${missing} not built · ${stale} drift`,
    matcherNote: 'Matched by file/folder name. A new project shows every item as not built. If a feature already exists but shows as missing, that is a matcher miss.',
    empty: 'Nothing to reconcile yet.',
    covers: (ids) => ids,
    searchPlaceholder: 'Search id or description…',
    filterAll: 'All',
    screens: 'Screens',
    screenFlow: 'Screen flow',
    fullscreen: 'Full screen',
    exitFullscreen: 'Exit full screen (Esc)',
  },

  handoffTitle: 'Hand off to an epic',
  handoffHint: 'Proposed from Implementation Plan phases that do not yet have matching source. Recipes: cofofo-feature or cofofo-bugfix only.',
  handoffPlanIncomplete: 'The Implementation Plan step is not complete; you can still hand off, but the brief will be thin.',
  handoffNoPhases: 'No phases in plans/IMPLEMENTATION_PLAN.md yet.',
  handoffIntentNote: 'INTENT.md is snapshotted when the epic is created — editing the blueprint afterwards does not change it.',
  handoffAlreadyBuilt: 'Already in code',
  handoffCreateAnyway: 'Create epic anyway',
  handoffAllBuilt: 'Every phase is already in source or already handed off — no new implement epics.',
  handoffBuiltSummary: (n) => `${n} phase(s) already in code — not proposed`,
  handoffGoal: 'Goal',
  handoffWhy: 'Why this is proposed',
  handoffInScope: 'In scope',
  handoffDod: 'Definition of done',
  handoffNoMatch: (tokens, scanned) =>
    `No file matched token ${tokens || '(none)'} — scanned ${scanned} files. If the feature already exists, this is a matcher miss, not new work.`,
  handoffPartialMatch: (files) => `Partial match: ${files}`,
  createEpic: 'Create epic',
  epicTitle: 'Epic title',
  recipe: 'Recipe',
  deliverables: 'deliverables',

  handoffBlocked: (ids) => `Phases it depends on are not done yet: ${ids}`,
  handoffCounts: (handed, built, pending) =>
    `${pending} to hand off · ${built} already in code · ${handed} handed off`,
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
