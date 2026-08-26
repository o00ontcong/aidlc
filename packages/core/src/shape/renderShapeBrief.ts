import { type Shape } from '../contracts/shape';

function section(title: string, value: string): string[] {
  return value.trim() ? [`## ${title}`, '', value.trim(), ''] : [];
}

function listSection(title: string, values: string[]): string[] {
  const items = values.map((item) => item.trim()).filter(Boolean);
  return items.length ? [`## ${title}`, '', ...items.map((item) => `- ${item}`), ''] : [];
}

function engineeringLoopHandoff(): string[] {
  return [
    '## Engineering Loop Handoff',
    '',
    'The human has approved the research and plan above. Delivery begins only now and follows this evidence-led loop:',
    '',
    '1. **Test first** — Write a failing test before changing production code.',
    '2. **Implement** — Make the smallest change that turns the intended test green.',
    '3. **Review** — Review the implementation from a fresh context for quality, regressions, and security.',
    '4. **Verify** — Run the agreed validation and record the actual results.',
    '5. **Remember** — Preserve the decision and evidence with this Epic.',
    '6. **Improve** — Capture reusable lessons when the same win can help later work.',
    '',
  ];
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
    ...engineeringLoopHandoff(),
  );
  if (shape.acceptance) {
    lines.push('## Human Acceptance', '', `Accepted at ${shape.acceptance.acceptedAt} by ${shape.acceptance.acceptedBy.id}.`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
