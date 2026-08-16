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
    if (heading === 'Flow') {
      const hasFlow = HEADING_RE('Flow').test(body) || /```mermaid[\s\S]+```/i.test(body);
      if (!hasFlow) missing.push('Flow');
      continue;
    }
    if (!HEADING_RE(heading).test(body)) missing.push(heading);
  }
  const ui = section(body, 'UI spec');
  if (ui && !/N\/A\s*[—-]\s*no UI change/i.test(ui) && !/figma|node-id|layout|token/i.test(ui)) {
    missing.push('UI spec (N/A hoặc số đo/Figma)');
  }
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

export function isFeatureImplementPipeline(pipeline: string | null | undefined): boolean {
  return !!pipeline && (pipeline === 'feature-implement' || pipeline.startsWith('feature-implement'));
}
