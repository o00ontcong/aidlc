import type { Idea } from '../contracts/idea';
import { COFOFO_RECIPE_IDS, type CofofoRecipeId, type IdeaJournal, type IdeaJournalPhase } from '../contracts/idea';

export function emptyJournal(): IdeaJournal {
  return {
    sources: [],
    notes: [],
    rewrite: { problem: '', outcome: '', appetite: '', noGos: '' },
  };
}

const LEGACY_CHECKPOINTS = new Set(['preparing', 'awaiting_human', 'intent_drafted', 'route_proposed']);

/** Ensure journal fields exist and migrate legacy provider-managed checkpoints. */
export function normalizeIdeaJournal(idea: Idea): Idea {
  let next = idea;
  if (LEGACY_CHECKPOINTS.has(idea.checkpoint)) {
    next = { ...next, checkpoint: 'captured', blockedReason: undefined };
  }
  const journal = next.journal ?? emptyJournal();
  const journalPhase = next.journalPhase ?? inferJournalPhase(next);
  if (next.journal === journal && next.journalPhase === journalPhase && next === idea) return idea;
  return { ...next, journal, journalPhase };
}

function inferJournalPhase(idea: Idea): IdeaJournalPhase {
  if (idea.checkpoint === 'in_delivery' || idea.checkpoint === 'completed') return 'ready';
  if (idea.checkpoint === 'route_proposed' || idea.checkpoint === 'intent_drafted') return 'ready';
  if (idea.prep.status === 'done' && idea.prep.questions.length > 0) return 'rewrite';
  if (idea.prep.selfAnswered.length > 0) return 'research';
  return 'spark';
}

export type IdeaPromptKey =
  | 'spark_clarify'
  | 'research_sources'
  | 'research_summarize'
  | 'rewrite_draft'
  | 'ready_check';

export function buildIdeaCopyPrompt(idea: Idea, key: IdeaPromptKey, language: 'en' | 'vi'): string {
  const vi = language === 'vi';
  const seed = idea.seedSentence.trim();
  const j = idea.journal ?? emptyJournal();
  const rewriteBlock = [
    j.rewrite.problem && `Problem: ${j.rewrite.problem}`,
    j.rewrite.outcome && `Outcome: ${j.rewrite.outcome}`,
    j.rewrite.appetite && `Appetite: ${j.rewrite.appetite}`,
    j.rewrite.noGos && `No-gos: ${j.rewrite.noGos}`,
  ].filter(Boolean).join('\n');
  const notesBlock = j.notes.map((n) => `- [${n.at}] ${n.text}`).join('\n');
  const sourcesBlock = j.sources.map((s) => `- ${s.source} (${s.type}): ${s.question}${s.read ? ' [read]' : ''}`).join('\n');

  switch (key) {
    case 'spark_clarify':
      return vi
        ? `Tôi có ý tưởng sản phẩm/kỹ thuật:\n«${seed}»\n\nHãy hỏi tôi từng câu một để hiểu **kết quả cuối cùng** tôi muốn thấy (dấu hiệu quan sát được khi "xong").\n- Không đề xuất giải pháp kỹ thuật.\n- Mỗi lượt một câu.\n- Khi đủ rõ, tóm tắt lại bằng lời tôi và gợi ý 2–3 câu outcome có thể paste vào journal.`
        : `I have a product/engineering idea:\n«${seed}»\n\nAsk me one question at a time to understand the **observable outcome** I want when this is "done".\n- Do not propose technical solutions.\n- One question per turn.\n- When clear enough, restate in my words and suggest 2–3 outcome sentences I can paste into my journal.`;
    case 'research_sources':
      return vi
        ? `Ý tưởng: «${seed}»\n\nLiệt kê 5–8 nguồn tôi nên đọc (docs repo, file code, issue, bài viết). Mỗi nguồn:\n- path hoặc URL\n- loại (code / doc / issue / web)\n- **một câu hỏi cụ thể** cần trả lời từ nguồn đó\n\nOutput markdown bảng để tôi paste vào journal.`
        : `Idea: «${seed}»\n\nList 5–8 sources I should read (repo docs, code files, issues, articles). For each:\n- path or URL\n- type (code / doc / issue / web)\n- **one specific question** to answer from that source\n\nOutput a markdown table I can paste into my journal.`;
    case 'research_summarize':
      return vi
        ? `Ý tưởng: «${seed}»\n\nNguồn đã có:\n${sourcesBlock || '(chưa có)'}\n\nTôi vừa đọc và paste excerpt bên dưới. Trích 3–5 **observation** thuần túy (quote nếu có). Tách rõ fact vs suy diễn.\n\n[PASTE EXCERPT HERE]\n\nOutput markdown bullet để tôi paste vào journal.`
        : `Idea: «${seed}»\n\nSources so far:\n${sourcesBlock || '(none yet)'}\n\nI read and paste an excerpt below. Extract 3–5 plain **observations** (quote when possible). Separate facts from inference.\n\n[PASTE EXCERPT HERE]\n\nOutput markdown bullets I can paste into my journal.`;
    case 'rewrite_draft':
      return vi
        ? `Dựa trên journal bên dưới, giúp tôi viết draft **Problem**, **Outcome (quan sát được)**, **Appetite**, **No-gos**.\nGiữ giọng của tôi; không thêm scope.\n\nSeed: ${seed}\n\nGhi chép nghiên cứu:\n${notesBlock || '(trống)'}\n\nDraft hiện tại:\n${rewriteBlock || '(trống)'}\n\nOutput 4 section markdown.`
        : `From the journal below, draft **Problem**, **Observable outcome**, **Appetite**, **No-gos** in my voice — no extra scope.\n\nSeed: ${seed}\n\nResearch notes:\n${notesBlock || '(empty)'}\n\nCurrent draft:\n${rewriteBlock || '(empty)'}\n\nOutput 4 markdown sections.`;
    case 'ready_check':
      return vi
        ? `Đọc INTENT draft và nghiên cứu. Liệt kê lỗ hổng evidence còn thiếu.\nGợi ý một recipe CoFoFo trong: ${COFOFO_RECIPE_IDS.join(', ')} — tôi sẽ quyết định.\n\n${rewriteBlock}\n\nSources:\n${sourcesBlock || '(trống)'}`
        : `Read the INTENT draft and research. List evidence gaps.\nSuggest one CoFoFo recipe from: ${COFOFO_RECIPE_IDS.join(', ')} — I will decide.\n\n${rewriteBlock}\n\nSources:\n${sourcesBlock || '(empty)'}`;
    default:
      return seed;
  }
}

export function renderJournalMarkdown(idea: Idea): string {
  const j = idea.journal ?? emptyJournal();
  const lines = [
    `# ${idea.title || idea.id}`,
    '',
    `- **Idea:** ${idea.id}`,
    `- **Phase:** ${idea.journalPhase ?? 'spark'}`,
    `- **Updated:** ${idea.updatedAt}`,
    '',
    '## Spark',
    '',
    idea.seedSentence.trim() || '_(empty)_',
    '',
    '## Research',
    '',
    '### Sources',
    '',
  ];
  if (j.sources.length === 0) {
    lines.push('_No sources yet._', '');
  } else {
    lines.push('| Source | Type | Question | Read |', '| --- | --- | --- | --- |');
    for (const s of j.sources) {
      lines.push(`| ${s.source} | ${s.type} | ${s.question} | ${s.read ? 'yes' : 'no'} |`);
    }
    lines.push('');
  }
  lines.push('### Notes', '');
  if (j.notes.length === 0) {
    lines.push('_No notes yet._', '');
  } else {
    for (const n of j.notes) {
      lines.push(`**${n.at}** · ${n.origin}`, '', n.text.trim(), '');
    }
  }
  lines.push('## Rewrite', '');
  lines.push('### Problem', '', j.rewrite.problem.trim() || '_(empty)_', '');
  lines.push('### Outcome', '', j.rewrite.outcome.trim() || '_(empty)_', '');
  lines.push('### Appetite', '', j.rewrite.appetite.trim() || '_(empty)_', '');
  lines.push('### No-gos', '', j.rewrite.noGos.trim() || '_(empty)_', '');
  if (j.readyRecipeId) {
    lines.push('## Ready', '', `- **Recipe:** ${j.readyRecipeId}`, j.readyEpicTitle ? `- **Epic title:** ${j.readyEpicTitle}` : '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderIntentFromJournal(idea: Idea): string {
  const j = idea.journal ?? emptyJournal();
  const lines = [
    `# ${idea.title || idea.seedSentence.slice(0, 72)}`,
    '',
    `- **Idea:** ${idea.id}`,
    `- **Journal phase:** ${idea.journalPhase ?? 'spark'}`,
    idea.foundationHashAtCapture
      ? `- **Foundation:** revision ${idea.foundationHashAtCapture.revision} · ${idea.foundationHashAtCapture.manifestHash}`
      : '- **Foundation:** not captured at idea creation',
    '',
    '## Seed',
    '',
    idea.seedSentence.trim(),
    '',
  ];
  if (j.rewrite.problem.trim()) lines.push('## Problem', '', j.rewrite.problem.trim(), '');
  if (j.rewrite.outcome.trim()) lines.push('## Desired outcome', '', j.rewrite.outcome.trim(), '');
  if (j.rewrite.appetite.trim()) lines.push('## Appetite', '', j.rewrite.appetite.trim(), '');
  if (j.rewrite.noGos.trim()) lines.push('## Non-goals', '', j.rewrite.noGos.trim(), '');
  if (j.notes.length) {
    lines.push('## Research notes', '', ...j.notes.map((n) => `- (${n.at}) ${n.text.replace(/\n/g, ' ')}`), '');
  }
  if (j.sources.length) {
    lines.push('## Sources', '', ...j.sources.map((s) => `- ${s.source} — ${s.question}`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function suggestRecipeFromJournal(idea: Idea): CofofoRecipeId {
  const text = `${idea.seedSentence} ${idea.journal?.rewrite.problem ?? ''}`.toLowerCase();
  if (/\b(bug|fix|broken|error|crash|slow|wrong|lỗi|sai|chậm|hỏng)\b/.test(text)) return 'cofofo-bugfix';
  return 'cofofo-feature';
}
