/** Completeness gate for the portable MISSION.md pack. Shared by Start implement and validators. */

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

export interface MissionCheck {
  ok: boolean;
  missing: string[];
}

const HEADING_RE = (label: string) =>
  new RegExp(`^##\\s+${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'im');

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
  else if (!extractMermaidFence(flow)) missing.push('Flow (mermaid trong ## Flow)');

  const ui = section(body, 'UI spec');
  if (ui && !/N\/A\s*[—-]\s*no UI change/i.test(ui) && !/figma|node-id|layout|token/i.test(ui)) {
    missing.push('UI spec (N/A hoặc số đo/Figma)');
  }
  missing.push(...acceptanceCriteriaProblems(section(body, 'Acceptance criteria') ?? ''));
  if (/\*\*Status:\*\*\s*Draft/i.test(body) || /OQ blocking/i.test(body)) {
    missing.push('còn OQ blocking / Status Draft');
  }
  return { ok: missing.length === 0, missing };
}

export function section(text: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'im');
  const match = re.exec(text);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function extractMermaidFence(text: string): string {
  const fence = String(text ?? '').match(/```mermaid\s*([\s\S]+?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const trimmed = String(text ?? '').trim();
  if (/^(flowchart|sequenceDiagram)\b/m.test(trimmed)) return trimmed;
  return '';
}

export function mermaidNormalized(text: string): string {
  return extractMermaidFence(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function mermaidEquals(a: string, b: string): boolean {
  const left = mermaidNormalized(a);
  return left.length > 0 && left === mermaidNormalized(b);
}

/** AC must be testable. Vague "should work" is not enough. */
export function acceptanceCriteriaProblems(ac: string): string[] {
  const body = ac.trim();
  const problems: string[] = [];
  if (body.length < 12) {
    problems.push('Acceptance criteria (quá mỏng để nghiệm thu)');
    return problems;
  }
  if (/should work well|feels fast|good UX|just works/i.test(body)) {
    problems.push('Acceptance criteria (tránh "should work well")');
  }
  const hasId = /\bAC[- ]?\d+/i.test(body);
  const hasGwt = /\bgiven\b[\s\S]{0,240}\bwhen\b[\s\S]{0,240}\bthen\b/i.test(body);
  const hasTable = /\|\s*(criterion|verifiable)/i.test(body);
  if (!hasId && !hasGwt && !hasTable) {
    problems.push('Acceptance criteria (cần AC-id, Given/When/Then, hoặc bảng Criterion)');
  }
  return problems;
}

export function isFeatureImplementPipeline(pipeline: string | null | undefined): boolean {
  return !!pipeline && (pipeline === 'feature-implement' || pipeline.startsWith('feature-implement'));
}
