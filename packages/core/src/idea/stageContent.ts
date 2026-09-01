import type {
  CofofoRecipeId,
  Idea,
  IdeaDecision,
  IdeaExplore,
  IdeaResearch,
  IdeaUnderstand,
} from '../contracts/idea';
import { getStageStatus } from './workflow';

export function emptyUnderstand(): IdeaUnderstand {
  return { problem: '', context: '', users: [], assumptions: [], unknowns: [] };
}

export function emptyResearch(): IdeaResearch {
  return { findings: [], sources: [], existingSolutions: [], unknowns: [] };
}

export function emptyExplore(): IdeaExplore {
  return { options: [], validations: [] };
}

export function emptyDecision(): IdeaDecision {
  return { scope: [], outOfScope: [], successCriteria: [] };
}

function bulleted(items: string[], emptyLabel: string): string[] {
  return items.length === 0 ? [`_${emptyLabel}_`] : items.map((i) => `- ${i}`);
}

const FINDING_TYPE_LABEL: Record<string, string> = { fact: 'FACT', assumption: 'ASSUMPTION', inference: 'INFERENCE' };

/** Markdown projection of the whole research workflow — `docs/ideas/<id>/RESEARCH.md`. */
export function renderResearchMarkdown(idea: Idea): string {
  const status = getStageStatus(idea);
  const lines = [
    `# ${idea.title || idea.id}`,
    '',
    `- **Idea:** ${idea.id}`,
    `- **Stage:** ${idea.stage}`,
    `- **Updated:** ${idea.updatedAt}`,
    idea.needsReview ? `- **Needs review:** ${idea.needsReview.reason} (since ${idea.needsReview.since})` : '',
    '',
    ...(idea.pendingActions.length === 0 ? [] : [
      '## Pending AI proposals',
      '',
      ...idea.pendingActions.flatMap((p) => [
        `### ${p.summary}`,
        '',
        `- **Stage:** ${p.stage}`,
        `- **Type:** ${p.actionType}`,
        `- **Proposed:** ${p.createdAt}`,
        '',
        '```json',
        JSON.stringify(p.payload, null, 2),
        '```',
        '',
      ]),
    ]),
    '## Original idea',
    '',
    idea.seedSentence.trim() || '_(empty)_',
    '',
    '## Understand',
    '',
    '### Problem', '', idea.understand.problem.trim() || '_(empty)_', '',
    '### Context', '', idea.understand.context.trim() || '_(empty)_', '',
    '### Users / use cases', '', ...bulleted(idea.understand.users, 'None yet'), '',
    '### Assumptions', '', ...bulleted(idea.understand.assumptions, 'None yet'), '',
    '### Unknowns', '', ...bulleted(idea.understand.unknowns, 'None yet'), '',
    '## Research',
    '',
    '### Findings', '',
    ...(idea.research.findings.length === 0
      ? ['_No findings yet._']
      : idea.research.findings.map((f) => `- **[${FINDING_TYPE_LABEL[f.type] ?? f.type}]** ${f.text}`)),
    '',
    '### Existing solutions', '', ...bulleted(idea.research.existingSolutions.map((s) => s.text), 'None yet'), '',
    '### Sources', '',
    ...(idea.research.sources.length === 0
      ? ['_No sources yet._']
      : idea.research.sources.map((s) => `- ${s.source} (${s.type}): ${s.question}${s.read ? ' [read]' : ''}`)),
    '',
    '### Unknowns', '', ...bulleted(idea.research.unknowns, 'None yet'), '',
    '## Explore',
    '',
    ...(idea.explore.options.length === 0 ? ['_No options yet._', ''] : idea.explore.options.flatMap((o) => [
      `### ${o.title}`,
      '',
      o.description.trim(),
      '',
      '**Pros:**', ...bulleted(o.pros, 'None'), '',
      '**Cons:**', ...bulleted(o.cons, 'None'), '',
      '**Risks:**', ...bulleted(o.risks, 'None'), '',
      '**Trade-offs:**', ...bulleted(o.tradeoffs, 'None'), '',
      o.validation ? `**Validation:** ${o.validation}` : '',
      '',
    ])),
    '### Idea-level validation ideas', '', ...bulleted(idea.explore.validations, 'None yet'), '',
    '## Decide',
    '',
    `- **Decision:** ${idea.decision.status ?? '_(not decided)_'}`,
    `- **Recommendation:** ${idea.decision.recommendation?.trim() || '_(empty)_'}`,
    `- **Final idea:** ${idea.decision.finalIdea?.trim() || '_(empty)_'}`,
    '### Scope', '', ...bulleted(idea.decision.scope, 'None yet'), '',
    '### Out of scope', '', ...bulleted(idea.decision.outOfScope, 'None yet'), '',
    `- **Validation:** ${idea.decision.validation?.trim() || '_(empty)_'}`,
    '### Success criteria', '', ...bulleted(idea.decision.successCriteria, 'None yet'), '',
    `- **Next step:** ${idea.decision.nextStep?.trim() || '_(empty)_'}`,
    '',
    `_Completion: ${Math.round(status.completion * 100)}% of ${idea.stage} requirements._`,
  ];
  return `${lines.filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** `INTENT.md` — the final brief handed to `scaffoldEpic()`. */
export function renderIntentFromIdea(idea: Idea): string {
  const lines = [
    `# ${idea.title || idea.seedSentence.slice(0, 72)}`,
    '',
    `- **Idea:** ${idea.id}`,
    `- **Stage:** ${idea.stage}`,
    idea.foundationHashAtCapture
      ? `- **Foundation:** revision ${idea.foundationHashAtCapture.revision} · ${idea.foundationHashAtCapture.manifestHash}`
      : '- **Foundation:** not captured at idea creation',
    '',
    '## Original idea',
    '',
    idea.seedSentence.trim(),
    '',
  ];
  if (idea.understand.problem.trim()) lines.push('## Problem', '', idea.understand.problem.trim(), '');
  if (idea.understand.context.trim()) lines.push('## Context', '', idea.understand.context.trim(), '');
  if (idea.understand.users.length) lines.push('## Users / use cases', '', ...idea.understand.users.map((u) => `- ${u}`), '');
  if (idea.decision.finalIdea?.trim()) lines.push('## Final idea', '', idea.decision.finalIdea.trim(), '');
  if (idea.decision.recommendation?.trim()) lines.push('## Recommendation', '', idea.decision.recommendation.trim(), '');
  if (idea.decision.scope.length) lines.push('## Scope', '', ...idea.decision.scope.map((s) => `- ${s}`), '');
  if (idea.decision.outOfScope.length) lines.push('## Out of scope', '', ...idea.decision.outOfScope.map((s) => `- ${s}`), '');
  if (idea.decision.successCriteria.length) lines.push('## Success criteria', '', ...idea.decision.successCriteria.map((s) => `- ${s}`), '');
  if (idea.decision.nextStep?.trim()) lines.push('## Next step', '', idea.decision.nextStep.trim(), '');
  if (idea.research.findings.length) {
    lines.push('## Research findings', '', ...idea.research.findings.map((f) => `- [${f.type}] ${f.text}`), '');
  }
  if (idea.research.sources.length) {
    lines.push('## Sources', '', ...idea.research.sources.map((s) => `- ${s.source} — ${s.question}`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function suggestRecipeFromIdea(idea: Idea): CofofoRecipeId {
  const text = `${idea.seedSentence} ${idea.understand.problem} ${idea.decision.finalIdea ?? ''}`.toLowerCase();
  if (/\b(bug|fix|broken|error|crash|slow|wrong|lỗi|sai|chậm|hỏng)\b/.test(text)) return 'cofofo-bugfix';
  return 'cofofo-feature';
}
