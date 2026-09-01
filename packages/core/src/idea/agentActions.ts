import { z } from 'zod';
import { DecisionStatusSchema, FindingTypeSchema, type IdeaStage } from '../contracts/idea';

/**
 * The structured actions an AI proposal may contain — spec §21. Kept as a
 * flat discriminated union (not per-stage types) because a handful of action
 * types (`add_unknown`, `ask_user`) are shared across stages; `ALLOWED_ACTIONS_BY_STAGE`
 * below is what actually restricts which types a given stage's proposal may use.
 */
export const IdeaAgentActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_problem'), value: z.string().min(1) }),
  z.object({ type: z.literal('set_context'), value: z.string().min(1) }),
  z.object({ type: z.literal('add_user'), value: z.string().min(1) }),
  z.object({ type: z.literal('add_assumption'), value: z.string().min(1) }),
  z.object({ type: z.literal('add_unknown'), value: z.string().min(1) }),
  /** Rendered prominently with quick replies — never auto-applied, never a pending field-change (spec §26). */
  z.object({ type: z.literal('ask_user'), question: z.string().min(1) }),
  z.object({
    type: z.literal('add_finding'),
    text: z.string().min(1),
    findingType: FindingTypeSchema,
    sourceIds: z.array(z.string()).default([]),
  }),
  z.object({ type: z.literal('add_source'), source: z.string().min(1), sourceType: z.string().min(1), question: z.string().min(1) }),
  z.object({ type: z.literal('add_existing_solution'), text: z.string().min(1) }),
  z.object({
    type: z.literal('add_option'),
    title: z.string().min(1),
    description: z.string().default(''),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    tradeoffs: z.array(z.string()).default([]),
    validation: z.string().optional(),
  }),
  /** Matched against an existing option by exact (trimmed) title — the agent has no way to know generated option ids. */
  z.object({
    type: z.literal('update_option'),
    title: z.string().min(1),
    description: z.string().optional(),
    pros: z.array(z.string()).optional(),
    cons: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    tradeoffs: z.array(z.string()).optional(),
    validation: z.string().optional(),
  }),
  z.object({ type: z.literal('add_validation'), value: z.string().min(1) }),
  z.object({ type: z.literal('add_risk'), optionTitle: z.string().min(1), value: z.string().min(1) }),
  z.object({ type: z.literal('propose_decision'), status: DecisionStatusSchema, recommendation: z.string().min(1) }),
  z.object({ type: z.literal('set_recommendation'), value: z.string().min(1) }),
  z.object({ type: z.literal('rewrite_final_idea'), value: z.string().min(1) }),
  z.object({ type: z.literal('set_scope'), value: z.array(z.string()) }),
  z.object({ type: z.literal('set_out_of_scope'), value: z.array(z.string()) }),
  z.object({ type: z.literal('set_success_criteria'), value: z.array(z.string()) }),
  z.object({ type: z.literal('set_next_step'), value: z.string().min(1) }),
  /** Never applied by the executor — the app's own Mark Ready control (`IdeaService.markReady`) is the only door to "ready" (spec §10/§15). */
  z.object({ type: z.literal('mark_ready') }),
]);
export type IdeaAgentAction = z.infer<typeof IdeaAgentActionSchema>;
export type IdeaAgentActionType = IdeaAgentAction['type'];

export const ALLOWED_ACTIONS_BY_STAGE: Record<IdeaStage, IdeaAgentActionType[]> = {
  understand: ['set_problem', 'set_context', 'add_user', 'add_assumption', 'add_unknown', 'ask_user'],
  research: ['add_finding', 'add_source', 'add_existing_solution', 'add_unknown', 'ask_user'],
  explore: ['add_option', 'update_option', 'add_validation', 'add_risk', 'ask_user'],
  decide: [
    'propose_decision', 'set_recommendation', 'rewrite_final_idea',
    'set_scope', 'set_out_of_scope', 'set_success_criteria', 'set_next_step', 'mark_ready', 'ask_user',
  ],
  ready: [],
};

/** Additive, low-risk — spec §24 "may be auto-applied initially". Reversible by just deleting the added row. */
export const LOW_IMPACT_ACTIONS = new Set<IdeaAgentActionType>([
  'add_user', 'add_assumption', 'add_unknown', 'add_finding', 'add_source',
  'add_existing_solution', 'add_option', 'update_option', 'add_validation', 'add_risk',
]);

/** Overwrites a foundational field or an existing array outright — spec §24 requires human approval. */
export const HIGH_IMPACT_ACTIONS = new Set<IdeaAgentActionType>([
  'set_problem', 'set_context', 'propose_decision', 'set_recommendation', 'rewrite_final_idea',
  'set_scope', 'set_out_of_scope', 'set_success_criteria', 'set_next_step', 'mark_ready',
]);

export function isHighImpact(type: IdeaAgentActionType): boolean {
  return HIGH_IMPACT_ACTIONS.has(type);
}

export function isActionAllowedInStage(type: IdeaAgentActionType, stage: IdeaStage): boolean {
  return ALLOWED_ACTIONS_BY_STAGE[stage].includes(type);
}

/** One-line "AI proposes: ..." summary for the approval card / audit event, spec §24's mock. */
export function describeAction(action: IdeaAgentAction): string {
  switch (action.type) {
    case 'set_problem': return `Set problem: ${action.value}`;
    case 'set_context': return `Set context: ${action.value}`;
    case 'add_user': return `Add user/use case: ${action.value}`;
    case 'add_assumption': return `Add assumption: ${action.value}`;
    case 'add_unknown': return `Add unknown: ${action.value}`;
    case 'ask_user': return `Ask: ${action.question}`;
    case 'add_finding': return `Add ${action.findingType} finding: ${action.text}`;
    case 'add_source': return `Add source: ${action.source}`;
    case 'add_existing_solution': return `Add existing solution: ${action.text}`;
    case 'add_option': return `Add option: ${action.title}`;
    case 'update_option': return `Update option "${action.title}"`;
    case 'add_validation': return `Add validation idea: ${action.value}`;
    case 'add_risk': return `Add risk to "${action.optionTitle}": ${action.value}`;
    case 'propose_decision': return `Propose decision: ${action.status} — ${action.recommendation}`;
    case 'set_recommendation': return `Set recommendation: ${action.value}`;
    case 'rewrite_final_idea': return `Rewrite final idea: ${action.value}`;
    case 'set_scope': return `Set scope: ${action.value.join('; ')}`;
    case 'set_out_of_scope': return `Set out of scope: ${action.value.join('; ')}`;
    case 'set_success_criteria': return `Set success criteria: ${action.value.join('; ')}`;
    case 'set_next_step': return `Set next step: ${action.value}`;
    case 'mark_ready': return 'Suggests this Idea is ready — open Decide to confirm.';
    default: return 'Unknown action';
  }
}
