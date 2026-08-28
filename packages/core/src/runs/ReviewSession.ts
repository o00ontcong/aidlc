/**
 * Opening a Canvas gate and applying what the human decided.
 *
 * This is the seam between two halves that must not know about each other: the
 * run state machine ({@link applyArtifactReviewVerdict}) and whatever actually
 * shows the artifacts to a person. The review tool is injected as a
 * {@link ReviewTransport}, so core stays provider-neutral — annotron is one
 * implementation, a test fake is another, and neither leaks HTTP or process
 * spawning into the runner.
 *
 * ## Resume comes from determinism, not bookkeeping
 *
 * A bundle is a pure function of (declared artifacts, their content, run, step,
 * step revision, review round). Reopening a gate therefore rebuilds a
 * byte-identical bundle — so a reviewer who closed the tab, or a service that
 * restarted, can reopen and a queued verdict still binds. There is no session id
 * to lose. The converse is the useful half: if the content moved while the
 * reviewer was away, the rebuilt bundle differs, and they are shown the new
 * content instead of silently approving the old.
 */
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { normalizeStep } from '../schema/WorkspaceSchema';
import type { ReviewBundle } from './ArtifactReview';
import { buildReviewBundle } from './ArtifactReview';
import { applyArtifactReviewVerdict, PipelineRunError } from './PipelineRunner';
import { DEFAULT_EPICS_DIR } from './RunState';
import type { RunState } from './RunState';

/**
 * The verdict spellings used on the wire.
 *
 * The review transport says `request-changes`; core's state machine says
 * `request_changes`. Both are load-bearing in their own layer — the wire form is
 * part of annotron's HTTP contract, the core form matches the rest of RunState's
 * snake_case — so the mapping lives here, in exactly one place, rather than
 * being re-derived at every call site.
 */
export const CANVAS_VERDICT_WIRE = {
  approve: 'approve',
  'request-changes': 'request_changes',
} as const;

/** A verdict as the review transport reports it. */
export interface TransportVerdict {
  verdict: 'approve' | 'request-changes';
  /** Who decided, as the transport established it (e.g. git identity). */
  reviewer: string;
  at?: string;
  feedback?: string;
}

/**
 * Whatever shows the artifacts to a human and collects their decision.
 *
 * Deliberately two methods. A transport that could also *write* the artifacts,
 * or close the gate itself, would be able to defeat the thing this module exists
 * to guarantee.
 */
export interface ReviewTransport {
  /**
   * Present the bundle for review. Must be idempotent: called again for the same
   * bundle it reopens rather than starting a second gate.
   */
  open(bundle: ReviewBundle): Promise<OpenResult>;
  /** The verdict for this bundle, or `null` while the human has not decided. */
  read(bundle: ReviewBundle): Promise<TransportVerdict | null>;
}

/** What opening a gate turned up. */
export interface OpenResult {
  /**
   * A verdict that existed for an *earlier* bundle and was discarded because the
   * content has since moved.
   *
   * Reported rather than dropped, because the two situations look identical from
   * the outside and mean opposite things: "nobody has decided yet" is a wait,
   * while "you approved it and then it changed" is a decision that no longer
   * applies and needs saying out loud.
   */
  supersededVerdict?: TransportVerdict | null;
}

/** An open Canvas gate. */
export interface ReviewGate {
  bundle: ReviewBundle;
  /** Workspace-relative artifact paths, in display order. */
  paths: string[];
  /** See {@link OpenResult.supersededVerdict}. */
  supersededVerdict?: TransportVerdict | null;
}

/**
 * The step's Canvas policy, or a thrown error explaining it has none.
 *
 * Callers reach this only for steps they believe are Canvas-gated, so a missing
 * policy is a programming error worth surfacing loudly rather than a quiet
 * `null` that turns into a skipped gate.
 */
function requireCanvasPolicy(
  pipeline: PipelineConfig,
  idx: number,
  agent: string,
): { mode: 'canvas'; artifacts: string[] } {
  const config = pipeline.steps[idx];
  const review = config ? normalizeStep(config).review : undefined;
  if (!review) {
    throw new PipelineRunError(`Step "${agent}" declares no Canvas review gate — nothing to open.`);
  }
  return review;
}

/**
 * Build the bundle for a step's Canvas gate and hand it to the transport.
 *
 * Throws when the step is not at its human gate: opening a review for work
 * still in progress would show the reviewer a moving target, and any verdict
 * they gave would be refused later anyway.
 */
export async function openReviewGate(args: {
  workspaceRoot: string;
  state: RunState;
  pipeline: PipelineConfig;
  /** Step whose gate to open. Defaults to `state.currentStepIdx`. */
  stepIdx?: number;
  transport: ReviewTransport;
  epicsDir?: string;
  builtAt?: string;
}): Promise<ReviewGate> {
  const { workspaceRoot, state, pipeline, transport, epicsDir = DEFAULT_EPICS_DIR } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  if (step.status !== 'awaiting_review') {
    throw new PipelineRunError(
      `Cannot open a Canvas gate for step "${step.agent}": status is "${step.status}", expected "awaiting_review".`,
    );
  }

  const policy = requireCanvasPolicy(pipeline, idx, step.agent);

  const bundle = buildReviewBundle({
    workspaceRoot,
    runId: state.runId,
    stepIdx: idx,
    stepRevision: step.revision,
    // One round per step revision: `request_changes` rejects the step, and the
    // rerun that follows bumps the revision, which is what opens the next round.
    // Reopening within a revision must produce the same bundle so a queued
    // verdict still binds — see the note at the top of this file.
    reviewRevision: 1,
    artifacts: policy.artifacts,
    context: state.context,
    epicsDir,
    builtAt: args.builtAt,
  });

  const opened = await transport.open(bundle);
  return {
    bundle,
    paths: bundle.artifacts.map((a) => a.path),
    supersededVerdict: opened?.supersededVerdict ?? null,
  };
}

/**
 * Read the transport's verdict and apply it to run state.
 *
 * Returns `null` when the human has not decided yet, so a caller can poll
 * without distinguishing "no verdict" from an error. Everything else — the
 * staleness re-check, the gate binding, the reviewer requirement — is enforced
 * by {@link applyArtifactReviewVerdict} and deliberately not duplicated here:
 * the transport is untrusted input, and the state machine is where a decision
 * becomes real.
 */
export async function applyTransportVerdict(args: {
  workspaceRoot: string;
  state: RunState;
  pipeline: PipelineConfig;
  stepIdx?: number;
  gate: ReviewGate;
  transport: ReviewTransport;
}): Promise<RunState | null> {
  const { workspaceRoot, state, pipeline, gate, transport } = args;
  const reported = await transport.read(gate.bundle);
  if (!reported) { return null; }

  const wire = CANVAS_VERDICT_WIRE[reported.verdict];
  if (!wire) {
    throw new PipelineRunError(
      `Review transport reported an unknown verdict "${reported.verdict}" — expected "approve" or "request-changes".`,
    );
  }

  return applyArtifactReviewVerdict({
    workspaceRoot,
    state,
    pipeline,
    stepIdx: args.stepIdx,
    bundle: gate.bundle,
    verdict: {
      verdict: wire,
      reviewer: reported.reviewer,
      feedback: reported.feedback,
      at: reported.at,
    },
  });
}
