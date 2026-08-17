/** Click-through prototype for the 3-pipeline Cohesive surface. Not host-wired. */

export type ThreePipelineKind = 'project-context' | 'feature-spike' | 'feature-implement';

export type ThreePipelinePhase =
  | 'running'
  | 'blocker'
  | 'briefing'
  | 'done'
  | 'need-pack'
  | 'as-built'
  | 'pr';

export type SpecSource = 'spike' | 'external';

/** Pack picker in the Start implement modal (wireframe §7). */
export type PackSource = 'spike' | 'paste' | 'jira';

export const COMPLETENESS_CHIP_KEYS = [
  'Acceptance criteria',
  'Tasks',
  'UI spec',
  'Flow',
  'Constraints',
] as const;

export interface CompletenessChip {
  key: string;
  label: string;
  ok: boolean;
}

export interface MissionCheck {
  ok: boolean;
  missing: string[];
}

export interface ThreePipelineEpic {
  id: string;
  title: string;
  kind: ThreePipelineKind;
  phase: ThreePipelinePhase;
  summary: string;
  flowMermaid: string;
  missionMd: string;
  specSource?: SpecSource;
  specRef?: string;
  agentNote: string;
  internalPhases: string[];
  blocker?: string;
}

export const MISSION_HEADINGS = [
  'Summary',
  'Problem / Goal',
  'In scope',
  'Out of scope',
  'Functional requirements',
  'Acceptance criteria',
  'Constraints',
  'Tasks',
  'UI spec',
  'Flow',
  'Definition of done',
] as const;

const HEADING_RE = (label: string) => new RegExp(`^##\\s+${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');

/** Completeness gate for the portable MISSION.md paste target. */
export function checkMissionCompleteness(text: string): MissionCheck {
  const body = text.trim();
  const missing: string[] = [];
  if (!body) {
    return { ok: false, missing: [...MISSION_HEADINGS] };
  }
  for (const heading of MISSION_HEADINGS) {
    if (heading === 'Flow') continue;
    if (!HEADING_RE(heading).test(body)) missing.push(heading);
  }
  const flow = section(body, 'Flow');
  if (!flow) missing.push('Flow');
  else if (!/```mermaid[\s\S]+```/i.test(flow) && !/^(flowchart|sequenceDiagram)\b/m.test(flow)) {
    missing.push('Flow (mermaid trong ## Flow)');
  }
  const ui = section(body, 'UI spec');
  if (ui && !/N\/A\s*[—-]\s*no UI change/i.test(ui) && !/figma|node-id|layout|token/i.test(ui)) {
    missing.push('UI spec (N/A hoặc số đo/Figma)');
  }
  const ac = section(body, 'Acceptance criteria') ?? '';
  if (ac.trim().length < 12) missing.push('Acceptance criteria (quá mỏng để nghiệm thu)');
  else if (!/\bAC[- ]?\d+/i.test(ac) && !/\bgiven\b[\s\S]{0,240}\bwhen\b[\s\S]{0,240}\bthen\b/i.test(ac) && !/\|\s*(criterion|verifiable)/i.test(ac)) {
    missing.push('Acceptance criteria (cần AC-id, Given/When/Then, hoặc bảng Criterion)');
  }
  if (/\*\*Status:\*\*\s*Draft/i.test(body) || /OQ blocking/i.test(body)) {
    missing.push('còn OQ blocking / Status Draft');
  }
  return { ok: missing.length === 0, missing };
}

function section(text: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
  const match = re.exec(text);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export const SAMPLE_MISSION = `# Mission — PAY-12

**Status:** Ready for implement
**Source:** spike:PAY-S
**Charter snapshot:** abc123

## Summary
Bỏ self-service sign-up. Email không có account → bottom sheet Unable to sign in (hai biến thể theo org). Happy-path sign-in không đổi.

## Problem / Goal
- **Problem:** Apple policy cấm self-service account creation trên iOS.
- **Goal:** Sign-in only; user không tài khoản thấy sheet, không tạo account.

## In scope
- Email screen copy
- Unable to sign in sheet (no-org / has-org)
- Gỡ mọi entry point tạo account

## Out of scope
- Web
- Thay đổi IDP

## Functional requirements
| ID | Requirement | Serves |
|----|-------------|--------|
| FR-1 | Submit email không có account → sheet, không navigate sign-up | G-1 |
| FR-2 | Domain có org → Contact admin với support từ IDP | G-1 |

## Acceptance criteria
| ID | Criterion | Verifiable how |
|----|-----------|----------------|
| AC-1 | Không còn link/button tạo account trên email screen | đọc code + UI-SPEC |
| AC-2 | Sheet no-org chỉ "Try another email" | UI-SPEC node sheet |
| AC-3 | Happy-path password/passkey không đổi | TASK T4 |

## Constraints
- Inherit INV-2: không đụng CoreAuth crypto
- Cấm simulator để pixel-verify

## Tasks
| ID | Work | Implements | Files | Done when |
|----|------|------------|-------|-----------|
| T1 | Copy email screen | FR-1 | EmailView.swift | AC-1 |
| T2 | Sheet + host detent | FR-1 FR-2 | SignInErrorSheet.swift | AC-2, build xanh |
| T3 | Gỡ sign-up entry points | FR-1 | Coordinator | grep 0 sign-up |

## UI spec
Figma node sheet \`123:456\`. Token Gray.v900. Host dùng \`adaptiveSheetHeight()\`, không GeometryReader.

## Flow
\`\`\`mermaid
flowchart TD
  email[EmailScreen] --> submit[Submit]
  submit --> exists{Account exists?}
  exists -->|yes| signin[Password/Passkey]
  exists -->|no| sheet[Unable to sign in]
  sheet --> try[Try another email]
  sheet --> admin[Contact admin]
\`\`\`

## Definition of done
AC-1..3 + BUILD SUCCEEDED. Pixel do human trên máy.
`;

export const SAMPLE_THIN_REQUIREMENT = `PASS-12: bỏ sign up, hiện lỗi khi email chưa có account.`;

export const ARCHITECTURE_FLOW = `flowchart TD
  APP[OtenPass iOS] --> AUTH[Auth]
  APP --> PAY[Payments]
  AUTH --> API[IDP API]
  PAY --> API
`;

export const PROPOSED_FLOW = `flowchart TD
  email[EmailScreen] --> submit[Submit]
  submit --> exists{Account exists?}
  exists -->|yes| signin[Password/Passkey]
  exists -->|no| sheet[Unable to sign in]
  sheet --> try[Try another email]
  sheet --> admin[Contact admin]
`;

export const AS_BUILT_FLOW = `flowchart TD
  email[EmailScreen] --> submit[Submit]
  submit --> exists{Account exists?}
  exists -->|yes| signin[Password/Passkey]
  exists -->|no| sheet[Unable to sign in]
  sheet --> try[Try another email]
  sheet --> admin[Contact admin]
  sheet -.-> host[SignInErrorSheetFlow]
`;

export function kindLabel(kind: ThreePipelineKind): string {
  if (kind === 'project-context') return 'PROJECT';
  if (kind === 'feature-spike') return 'SPIKE';
  return 'IMPLEMENT';
}

/** Chip on list/detail — never remap a new epic to `cohesive-feature`. */
export function pipelineChipLabel(pipeline: string | null | undefined): string | null {
  if (!pipeline) return null;
  if (pipeline === 'project-context' || pipeline.startsWith('project-context')) return 'project-context';
  if (pipeline === 'feature-spike' || pipeline.startsWith('feature-spike')) return 'feature-spike';
  if (pipeline === 'feature-implement' || pipeline.startsWith('feature-implement')) return 'feature-implement';
  return pipeline;
}

export function isFeatureImplementPipeline(pipeline: string | null | undefined): boolean {
  return !!pipeline && (pipeline === 'feature-implement' || pipeline.startsWith('feature-implement'));
}

export function isFeatureSpikePipeline(pipeline: string | null | undefined): boolean {
  return !!pipeline && (pipeline === 'feature-spike' || pipeline.startsWith('feature-spike'));
}

export function completenessChips(check: MissionCheck): CompletenessChip[] {
  return COMPLETENESS_CHIP_KEYS.map((key) => ({
    key,
    label: key === 'Acceptance criteria' ? 'AC' : key,
    ok: !check.missing.some((item) => item === key || item.startsWith(key)),
  }));
}

export function isImplementStartBlocked(epic: {
  pipeline: string | null;
  existingArtifacts?: string[];
  stepDetails: Array<{ agent: string; stepName?: string; runStatus: string | null }>;
}): boolean {
  if (!isFeatureImplementPipeline(epic.pipeline)) return false;
  const implement = epic.stepDetails.find((step) => (step.stepName ?? step.agent) === 'implement');
  if (!implement || implement.runStatus !== 'awaiting_work') return false;
  return !(epic.existingArtifacts ?? []).includes('MISSION.md');
}

export function briefingGateCopy(
  stepName: string,
  epic?: { description?: string },
): { body: string; approveLabel: string } {
  const name = stepName.trim().toLowerCase();
  if (name === 'establish-baseline') {
    return {
      body: 'SUMMARY + kiến trúc (Architecture Explorer). CONTEXT-REVIEW ## Summary là briefing human. Approve = GO publish.',
      approveLabel: 'Approve',
    };
  }
  if (name === 'package-mission') {
    return {
      body: 'Pack đủ heading + AC testable + 3 graph (Luồng / Surfaces / Cây feature). Copy sang implement hoặc Reject vì còn OQ.',
      approveLabel: 'Approve',
    };
  }
  if (name === 'implement') {
    return {
      body: 'Fidelity với pack? Approve → resolve-bugs (hoặc ship nếu không bug).',
      approveLabel: 'Approve',
    };
  }
  if (name === 'resolve-bugs') {
    const description = epic?.description ?? '';
    const body = /trắng/i.test(description)
      ? 'Sheet trắng top+bottom · iPhone 15. Approve bản sửa khi ôm content.'
      : 'Approve bản sửa khi đã kiểm trên máy thật. Pixel không dùng simulator.';
    return { body, approveLabel: 'Approve bản sửa' };
  }
  return {
    body: `Approve sẽ đánh dấu step ${stepName} hoàn tất và mở step kế tiếp.`,
    approveLabel: 'Approve',
  };
}

/** Mock fetch for the Start implement modal — Jira one-liners stay thin. */
export function packTextForSource(source: PackSource, input: {
  spikeMissionMd?: string;
  paste?: string;
  jiraRef?: string;
}): string {
  if (source === 'spike') return (input.spikeMissionMd ?? '').trim();
  if (source === 'paste') return (input.paste ?? '').trim();
  const ref = (input.jiraRef ?? '').trim();
  if (!ref) return '';
  if (/PASS-888/i.test(ref)) return SAMPLE_MISSION;
  return SAMPLE_THIN_REQUIREMENT;
}

export function phaseLabel(phase: ThreePipelinePhase): string {
  switch (phase) {
    case 'running': return 'đang chạy';
    case 'blocker': return 'câu hỏi';
    case 'briefing': return 'chờ review';
    case 'done': return 'GO';
    case 'need-pack': return 'thiếu pack';
    case 'as-built': return 'chờ bug';
    case 'pr': return 'PR mở';
    default: return phase;
  }
}

export function seedThreePipelineEpics(): ThreePipelineEpic[] {
  return [
    {
      id: 'CTX-1',
      title: 'OtenPass baseline',
      kind: 'project-context',
      phase: 'briefing',
      summary: [
        '# Baseline',
        '',
        '- G-1 retention sign-in',
        '- INV-2 đừng đụng /core-auth crypto',
        '- Quality: xcodebuild OtenPass',
        '- Drift: 2 advisory (sheet host chưa ghi Architecture)',
      ].join('\n'),
      flowMermaid: ARCHITECTURE_FLOW,
      missionMd: '',
      agentNote: 'Snapshot charter abc123 · 8 phase nội bộ đã xong.',
      internalPhases: ['establish-baseline', 'publish-context'],
    },
    {
      id: 'PAY-S',
      title: 'Checkout spike',
      kind: 'feature-spike',
      phase: 'running',
      summary: '',
      flowMermaid: '',
      missionMd: SAMPLE_MISSION,
      agentNote: 'Đọc Jira PASS-888 · POC detent trên tmp/spike-pay · chưa freeze.',
      internalPhases: ['package-mission'],
      blocker: 'Cần chọn: A contact-admin từ IDP  /  B generic only',
    },
  ];
}

export function blankEpic(kind: ThreePipelineKind, id: string, title: string): ThreePipelineEpic {
  const runningNote = kind === 'feature-implement'
    ? 'Chờ mission pack từ spike hoặc nguồn ngoài.'
    : 'Agent vừa start — chưa có briefing.';
  return {
    id,
    title: title.trim() || id,
    kind,
    phase: kind === 'feature-implement' ? 'need-pack' : 'running',
    summary: '',
    flowMermaid: '',
    missionMd: kind === 'feature-spike' ? SAMPLE_MISSION : '',
    agentNote: runningNote,
    internalPhases: kind === 'project-context'
      ? ['establish-baseline', 'publish-context']
      : kind === 'feature-spike'
        ? ['package-mission']
        : ['implement', 'resolve-bugs', 'ship'],
  };
}
