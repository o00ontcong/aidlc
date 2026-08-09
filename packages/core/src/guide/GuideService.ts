import { STAGE_IDS, type AidlcError, type Epic, type NextAction, type StageId } from '../contracts';
import { nextActionForEpic } from '../epic';

export interface GuideMetadata { why: string; inputs: string[]; outputs: string[]; doneWhen: string; next: string; recovery: string[]; }
export const CANONICAL_STAGE_GUIDE: Record<StageId, GuideMetadata> = {
  understand: { why: 'Establish scope and evidence before mutation.', inputs: ['requirement', 'project context'], outputs: ['acceptance criteria'], doneWhen: 'Scope is understood.', next: 'Plan the solution.', recovery: ['Clarify the requirement.'] },
  plan: { why: 'Choose a safe executable solution.', inputs: ['scope'], outputs: ['plan'], doneWhen: 'Plan is reviewable.', next: 'Build the change.', recovery: ['Revise the plan.'] },
  build: { why: 'Implement the approved change.', inputs: ['plan'], outputs: ['code and artifacts'], doneWhen: 'Implementation is complete.', next: 'Verify evidence.', recovery: ['Repair and retry.'] },
  verify: { why: 'Prove the change is correct.', inputs: ['implementation'], outputs: ['test and review evidence'], doneWhen: 'Evidence passes.', next: 'Ship approved artifacts.', recovery: ['Request changes.'] },
  ship: { why: 'Hand over only approved changes.', inputs: ['approved evidence'], outputs: ['commit or approved external action'], doneWhen: 'Ship action is complete.', next: 'Complete Epic.', recovery: ['Review gate decision.'] },
};
export class GuideService {
  metadata(stage: StageId): GuideMetadata { return CANONICAL_STAGE_GUIDE[stage]; }
  explain(stage: StageId): GuideMetadata { return this.metadata(stage); }
  next(epic: Epic): NextAction | undefined { return nextActionForEpic(epic); }
  whyBlocked(error: AidlcError): { summary: string; detail?: string; recovery: AidlcError['recoveryActions'] } { return { summary: error.summary, detail: error.detail, recovery: error.recoveryActions }; }
  doctor(): Array<{ id: string; ok: boolean; message: string }> { return [{ id: 'guide.canonical-stages', ok: STAGE_IDS.every((stage) => Boolean(CANONICAL_STAGE_GUIDE[stage])), message: 'Canonical stage help is available.' }]; }
  preview(stage: StageId): { stage: StageId; mutation: false; guide: GuideMetadata } { return { stage, mutation: false, guide: this.metadata(stage) }; }
}
