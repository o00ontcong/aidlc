import { type Shape } from '../contracts/shape';

function section(title: string, value: string): string[] {
  return value.trim() ? [`## ${title}`, '', value.trim(), ''] : [];
}

function listSection(title: string, values: string[]): string[] {
  const items = values.map((item) => item.trim()).filter(Boolean);
  return items.length ? [`## ${title}`, '', ...items.map((item) => `- ${item}`), ''] : [];
}

/** Markdown projection of canonical Shape JSON. Markdown is a handoff/read model, never the state source. */
export function renderShapeBrief(shape: Shape): string {
  const lines = [
    `# ${shape.title}`,
    '',
    `- **Shape:** ${shape.id}`,
    `- **Status:** ${shape.status}`,
    `- **Revision:** ${shape.revision}`,
    `- **Foundation:** revision ${shape.foundation.revision} · ${shape.foundation.contentHash}`,
    '',
    ...section('Problem', shape.problem),
    ...section('Desired Outcome', shape.desiredOutcome),
    ...section('Appetite', shape.appetite),
    ...listSection('Constraints', shape.constraints),
  ];
  if (shape.options.length) {
    lines.push('## Options', '');
    for (const option of shape.options) {
      lines.push(`### ${option.title}`, '', option.summary, '');
      if (option.tradeoffs.length) lines.push(...option.tradeoffs.map((tradeoff) => `- ${tradeoff}`), '');
    }
  }
  lines.push(
    ...section('Selected Approach', shape.selectedApproach),
    ...section('Rationale', shape.rationale),
    ...listSection('Risks', shape.risks),
    ...listSection('No-gos', shape.noGos),
    ...listSection('Acceptance Criteria', shape.acceptanceCriteria),
    ...section('Architecture Impact', shape.architectureImpact),
    ...listSection('Open Questions', shape.openQuestions),
  );
  if (shape.acceptance) {
    lines.push('## Human Acceptance', '', `Accepted at ${shape.acceptance.acceptedAt} by ${shape.acceptance.acceptedBy.id}.`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
