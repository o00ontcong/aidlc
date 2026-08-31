import { type Idea } from '../contracts/idea';
import { renderIntentFromJournal } from './journal';

/**
 * Markdown projection of the Idea journal — `INTENT.md` at scaffold time.
 * When a structured journal exists, synthesis comes from human-written sections.
 */
export function renderIdeaBrief(idea: Idea): string {
  if (idea.journal) return renderIntentFromJournal(idea);

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

function section(title: string, value: string): string[] {
  return value.trim() ? [`## ${title}`, '', value.trim(), ''] : [];
}
