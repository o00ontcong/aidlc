/**
 * The seam between a Canvas gate and whatever shows it to a human.
 *
 * These tests use a fake transport, which is the point: if the orchestration
 * needed annotron to be running, the run state machine would have grown a
 * dependency on an HTTP server and a browser, and none of this would be
 * testable without one.
 *
 * The behaviour worth pinning down is that the transport is treated as
 * *untrusted input*. It reports who decided and what, and the state machine
 * still re-checks everything — so a transport that lies, or one whose verdict
 * arrives after the content moved, cannot close a gate.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyTransportVerdict,
  markStepDone,
  openReviewGate,
  PipelineRunError,
  startRun,
  type PipelineConfig,
  type ReviewBundle,
  type ReviewTransport,
  type RunState,
  type TransportVerdict,
} from '../src';

const PRD = 'docs/epics/{epic}/artifacts/PRD.md';
const PRD_REL = 'docs/epics/EPIC-1/artifacts/PRD.md';
const DESIGN = 'docs/epics/{epic}/artifacts/TECH-DESIGN.md';
const DESIGN_REL = 'docs/epics/EPIC-1/artifacts/TECH-DESIGN.md';

const CANVAS_PIPELINE: PipelineConfig = {
  id: 'canvas',
  on_failure: 'stop',
  steps: [
    {
      agent: 'po',
      requires: [],
      produces: [PRD, DESIGN],
      human_review: true,
      auto_review: false,
      enabled: true,
      review: { mode: 'canvas', artifacts: [PRD, DESIGN] },
    },
    {
      agent: 'dev',
      requires: [PRD],
      produces: ['docs/epics/{epic}/artifacts/OUT.md'],
      human_review: true,
      auto_review: false,
      enabled: true,
    },
  ],
};

const LEGACY_PIPELINE: PipelineConfig = {
  id: 'legacy',
  on_failure: 'stop',
  steps: [
    { agent: 'po', requires: [], produces: [PRD], human_review: true, auto_review: false, enabled: true },
  ],
};

const REVIEWER = 'Cong <cong@example.test>';

/** In-memory stand-in for the review window. */
class FakeTransport implements ReviewTransport {
  opened: ReviewBundle[] = [];
  verdict: TransportVerdict | null = null;

  async open(bundle: ReviewBundle): Promise<void> {
    this.opened.push(bundle);
  }

  async read(): Promise<TransportVerdict | null> {
    return this.verdict;
  }
}

let root: string;
let transport: FakeTransport;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-session-'));
  transport = new FakeTransport();
});

function write(rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');
}

/** Drive a run to `awaiting_review` on step 0 with both artifacts on disk. */
function atGate(pipeline: PipelineConfig = CANVAS_PIPELINE): RunState {
  write(PRD_REL, '# PRD\n');
  write(DESIGN_REL, '# Design\n');
  const started = startRun({ runId: 'R-1', pipeline, context: { epic: 'EPIC-1' } });
  return markStepDone({ state: started, pipeline, workspaceRoot: root });
}

describe('openReviewGate', () => {
  it('hands the transport a bundle covering every declared artifact', async () => {
    const gate = await openReviewGate({
      workspaceRoot: root,
      state: atGate(),
      pipeline: CANVAS_PIPELINE,
      transport,
    });

    expect(transport.opened).toHaveLength(1);
    expect(gate.paths).toEqual([PRD_REL, DESIGN_REL]);
    expect(gate.bundle.runId).toBe('R-1');
    expect(gate.bundle.stepIdx).toBe(0);
    expect(gate.bundle.stepRevision).toBe(1);
  });

  it('rebuilds an identical bundle on reopen, so a queued verdict still binds', async () => {
    // This is what makes resume work with no session id to lose: a reviewer who
    // closed the tab, or a service that restarted, reopens the same gate.
    const state = atGate();
    const first = await openReviewGate({
      workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, transport,
      builtAt: '2026-01-01T00:00:00.000Z',
    });
    const again = await openReviewGate({
      workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, transport,
      builtAt: '2026-06-30T12:00:00.000Z',
    });

    expect(again.bundle.bundleHash).toBe(first.bundle.bundleHash);
  });

  it('shows the new content when it moved while the reviewer was away', async () => {
    const state = atGate();
    const before = await openReviewGate({ workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, transport });

    write(PRD_REL, '# PRD, reworked\n');
    const after = await openReviewGate({ workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, transport });

    expect(after.bundle.bundleHash).not.toBe(before.bundle.bundleHash);
  });

  it('refuses a step that is not at its human gate', async () => {
    write(PRD_REL, '# PRD\n');
    write(DESIGN_REL, '# Design\n');
    const started = startRun({ runId: 'R-1', pipeline: CANVAS_PIPELINE, context: { epic: 'EPIC-1' } });
    // Still awaiting_work — opening a review here would show a moving target.
    await expect(
      openReviewGate({ workspaceRoot: root, state: started, pipeline: CANVAS_PIPELINE, transport }),
    ).rejects.toThrow(PipelineRunError);
  });

  it('refuses a step with no Canvas policy rather than opening an empty gate', async () => {
    await expect(
      openReviewGate({
        workspaceRoot: root,
        state: atGate(LEGACY_PIPELINE),
        pipeline: LEGACY_PIPELINE,
        transport,
      }),
    ).rejects.toThrow(/no Canvas review gate/i);
  });
});

describe('applyTransportVerdict', () => {
  const gateFor = (state: RunState) =>
    openReviewGate({ workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, transport });

  it('returns null while the human has not decided', async () => {
    const state = atGate();
    const gate = await gateFor(state);

    expect(
      await applyTransportVerdict({ workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, gate, transport }),
    ).toBeNull();
  });

  it('applies an approval and advances the run', async () => {
    const state = atGate();
    const gate = await gateFor(state);
    transport.verdict = { verdict: 'approve', reviewer: REVIEWER, at: '2026-01-02T00:00:00.000Z' };

    const next = await applyTransportVerdict({
      workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, gate, transport,
    });

    expect(next?.steps[0].status).toBe('approved');
    expect(next?.steps[0].canvasReview).toMatchObject({
      verdict: 'approve',
      reviewer: REVIEWER,
      bundleHash: gate.bundle.bundleHash,
    });
    expect(next?.currentStepIdx).toBe(1);
  });

  it("translates the wire spelling to the state machine's", async () => {
    const state = atGate();
    const gate = await gateFor(state);
    // Transport says `request-changes`; RunState records `request_changes`.
    transport.verdict = { verdict: 'request-changes', reviewer: REVIEWER, feedback: 'AC 2 is not testable.' };

    const next = await applyTransportVerdict({
      workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, gate, transport,
    });

    expect(next?.steps[0].status).toBe('rejected');
    expect(next?.steps[0].canvasReview?.verdict).toBe('request_changes');
    expect(next?.steps[0].rejectReason).toContain('AC 2');
  });

  it('refuses an approval whose content moved after the reviewer saw it', async () => {
    // The transport is untrusted input: it can report an approval, but the state
    // machine re-hashes and refuses one covering bytes nobody reviewed.
    const state = atGate();
    const gate = await gateFor(state);
    write(DESIGN_REL, '# Design, quietly edited\n');
    transport.verdict = { verdict: 'approve', reviewer: REVIEWER };

    await expect(
      applyTransportVerdict({ workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, gate, transport }),
    ).rejects.toThrow(/stale/i);
  });

  it('refuses an approval the transport reports with no reviewer', async () => {
    const state = atGate();
    const gate = await gateFor(state);
    transport.verdict = { verdict: 'approve', reviewer: '  ' };

    await expect(
      applyTransportVerdict({ workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, gate, transport }),
    ).rejects.toThrow(/reviewer/i);
  });

  it('refuses a verdict spelling it does not recognise', async () => {
    const state = atGate();
    const gate = await gateFor(state);
    transport.verdict = { verdict: 'approved' as TransportVerdict['verdict'], reviewer: REVIEWER };

    await expect(
      applyTransportVerdict({ workspaceRoot: root, state, pipeline: CANVAS_PIPELINE, gate, transport }),
    ).rejects.toThrow(/unknown verdict/i);
  });
});
