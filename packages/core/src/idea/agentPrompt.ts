import type { Idea, IdeaStage } from '../contracts/idea';
import { getMissingRequirements } from './workflow';
import { ALLOWED_ACTIONS_BY_STAGE, type IdeaAgentActionType } from './agentActions';

type Lang = 'en' | 'vi';

const BASE_INSTRUCTION: Record<Lang, string> = {
  en: [
    'You are the AIDLC Idea Research Agent.',
    'Your purpose is to progressively turn unclear ideas into well-researched decisions.',
    "Do not assume the user's initial idea is correct.",
    'Always distinguish the underlying problem from the proposed solution.',
    'Operate only within the CURRENT STAGE below.',
    'Do not jump into implementation, architecture, technology selection, task planning, or coding unless explicitly required by the workflow.',
    'The structured Idea state below is the source of truth.',
    'Do not claim a workflow stage is complete — the application determines stage completion, not you.',
  ].join('\n'),
  vi: [
    'Bạn là AIDLC Idea Research Agent.',
    'Nhiệm vụ của bạn là dần biến một ý tưởng còn mơ hồ thành một quyết định đã được nghiên cứu kỹ.',
    'Đừng mặc định ý tưởng ban đầu của người dùng là đúng.',
    'Luôn tách rõ vấn đề gốc khỏi giải pháp được đề xuất.',
    'Chỉ làm việc trong CURRENT STAGE bên dưới.',
    'Không nhảy sang implementation, kiến trúc, chọn công nghệ, lập kế hoạch task hay viết code trừ khi workflow yêu cầu rõ.',
    'Idea state có cấu trúc bên dưới là nguồn sự thật duy nhất.',
    'Không tự nhận một stage đã hoàn tất — ứng dụng, không phải bạn, quyết định việc đó.',
  ].join('\n'),
};

const STAGE_GOAL: Record<IdeaStage, Record<Lang, string>> = {
  understand: {
    en: 'Understand the real problem behind the idea.\nFocus on: problem, context, target users/use cases, assumptions, unknowns.\nDo not: choose technology, design architecture, create implementation plans, write code, prematurely recommend a final solution.',
    vi: 'Hiểu đúng vấn đề thật đằng sau ý tưởng.\nTập trung vào: problem, context, target users/use cases, assumptions, unknowns.\nKhông: chọn công nghệ, thiết kế kiến trúc, lập plan implementation, viết code, hay vội đề xuất giải pháp cuối cùng.',
  },
  research: {
    en: 'Understand how the problem is currently solved and collect useful evidence.\nFocus on: existing approaches, relevant evidence, patterns, limitations, findings, remaining unknowns.\nDo not make the final decision.',
    vi: 'Hiểu vấn đề hiện đang được giải quyết ra sao và thu thập bằng chứng hữu ích.\nTập trung vào: cách tiếp cận đã có, bằng chứng liên quan, pattern, giới hạn, findings, unknowns còn lại.\nKhông đưa ra quyết định cuối cùng.',
  },
  explore: {
    en: 'Generate multiple realistic ways to solve the problem.\nFocus on: alternatives, pros, cons, risks, trade-offs, validation.\nAvoid locking onto the original solution.',
    vi: 'Tạo ra nhiều cách khả thi để giải quyết vấn đề.\nTập trung vào: alternatives, pros, cons, risks, trade-offs, validation.\nTránh chốt cứng vào giải pháp ban đầu.',
  },
  decide: {
    en: 'Turn the previous analysis into a clear decision.\nFocus on: recommendation, reasoning, final rewritten idea, scope, success criteria, validation, next step.\nDo not start implementation.',
    vi: 'Biến phần phân tích trước đó thành một quyết định rõ ràng.\nTập trung vào: recommendation, lý do, final rewritten idea, scope, success criteria, validation, next step.\nKhông bắt đầu implementation.',
  },
  ready: { en: 'This idea is Ready — no further agent action applies.', vi: 'Idea này đã Ready — không còn action nào cho agent ở đây.' },
};

const ACTION_EXAMPLE: Record<IdeaAgentActionType, string> = {
  set_problem: '### set_problem\nUsers may have local videos without usable subtitles.',
  set_context: '### set_context\nA video-editing app used mostly offline.',
  add_user: '### add_user\nA field worker with an unreliable connection.',
  add_assumption: '### add_assumption\nGenerating subtitles inside the app would reduce user effort.',
  add_unknown: '### add_unknown\nIt is not yet known whether offline support is required.',
  ask_user: '### ask_user\nDoes subtitle generation need to work offline?',
  add_finding: '### add_finding: inference\nUsers say they check the app manually today.',
  add_source: '### add_source: code\npackages/core/src/idea/IdeaService.ts — does it already expose a similar API?',
  add_existing_solution: '### add_existing_solution\nWeatherKit ships an alerts API that does something similar.',
  add_option: '### add_option: Local on-device model\nRuns speech-to-text entirely on-device.\n\nPros:\n- Works offline\n\nCons:\n- Larger app size',
  update_option: '### update_option: Local on-device model\nPros:\n- Also works in airplane mode',
  add_validation: '### add_validation\nAsk 5 users which option they would notice fastest.',
  add_risk: '### add_risk: Local on-device model\nModel accuracy varies by language.',
  propose_decision: '### propose_decision: go\nShip the push-notification option first; it is the cheapest to validate.',
  set_recommendation: '### set_recommendation\nShip the push-notification option first.',
  rewrite_final_idea: '### rewrite_final_idea\nNotify the user with a push alert when temperature exceeds 38C.',
  set_scope: '### set_scope\n- Push alert for the existing weather screen',
  set_out_of_scope: '### set_out_of_scope\n- Custom alert thresholds per user',
  set_success_criteria: '### set_success_criteria\n- 80% of pilot users notice the alert within 5 minutes',
  set_next_step: '### set_next_step\nDesign the push notification copy with the content team.',
  mark_ready: '### mark_ready\nThis idea looks ready to scaffold.',
};

function relevantState(idea: Idea, stage: IdeaStage): string {
  const lines: string[] = [`Original idea: ${idea.seedSentence.trim()}`];
  if (stage === 'understand' || stage === 'research' || stage === 'explore' || stage === 'decide') {
    lines.push(`Problem: ${idea.understand.problem || '(empty)'}`, `Context: ${idea.understand.context || '(empty)'}`);
    if (idea.understand.users.length) lines.push(`Users: ${idea.understand.users.join('; ')}`);
  }
  if (stage === 'research' || stage === 'explore' || stage === 'decide') {
    if (idea.research.findings.length) lines.push(`Findings so far: ${idea.research.findings.map((f) => `[${f.type}] ${f.text}`).join(' | ')}`);
    if (idea.research.existingSolutions.length) lines.push(`Existing solutions: ${idea.research.existingSolutions.map((s) => s.text).join('; ')}`);
  }
  if (stage === 'explore' || stage === 'decide') {
    if (idea.explore.options.length) lines.push(`Options so far: ${idea.explore.options.map((o) => o.title).join('; ')}`);
  }
  if (stage === 'decide') {
    if (idea.decision.status) lines.push(`Current decision: ${idea.decision.status}`);
  }
  return lines.join('\n');
}

/**
 * Composes the prompt a human copies to whatever AI agent they use, per stage
 * (spec §17-19). Never calls an LLM itself — this repo's only AI mechanism is
 * human-mediated copy/paste (see the Idea Research Workflow implementation
 * plan's "Cơ chế AI Agent" decision). The agent is asked to write its
 * proposal back as a fixed Markdown template (`### <action_type>` blocks,
 * `agentProposal.ts` parses these), not JSON.
 */
export function buildStagePrompt(idea: Idea, stage: IdeaStage, userMessage?: string): string {
  const lang: Lang = idea.outputLanguage;
  const allowed = ALLOWED_ACTIONS_BY_STAGE[stage];
  const missing = getMissingRequirements(idea, stage);
  const parts = [
    BASE_INSTRUCTION[lang],
    '',
    `CURRENT STAGE: ${stage.toUpperCase()}`,
    '',
    STAGE_GOAL[stage][lang],
    '',
    lang === 'vi' ? '## Trạng thái idea hiện tại' : '## Current idea state',
    relevantState(idea, stage),
  ];
  if (missing.length) {
    parts.push(
      '',
      lang === 'vi' ? '## Còn thiếu (bắt buộc)' : '## Still missing (required)',
      missing.map((m) => `- ${m.label}`).join('\n'),
    );
  }
  parts.push(
    '',
    lang === 'vi'
      ? `## Trả lời bằng đúng định dạng Markdown sau — mỗi đề xuất một block "### <action_type>". Chỉ dùng các action_type sau: ${allowed.join(', ')}.`
      : `## Reply using EXACTLY this Markdown format — one "### <action_type>" block per proposal. Only use these action types: ${allowed.join(', ')}.`,
    '',
    allowed.map((type) => ACTION_EXAMPLE[type]).join('\n\n'),
  );
  if (userMessage?.trim()) {
    parts.push('', lang === 'vi' ? '## Ghi chú thêm từ người dùng' : '## Additional note from the user', userMessage.trim());
  }
  return parts.join('\n');
}
