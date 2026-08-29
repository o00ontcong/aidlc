import { type Idea } from '../contracts/idea';

function section(title: string, value: string): string[] {
  return value.trim() ? [`## ${title}`, '', value.trim(), ''] : [];
}

/**
 * Markdown projection of canonical Idea JSON — the compressed `INTENT.md`
 * the flow graph's "intent" node writes once the question batch (or the
 * self-answer path alone, if zero questions were warranted) converges.
 * Never the state source: `state.json` is. Snapshotted immutably into the
 * scaffolded epic's `artifacts/INTENT.md` (mirrors `renderShapeBrief` /
 * `artifacts/SHAPE.md`).
 */
export function renderIdeaBrief(idea: Idea): string {
  const answered = idea.prep.questions
    .filter((question) => idea.answers[question.id])
    .map((question) => {
      const choiceId = idea.answers[question.id];
      const chosen = question.options.find((option) => option.id === choiceId);
      return `- ${question.text} → ${chosen?.label ?? choiceId}`;
    });

  const lines = [
    `# ${idea.title || idea.seedSentence.slice(0, 72)}`,
    '',
    `- **Idea:** ${idea.id}`,
    `- **Checkpoint:** ${idea.checkpoint}`,
    `- **Revision:** ${idea.ideaRevision}`,
    idea.foundationHashAtCapture
      ? `- **Foundation:** revision ${idea.foundationHashAtCapture.revision} · ${idea.foundationHashAtCapture.manifestHash}`
      : '- **Foundation:** not yet published at capture time',
    '',
    ...section('Seed', idea.seedSentence),
  ];

  if (answered.length) {
    lines.push('## Confirmed Answers', '', ...answered, '');
  }

  if (idea.assumptions.length) {
    lines.push(
      '## Assumptions',
      '',
      ...idea.assumptions.map((assumption) => `- ${assumption.label} (${assumption.source})`),
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
