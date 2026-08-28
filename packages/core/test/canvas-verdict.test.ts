/**
 * Canvas verdict as the sole approval authority (M1, Task 5).
 *
 * A step that declares `review` can only be closed by
 * {@link applyArtifactReviewVerdict}. Everything else that used to advance a
 * human gate must refuse.
 *
 * The leverage here is that `approveStep` is a chokepoint: `--auto-approve`
 * (`autoApproveStep`) and aggregate deferral (`deferReviewStep`) in the exec
 * engine both call it, as do the CLI and the extension. Refusing Canvas-gated
 * steps in that one function closes all of those paths at once, which is why
 * these tests assert the refusal there rather than at each caller.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyArtifactReviewVerdict,
  approveStep,
  auditCanvasApprovals,
  buildReviewBundle,
  canStartStep,
  markStepDone,
  PipelineRunError,
  startRun,
  type PipelineConfig,
  type ReviewBundle,
  type RunState,
} from '../src';

const PRD = 'docs/epics/{epic}/artifacts/PRD.md';
const PRD_REL = 'docs/epics/EPIC-1/artifacts/PRD.md';
const DESIGN = 'docs/epics/{epic}/artifacts/TECH-DESIGN.md';

const PIPELINE_CANVAS: PipelineConfig = {
  id: 'canvas',
  on_failure: 'stop',
  steps: [
    {
      agent: 'po',
      requires: [],
      produces: [PRD],
      human_review: true,
      auto_review: false,
      enabled: true,
      review: { mode: 'canvas', artifacts: [PRD] },
    },
    { agent: 'tech-lead', requires: [PRD], produces: [DESIGN], human_review: true, auto_review: false, enabled: true },
  ],
};

/** Same shape, but the gate is the legacy confirmation-only kind. */
const PIPELINE_LEGACY: PipelineConfig = {
  id: 'legacy',
  on_failure: 'stop',
  steps: [
    { agent: 'po', requires: [], produces: [PRD], human_review: true, auto_review: false, enabled: true },
    { agent: 'tech-lead', requires: [PRD], produces: [DESIGN], human_review: true, auto_review: false, enabled: true },
  ],
};

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-verdict-'));
});

function write(rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');
}

/** Drive a run to `awaiting_review` on step 0 with the PRD on disk. */
function atGate(pipeline: PipelineConfig): RunState {
  write(PRD_REL, '# PRD\n');
  const started = startRun({ runId: 'R-1', pipeline, context: { epic: 'EPIC-1' } });
  const state = markStepDone({ state: started, pipeline, workspaceRoot: root });
  if (state.steps[0].status !== 'awaiting_review') {
    throw new Error(`expected awaiting_review, got ${state.steps[0].status}`);
  }
  return state;
}

function bundleFor(state: RunState, over: Partial<ReviewBundle> = {}): ReviewBundle {
  return {
    ...buildReviewBundle({
      workspaceRoot: root,
      runId: state.runId,
      stepIdx: 0,
      stepRevision: state.steps[0].revision,
      reviewRevision: 1,
      artifacts: [PRD],
      context: state.context,
      builtAt: '2026-01-01T00:00:00.000Z',
    }),
    ...over,
  };
}

const REVIEWER = 'Cong <cong@example.test>';

describe('approveStep — refuses Canvas gates', () => {
  it('refuses a step that declares `review`, naming the verdict path', () => {
    const state = atGate(PIPELINE_CANVAS);
    expect(() => approveStep({ state, pipeline: PIPELINE_CANVAS })).toThrow(PipelineRunError);
    // The refusal has to be actionable — a caller must learn what to use instead.
    expect(() => approveStep({ state, pipeline: PIPELINE_CANVAS })).toThrow(
      /applyArtifactReviewVerdict/,
    );
  });

  it('still advances a legacy human_review step', () => {
    const state = atGate(PIPELINE_LEGACY);
    const next = approveStep({ state, pipeline: PIPELINE_LEGACY });
    expect(next.steps[0].status).toBe('approved');
    expect(next.currentStepIdx).toBe(1);
  });
});

describe('applyArtifactReviewVerdict — approve', () => {
  it('advances the step when the bundle is current', () => {
    const state = atGate(PIPELINE_CANVAS);
    const next = applyArtifactReviewVerdict({
      workspaceRoot: root,
      state,
      pipeline: PIPELINE_CANVAS,
      bundle: bundleFor(state),
      verdict: { verdict: 'approve', reviewer: REVIEWER },
    });

    expect(next.steps[0].status).toBe('approved');
    expect(next.currentStepIdx).toBe(1);
    expect(next.steps[1].status).toBe('awaiting_work');
  });

  it('records the verdict and the approved bundle hash on the step', () => {
    const state = atGate(PIPELINE_CANVAS);
    const bundle = bundleFor(state);
    const next = applyArtifactReviewVerdict({
      workspaceRoot: root,
      state,
      pipeline: PIPELINE_CANVAS,
      bundle,
      verdict: { verdict: 'approve', reviewer: REVIEWER, at: '2026-01-02T00:00:00.000Z' },
    });

    expect(next.steps[0].canvasReview).toMatchObject({
      verdict: 'approve',
      reviewer: REVIEWER,
      at: '2026-01-02T00:00:00.000Z',
      bundleHash: bundle.bundleHash,
      reviewRevision: 1,
    });
  });

  it('refuses when a reviewed file changed after bundling', () => {
    const state = atGate(PIPELINE_CANVAS);
    const bundle = bundleFor(state);
    write(PRD_REL, '# PRD quietly edited after review\n');

    expect(() =>
      applyArtifactReviewVerdict({
        workspaceRoot: root,
        state,
        pipeline: PIPELINE_CANVAS,
        bundle,
        verdict: { verdict: 'approve', reviewer: REVIEWER },
      }),
    ).toThrow(/stale|changed/i);
  });

  it('refuses a bundle built for another run', () => {
    const state = atGate(PIPELINE_CANVAS);
    expect(() =>
      applyArtifactReviewVerdict({
        workspaceRoot: root,
        state,
        pipeline: PIPELINE_CANVAS,
        bundle: bundleFor(state, { runId: 'R-OTHER' }),
        verdict: { verdict: 'approve', reviewer: REVIEWER },
      }),
    ).toThrow(PipelineRunError);
  });

  it('refuses a bundle built for a superseded step revision', () => {
    const state = atGate(PIPELINE_CANVAS);
    expect(() =>
      applyArtifactReviewVerdict({
        workspaceRoot: root,
        state,
        pipeline: PIPELINE_CANVAS,
        bundle: bundleFor(state, { stepRevision: 99 }),
        verdict: { verdict: 'approve', reviewer: REVIEWER },
      }),
    ).toThrow(PipelineRunError);
  });

  it('refuses a bundle pointing at a different step', () => {
    const state = atGate(PIPELINE_CANVAS);
    expect(() =>
      applyArtifactReviewVerdict({
        workspaceRoot: root,
        state,
        pipeline: PIPELINE_CANVAS,
        bundle: bundleFor(state, { stepIdx: 1 }),
        verdict: { verdict: 'approve', reviewer: REVIEWER },
      }),
    ).toThrow(PipelineRunError);
  });

  it('refuses an unidentified reviewer', () => {
    const state = atGate(PIPELINE_CANVAS);
    for (const reviewer of ['', '   ']) {
      expect(() =>
        applyArtifactReviewVerdict({
          workspaceRoot: root,
          state,
          pipeline: PIPELINE_CANVAS,
          bundle: bundleFor(state),
          verdict: { verdict: 'approve', reviewer },
        }),
      ).toThrow(/reviewer/i);
    }
  });

  it("refuses a step with no `review` policy — that is `approveStep`'s job", () => {
    const state = atGate(PIPELINE_LEGACY);
    expect(() =>
      applyArtifactReviewVerdict({
        workspaceRoot: root,
        state,
        pipeline: PIPELINE_LEGACY,
        bundle: bundleFor(state),
        verdict: { verdict: 'approve', reviewer: REVIEWER },
      }),
    ).toThrow(PipelineRunError);
  });

  it('refuses a second verdict on an already-approved step', () => {
    const state = atGate(PIPELINE_CANVAS);
    const bundle = bundleFor(state);
    const once = applyArtifactReviewVerdict({
      workspaceRoot: root,
      state,
      pipeline: PIPELINE_CANVAS,
      bundle,
      verdict: { verdict: 'approve', reviewer: REVIEWER },
    });

    // Replaying a captured verdict must not advance the run a second time.
    expect(() =>
      applyArtifactReviewVerdict({
        workspaceRoot: root,
        state: once,
        pipeline: PIPELINE_CANVAS,
        bundle,
        verdict: { verdict: 'approve', reviewer: REVIEWER },
      }),
    ).toThrow(PipelineRunError);
  });
});

describe('auditCanvasApprovals — the forged-write backstop', () => {
  /** What a provider agent writing run state directly leaves behind. */
  function forgeApproval(state: RunState): RunState {
    const forged = JSON.parse(JSON.stringify(state)) as RunState;
    forged.steps[0].status = 'approved';
    forged.currentStepIdx = 1;
    forged.steps[1].status = 'awaiting_work';
    return forged;
  }

  it('flags an approved Canvas step with no verdict', () => {
    const issues = auditCanvasApprovals(forgeApproval(atGate(PIPELINE_CANVAS)), PIPELINE_CANVAS);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ stepIdx: 0, agent: 'po', reason: 'missing-verdict' });
  });

  it('flags an approved step whose recorded verdict was not an approval', () => {
    const forged = forgeApproval(atGate(PIPELINE_CANVAS));
    forged.steps[0].canvasReview = {
      verdict: 'request_changes',
      reviewer: REVIEWER,
      at: '2026-01-01T00:00:00.000Z',
      bundleHash: `sha256:${'0'.repeat(64)}`,
      reviewRevision: 1,
    };

    expect(auditCanvasApprovals(forged, PIPELINE_CANVAS)[0]).toMatchObject({
      reason: 'not-approved',
    });
  });

  it('says nothing about a legitimately approved Canvas step', () => {
    const state = atGate(PIPELINE_CANVAS);
    const approved = applyArtifactReviewVerdict({
      workspaceRoot: root,
      state,
      pipeline: PIPELINE_CANVAS,
      bundle: bundleFor(state),
      verdict: { verdict: 'approve', reviewer: REVIEWER },
    });

    expect(auditCanvasApprovals(approved, PIPELINE_CANVAS)).toEqual([]);
  });

  it('says nothing about a legacy step approved before any Canvas policy', () => {
    // The run's own snapshot is what makes this safe: a step approved under a
    // pipeline that had no `review` is not forged just because the preset later
    // grew one. Auditing against the run's pipeline rather than the workspace's
    // is the whole reason this produces no false positives on upgrade.
    const state = atGate(PIPELINE_LEGACY);
    const approved = approveStep({ state, pipeline: PIPELINE_LEGACY });

    expect(auditCanvasApprovals(approved, PIPELINE_LEGACY)).toEqual([]);
  });

  it('stops the next step from starting on a forged approval', () => {
    // Detection cannot undo a write that already happened. Refusing to build on
    // it is the part that still protects the run.
    const forged = forgeApproval(atGate(PIPELINE_CANVAS));
    const verdict = canStartStep({
      state: forged,
      pipeline: PIPELINE_CANVAS,
      workspaceRoot: root,
      stepIdx: 1,
    });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.missing.join(' ')).toMatch(/unapproved Canvas gate/);
    }
  });
});

describe('applyArtifactReviewVerdict — request_changes', () => {
  it('requires feedback', () => {
    const state = atGate(PIPELINE_CANVAS);
    expect(() =>
      applyArtifactReviewVerdict({
        workspaceRoot: root,
        state,
        pipeline: PIPELINE_CANVAS,
        bundle: bundleFor(state),
        verdict: { verdict: 'request_changes', reviewer: REVIEWER },
      }),
    ).toThrow(/feedback/i);
  });

  it('rejects the step and carries the feedback as the reason', () => {
    const state = atGate(PIPELINE_CANVAS);
    const next = applyArtifactReviewVerdict({
      workspaceRoot: root,
      state,
      pipeline: PIPELINE_CANVAS,
      bundle: bundleFor(state),
      verdict: {
        verdict: 'request_changes',
        reviewer: REVIEWER,
        feedback: 'Acceptance criteria 3 is not testable.',
      },
    });

    expect(next.steps[0].status).toBe('rejected');
    expect(next.steps[0].rejectReason).toContain('Acceptance criteria 3');
    expect(next.currentStepIdx).toBe(0); // stays on the step
  });

  it('records the verdict even though the step did not advance', () => {
    const state = atGate(PIPELINE_CANVAS);
    const next = applyArtifactReviewVerdict({
      workspaceRoot: root,
      state,
      pipeline: PIPELINE_CANVAS,
      bundle: bundleFor(state),
      verdict: { verdict: 'request_changes', reviewer: REVIEWER, feedback: 'Needs a rollback plan.' },
    });

    expect(next.steps[0].canvasReview).toMatchObject({
      verdict: 'request_changes',
      reviewer: REVIEWER,
      feedback: 'Needs a rollback plan.',
    });
  });

  it('does not require the bundle to still be current', () => {
    // Asking for changes on content that has since moved on is harmless — only
    // an approval has to be bound to exactly what was seen.
    const state = atGate(PIPELINE_CANVAS);
    const bundle = bundleFor(state);
    write(PRD_REL, '# PRD already being reworked\n');

    const next = applyArtifactReviewVerdict({
      workspaceRoot: root,
      state,
      pipeline: PIPELINE_CANVAS,
      bundle,
      verdict: { verdict: 'request_changes', reviewer: REVIEWER, feedback: 'Split section 2.' },
    });
    expect(next.steps[0].status).toBe('rejected');
  });
});
