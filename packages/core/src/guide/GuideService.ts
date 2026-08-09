import { STAGE_IDS, type AidlcError, type Epic, type NextAction, type RecoveryAction, type StageId } from '../contracts';
import { nextActionForEpic } from '../epic';
import type { CapabilityRegistry } from '../capabilities';
import type { ModelProviderRegistry } from '../models';

export interface GuideMetadata { why: string; inputs: string[]; outputs: string[]; doneWhen: string; next: string; recovery: string[]; }
export const CANONICAL_STAGE_GUIDE: Record<StageId, GuideMetadata> = {
  understand: { why: 'Establish scope and evidence before mutation.', inputs: ['requirement', 'project context'], outputs: ['acceptance criteria'], doneWhen: 'Scope is understood.', next: 'Plan the solution.', recovery: ['Clarify the requirement.'] },
  plan: { why: 'Choose a safe executable solution.', inputs: ['scope'], outputs: ['plan'], doneWhen: 'Plan is reviewable.', next: 'Build the change.', recovery: ['Revise the plan.'] },
  build: { why: 'Implement the approved change.', inputs: ['plan'], outputs: ['code and artifacts'], doneWhen: 'Implementation is complete.', next: 'Verify evidence.', recovery: ['Repair and retry.'] },
  verify: { why: 'Prove the change is correct.', inputs: ['implementation'], outputs: ['test and review evidence'], doneWhen: 'Evidence passes.', next: 'Ship approved artifacts.', recovery: ['Request changes.'] },
  ship: { why: 'Hand over only approved changes.', inputs: ['approved evidence'], outputs: ['commit or approved external action'], doneWhen: 'Ship action is complete.', next: 'Complete Epic.', recovery: ['Review gate decision.'] },
};

export interface GuideDiagnostic {
  id: string;
  ok: boolean;
  message: string;
}

export interface GuideDiagnosticsDependencies {
  capabilities?: CapabilityRegistry;
  models?: ModelProviderRegistry;
}

export interface GuideHelpTopic {
  id: string;
  title: string;
  summary: string;
  commands: string[];
  next?: string;
}

const HELP_TOPICS: Record<string, GuideHelpTopic> = {
  '': {
    id: 'overview',
    title: 'AIDLC command surface',
    summary: 'Run setup, analyze the project, start an Epic, then advance with next/status/resume. Every UI action maps to the same CLI/`/aidlc` command bus.',
    commands: [
      'aidlc project setup|analyze|recommend (legacy alias: project-v3)',
      'aidlc context status|refresh (legacy alias: context-v3)',
      'aidlc epic start|prepare|run|next|status|explain|resume|review|ship (legacy alias: epic-v3)',
      'aidlc gate preview|approve|reject (legacy alias: gate-v3)',
      'aidlc guide-v3 help|doctor|why-blocked',
      'aidlc artifact-v3 preview-commit',
    ],
    next: 'Start with `aidlc guide-v3 help start` or `aidlc project setup`.',
  },
  start: {
    id: 'start',
    title: 'Start an Epic safely',
    summary: 'New projects default to autonomy guide. Analyze or refresh context explicitly, create the Epic, prepare it, compile a workflow, then run with an optional mode.',
    commands: [
      'aidlc project setup',
      'aidlc project analyze',
      'aidlc context refresh --source-commit <sha>',
      'aidlc epic start [id] --title "<title>" [--profile quick|standard|parallel|regulated]',
      'aidlc epic prepare <id>',
      'aidlc epic run <id> [--mode guide|assist|auto|unattended] (legacy alias: aidlc epic-v3 run)',
      'aidlc epic next <id> (legacy alias: aidlc epic-v3 next)',
    ],
    next: 'If context looks stale, refresh explicitly before trusting recommendations.',
  },
};

export class GuideService {
  metadata(stage: StageId): GuideMetadata { return CANONICAL_STAGE_GUIDE[stage]; }
  explain(stage: StageId): GuideMetadata { return this.metadata(stage); }
  next(epic: Epic): NextAction | undefined { return nextActionForEpic(epic); }
  /**
   * A guide must never leave a person at a dead end. Terminal Epics get an
   * explicit completion message; malformed or future state values still get
   * a safe `epic.explain` fallback rather than a mutation suggestion.
   */
  nextOrFallback(epic: Epic): NextAction {
    return this.next(epic) ?? {
      summary: epic.status === 'completed'
        ? 'This Epic is complete. Inspect its evidence or create a follow-up Epic for new work.'
        : 'AIDLC cannot determine the next action from the current Epic state.',
      command: 'epic.explain',
      reason: epic.status === 'completed' ? 'Terminal Epic state.' : `Unknown or unsupported Epic state: ${String(epic.status)}.`,
    };
  }
  help(topic = ''): GuideHelpTopic {
    const key = topic.trim().toLowerCase();
    const match = HELP_TOPICS[key];
    if (!match) {
      return {
        id: 'unknown',
        title: `No help topic "${topic}"`,
        summary: 'Available topics: overview (default) and start.',
        commands: Object.keys(HELP_TOPICS).filter(Boolean).map((id) => `aidlc guide-v3 help ${id}`),
        next: 'Run `aidlc guide-v3 help` for the command overview.',
      };
    }
    return match;
  }
  whyBlocked(error: AidlcError): { summary: string; detail?: string; recovery: AidlcError['recoveryActions'] } { return { summary: error.summary, detail: error.detail, recovery: error.recoveryActions }; }
  /** Explain why an Epic is waiting or blocked, with structured recovery actions. */
  whyEpicBlocked(epic: Epic): { summary: string; detail?: string; recovery: RecoveryAction[]; nextAction?: NextAction } {
    if (epic.pendingGate) {
      const gate = epic.pendingGate.preview;
      return {
        summary: `Epic ${epic.id} is waiting for approval of gate ${gate.gate}.`,
        detail: `${gate.contentSummary}${gate.destination ? ` → ${gate.destination}` : ''}`,
        recovery: [
          { kind: 'ask-user', label: 'Preview the gate and approve or reject it explicitly.', command: 'gate.preview' },
          { kind: 'ask-user', label: 'Approve the pending gate.', command: 'gate.approve' },
        ],
        nextAction: this.next(epic),
      };
    }
    if (epic.status === 'blocked' || epic.blockedReason) {
      return {
        summary: epic.blockedReason ?? `Epic ${epic.id} is blocked.`,
        detail: `Current status: ${epic.status}.`,
        recovery: [
          { kind: 'retry', label: 'Resume after resolving the blocker.', command: 'epic.resume' },
          { kind: 'ask-user', label: 'Explain the Epic state.', command: 'epic.explain' },
        ],
        nextAction: this.next(epic),
      };
    }
    if (epic.status === 'waiting-for-user') {
      return {
        summary: `Epic ${epic.id} is waiting for a user decision.`,
        detail: 'No pending gate is attached; inspect the Epic next action and decide explicitly.',
        recovery: [
          { kind: 'ask-user', label: 'Inspect the Epic.', command: 'epic.explain' },
          { kind: 'retry', label: 'Resume when ready.', command: 'epic.resume' },
        ],
        nextAction: this.next(epic),
      };
    }
    return {
      summary: `Epic ${epic.id} is not blocked.`,
      detail: `Current status: ${epic.status}.`,
      recovery: [],
      nextAction: this.nextOrFallback(epic),
    };
  }
  doctor(): GuideDiagnostic[] { return [{ id: 'guide.canonical-stages', ok: STAGE_IDS.every((stage) => Boolean(CANONICAL_STAGE_GUIDE[stage])), message: 'Canonical stage help is available.' }]; }
  /** Cross-module, read-only diagnostics for CLI/UI help surfaces. */
  async diagnose(dependencies: GuideDiagnosticsDependencies = {}): Promise<GuideDiagnostic[]> {
    const diagnostics = this.doctor();
    if (dependencies.capabilities) {
      for (const status of await dependencies.capabilities.healthAll()) {
        diagnostics.push({
          id: `capability.${status.capabilityId}`,
          ok: status.enabled && status.healthy,
          message: status.message ?? (status.enabled && status.healthy ? 'Capability is ready.' : 'Capability is unavailable.'),
        });
      }
    }
    if (dependencies.models) {
      const providers = dependencies.models.list();
      if (!providers.length) diagnostics.push({ id: 'model.providers', ok: false, message: 'No model provider is registered.' });
      for (const provider of providers) {
        const statuses = await provider.validateConfiguration();
        if (!statuses.length) diagnostics.push({ id: `model.${provider.id}`, ok: true, message: 'Provider returned no diagnostics.' });
        for (const status of statuses) diagnostics.push({ id: `model.${provider.id}`, ok: status.ok, message: status.message });
      }
    }
    return diagnostics;
  }
  preview(stage: StageId): { stage: StageId; mutation: false; guide: GuideMetadata } { return { stage, mutation: false, guide: this.metadata(stage) }; }
}
