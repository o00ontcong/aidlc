/**
 * `aidlc.loadIosDemoProject` — scaffolds the TodoKit iOS demo at
 * `~/aidlc-ios-demo` and opens it.
 *
 * Unlike the generic demo (see `demoProject.ts`, which inlines every file as a
 * string constant), the static half of this demo is a real file tree shipped
 * under `media/ios-demo/`. That tree contains a Swift package that actually
 * compiles, PNG wireframes, and 10 skill documents — none of which survive
 * being pasted into TypeScript string literals.
 *
 * Only the parts that must be relative to "now" are generated here: epic
 * `state.json` and `.aidlc/runs/*.json`, so the seeded epics always look
 * recently created.
 *
 * Dot-directories are stored undotted in `media/ios-demo/` (`aidlc/`,
 * `claude/`, `epics/`) and mapped on copy, so no packaging step can silently
 * drop them.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DEMO_DIR_NAME = 'aidlc-ios-demo';
const PARENT_PIPELINE = 'project-foundation';
const CHILD_PIPELINE = 'ios-pipeline';

/** Source dir → destination dir, relative to the demo root. */
const TREE_MAP: Array<[string, string]> = [
  ['src', 'src'],
  ['aidlc', '.aidlc'],
  ['claude', '.claude'],
  ['epics', path.join('docs', 'epics')],
];
/** Files copied straight to the demo root. */
const ROOT_FILES = ['README.md', 'CLAUDE.md'];

const PARENT_STEPS = [
  'scan-project',
  'standardize-structure',
  'map-system',
  'document-business-rules',
  'publish-context',
] as const;
const CHILD_STEPS = ['requirement', 'create-plan', 'ui-spec', 'implement', 'fix-bug'] as const;
const CHILD_AGENTS = ['po', 'tech-lead', 'developer', 'developer', 'tech-lead'] as const;
const PARENT_AGENT = 'project-architect';

type StepStatus = 'pending' | 'in_progress' | 'done';
type RunStatus = 'pending' | 'awaiting_work' | 'awaiting_auto_review' | 'awaiting_review' | 'approved' | 'rejected';

interface DemoEpicSpec {
  id: string;
  title: string;
  description: string;
  pipeline: string;
  /** Index of the step the epic is parked on. Steps before it are approved. */
  currentStepIdx: number;
  currentStatus: RunStatus;
  createdHoursAgo: number;
  /** Carried reject feedback, when the epic is parked on `rejected`. */
  feedback?: string;
  inputs?: Record<string, string>;
}

const DEMO_EPICS: DemoEpicSpec[] = [
  {
    id: 'DEMO-FOUNDATION-001',
    title: 'Nền tảng hiểu-biết dự án',
    description:
      'Chạy pipeline cha để dựng project context, cấu trúc chuẩn, business rules và file chỉ dẫn AI. '
      + 'Phải xong bước publish-context thì các epic tính năng mới đóng được bước requirement.',
    pipeline: PARENT_PIPELINE,
    currentStepIdx: 0,
    currentStatus: 'awaiting_work',
    createdHoursAgo: 2,
  },
  {
    id: 'DEMO-TODO-001-GATE',
    title: 'Demo: hard gate của pipeline cha',
    description:
      'Bấm Mark step done ở bước requirement — sẽ bị chặn vì thiếu docs/project/context/CONTEXT-MANIFEST.json. '
      + 'Chạy xong DEMO-FOUNDATION-001 rồi quay lại, bước này sẽ qua được.',
    pipeline: CHILD_PIPELINE,
    currentStepIdx: 0,
    currentStatus: 'awaiting_work',
    createdHoursAgo: 3,
    inputs: { brief: 'Cho phép sắp xếp danh sách theo hạn.' },
  },
  {
    id: 'DEMO-TODO-002-PLAN',
    title: 'Demo: Approve / Reject một artifact',
    description:
      'TASK-PLAN.md đã được tạo và đang chờ người duyệt. Đọc artifact rồi Approve, hoặc Reject kèm lý do '
      + 'để thấy feedback được mang sang lần chạy lại.',
    pipeline: CHILD_PIPELINE,
    currentStepIdx: 1,
    currentStatus: 'awaiting_review',
    createdHoursAgo: 26,
    inputs: { brief: 'Đặt hạn cho việc và làm nổi bật việc quá hạn.' },
  },
  {
    id: 'DEMO-TODO-003-BUILD',
    title: 'Demo: evidence gate — auto-review build thật',
    description:
      'REQUIREMENT, TASK-PLAN, UI-SPEC đã duyệt xong. Chạy /implement để agent sửa code Swift thật, '
      + 'rồi auto-review chạy swift build + swift test. Thử phá một test để xem gate chặn.',
    pipeline: CHILD_PIPELINE,
    currentStepIdx: 3,
    currentStatus: 'awaiting_work',
    createdHoursAgo: 30,
    inputs: { brief: 'Đặt hạn cho việc và làm nổi bật việc quá hạn.' },
  },
  {
    id: 'DEMO-TODO-004-REJECTED',
    title: 'Demo: chạy lại kèm feedback',
    description:
      'UI-SPEC bị reject vì quá nhiều số đo là suy đoán mà không liệt kê ra. '
      + 'Chạy lại bước này — feedback được mang sang cho agent.',
    pipeline: CHILD_PIPELINE,
    currentStepIdx: 2,
    currentStatus: 'rejected',
    createdHoursAgo: 50,
    feedback:
      'Bảng spec có 3 giá trị nguồn "suy đoán" nhưng mục "Chỗ phải suy đoán" chỉ liệt kê 0. '
      + 'Liệt kê đủ, và bổ sung chuỗi hiển thị của empty state.',
    inputs: { brief: 'Empty state và banner lỗi trùng tên.' },
  },
];

export async function loadIosDemoProjectCommand(
  extensionPath: string,
  mode?: 'reseed' | 'open-as-is',
): Promise<void> {
  const demoRoot = path.join(os.homedir(), DEMO_DIR_NAME);
  const exists = fs.existsSync(demoRoot);

  if (exists) {
    let action: 'reseed' | 'open-as-is';
    if (mode) {
      action = mode;
    } else {
      const choice = await vscode.window.showWarningMessage(
        `iOS demo already exists at ~/${DEMO_DIR_NAME}. Re-seed (overwrites src/, .aidlc/, docs/) or open it as-is?`,
        { modal: false },
        'Re-seed and open',
        'Open as-is',
        'Cancel',
      );
      if (choice === 'Cancel' || choice === undefined) { return; }
      action = choice === 'Re-seed and open' ? 'reseed' : 'open-as-is';
    }
    if (action === 'reseed') {
      wipeDemo(demoRoot);
      seedIosDemo(demoRoot, extensionPath);
    }
  } else {
    seedIosDemo(demoRoot, extensionPath);
  }

  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(demoRoot), false);
}

/** Remove only what the seeder owns; anything the user added elsewhere survives. */
function wipeDemo(root: string): void {
  for (const rel of ['src', '.aidlc', '.claude', 'docs', 'README.md', 'CLAUDE.md']) {
    fs.rmSync(path.join(root, rel), { recursive: true, force: true });
  }
}

/**
 * Absolute path of the shipped static tree. Resolved from the extension path
 * the caller already holds rather than from `__dirname`, which differs
 * between the bundled build (`out/`) and plain tsc output (`out/v2/`).
 */
function demoAssetRoot(extensionPath: string): string {
  const dir = path.join(extensionPath, 'media', 'ios-demo');
  if (!fs.existsSync(path.join(dir, 'aidlc', 'workspace.yaml'))) {
    throw new Error(`iOS demo assets not found at ${dir} — media/ios-demo/ is missing from the extension.`);
  }
  return dir;
}

export function seedIosDemo(root: string, extensionPath: string): void {
  const assets = demoAssetRoot(extensionPath);

  for (const [from, to] of TREE_MAP) {
    copyDir(path.join(assets, from), path.join(root, to));
  }
  for (const file of ROOT_FILES) {
    const src = path.join(assets, file);
    if (fs.existsSync(src)) { copyFile(src, path.join(root, file)); }
  }

  // `docs/project/` is deliberately left empty: producing it is the whole
  // point of the parent pipeline, and CONTEXT-MANIFEST.json is what unblocks
  // the child pipeline's first step.

  for (const spec of DEMO_EPICS) {
    writeEpicState(root, spec);
    writeRunState(root, spec);
  }
}

function stepsFor(pipeline: string): readonly string[] {
  return pipeline === PARENT_PIPELINE ? PARENT_STEPS : CHILD_STEPS;
}

function agentFor(pipeline: string, idx: number): string {
  return pipeline === PARENT_PIPELINE ? PARENT_AGENT : (CHILD_AGENTS[idx] ?? 'developer');
}

/** `docs/epics/<id>/state.json` — what the Epics list reads. */
function writeEpicState(root: string, spec: DemoEpicSpec): void {
  const steps = stepsFor(spec.pipeline);
  const epicDir = path.join(root, 'docs', 'epics', spec.id);
  const createdAt = isoOffset(-spec.createdHoursAgo);

  const stepStates = steps.map((name, idx) => {
    let status: StepStatus = 'pending';
    if (idx < spec.currentStepIdx) { status = 'done'; }
    else if (idx === spec.currentStepIdx) {
      status = spec.currentStatus === 'awaiting_work' ? 'pending' : 'in_progress';
    }
    return {
      agent: agentFor(spec.pipeline, idx),
      name,
      status,
      startedAt: idx <= spec.currentStepIdx ? isoOffset(-spec.createdHoursAgo + idx * 0.5) : null,
      finishedAt: idx < spec.currentStepIdx ? isoOffset(-spec.createdHoursAgo + (idx + 0.5) * 0.5) : null,
    };
  });

  writeJson(path.join(epicDir, 'state.json'), {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    pipeline: spec.pipeline,
    agent: null,
    agents: steps.map((_, idx) => agentFor(spec.pipeline, idx)),
    currentStep: spec.currentStepIdx,
    status: spec.currentStepIdx === 0 && spec.currentStatus === 'awaiting_work' ? 'pending' : 'in_progress',
    runMode: 'guided',
    createdAt,
    stepStates,
  });

  writeJson(path.join(epicDir, 'inputs.json'), {
    epic: spec.id,
    ...(spec.inputs ?? {}),
  });
}

/** `.aidlc/runs/<id>.json` — what drives the gate buttons. */
function writeRunState(root: string, spec: DemoEpicSpec): void {
  const steps = stepsFor(spec.pipeline);
  const createdAt = isoOffset(-spec.createdHoursAgo);

  const records = steps.map((_, idx) => {
    let status: RunStatus = 'pending';
    if (idx < spec.currentStepIdx) { status = 'approved'; }
    else if (idx === spec.currentStepIdx) { status = spec.currentStatus; }
    return {
      stepIdx: idx,
      agent: agentFor(spec.pipeline, idx),
      revision: idx === spec.currentStepIdx && spec.currentStatus === 'rejected' ? 2 : 1,
      status,
      artifactsProduced: [] as string[],
      ...(idx === spec.currentStepIdx && spec.feedback
        ? { feedback: spec.feedback, rejectReason: spec.feedback }
        : {}),
    };
  });

  writeJson(path.join(root, '.aidlc', 'runs', `${spec.id}.json`), {
    schemaVersion: 1,
    runId: spec.id,
    pipelineId: spec.pipeline,
    context: { epic: spec.id },
    startedAt: createdAt,
    updatedAt: isoOffset(-spec.createdHoursAgo + 1),
    currentStepIdx: spec.currentStepIdx,
    status: 'running',
    steps: records,
  });
}

function copyDir(from: string, to: string): void {
  if (!fs.existsSync(from)) { return; }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) { copyDir(src, dest); } else { copyFile(src, dest); }
  }
}

function copyFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function isoOffset(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function writeJson(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
