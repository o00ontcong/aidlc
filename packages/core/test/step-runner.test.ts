import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { PipelineRunStore, StepRunner, nextEligibleStep, type Pipeline, type ActorRef } from '../src';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-step-runner-'));
}

const USER: ActorRef = { kind: 'user', id: 'cong' };

const PIPELINE: Pipeline = {
  id: 'redraw-design',
  source: 'project',
  version: '1.0.0',
  steps: [
    { id: 'design-analyzer', agent: 'design-recreator', skills: [], outputs: [], autoReview: true, humanReview: false },
    { id: 'design-recreator', agent: 'design-recreator', skills: [], outputs: [], autoReview: false, humanReview: false },
    { id: 'visual-reviewer', agent: 'design-recreator', skills: [], outputs: [], autoReview: true, humanReview: false },
    { id: 'human-review', skills: [], outputs: [], autoReview: false, humanReview: true, onReject: { rerun: 'design-recreator', withFeedback: true } },
  ],
};

describe('StepRunner — run/complete/review/reject/rerun/resume', () => {
  let store: PipelineRunStore;
  let runner: StepRunner;

  beforeEach(() => {
    store = new PipelineRunStore(tmpRoot());
    runner = new StepRunner(store);
  });

  it('starts every step awaiting-work; the first step is next eligible', () => {
    const run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    expect(run.steps.every((s) => s.status === 'awaiting-work')).toBe(true);
    expect(nextEligibleStep(PIPELINE, run)?.id).toBe('design-analyzer');
  });

  it('does not let a command bypass an earlier step or its review gate', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');

    expect(() => runner.runStep(PIPELINE, run, 'design-recreator', USER)).toThrow(/not eligible/i);
    expect(() => runner.completeStep(PIPELINE, run, 'design-analyzer', USER)).toThrow(/must be running/i);

    run = runner.runStep(PIPELINE, run, 'design-analyzer', USER);
    expect(() => runner.approve(PIPELINE, run, 'design-analyzer', USER)).toThrow(/human review/i);
    expect(() => runner.runStep(PIPELINE, run, 'visual-reviewer', USER)).toThrow(/not eligible/i);
  });

  it('runs a step, then routes through auto-review to the next step (no humanReview on this step)', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    run = runner.runStep(PIPELINE, run, 'design-analyzer', USER);
    expect(run.steps.find((s) => s.id === 'design-analyzer')?.status).toBe('running');

    run = runner.completeStep(PIPELINE, run, 'design-analyzer', USER);
    expect(run.steps.find((s) => s.id === 'design-analyzer')?.status).toBe('auto-review');

    run = runner.passAutoReview(PIPELINE, run, 'design-analyzer', USER);
    expect(run.steps.find((s) => s.id === 'design-analyzer')?.status).toBe('done');
    expect(nextEligibleStep(PIPELINE, run)?.id).toBe('design-recreator');
  });

  it('failing auto-review retries the same step with feedback and a bumped attempt', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    run = runner.runStep(PIPELINE, run, 'design-analyzer', USER);
    run = runner.completeStep(PIPELINE, run, 'design-analyzer', USER);
    run = runner.failAutoReview(PIPELINE, run, 'design-analyzer', USER, 'blurry screenshot');

    const step = run.steps.find((s) => s.id === 'design-analyzer')!;
    expect(step.status).toBe('awaiting-work');
    expect(step.feedback).toBe('blurry screenshot');
    expect(step.attempt).toBe(2);
  });

  it('a step with humanReview goes running -> human-review, then approve -> done', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    // fast-forward the first 3 steps to done
    for (const id of ['design-analyzer', 'design-recreator', 'visual-reviewer']) {
      run = runner.runStep(PIPELINE, run, id, USER);
      run = runner.completeStep(PIPELINE, run, id, USER);
      if (run.steps.find((s) => s.id === id)?.status === 'auto-review') {
        run = runner.passAutoReview(PIPELINE, run, id, USER);
      }
    }
    expect(nextEligibleStep(PIPELINE, run)?.id).toBe('human-review');

    run = runner.runStep(PIPELINE, run, 'human-review', USER);
    run = runner.completeStep(PIPELINE, run, 'human-review', USER);
    expect(run.steps.find((s) => s.id === 'human-review')?.status).toBe('human-review');

    run = runner.approve(PIPELINE, run, 'human-review', USER);
    expect(run.steps.find((s) => s.id === 'human-review')?.status).toBe('done');
    expect(nextEligibleStep(PIPELINE, run)).toBeNull();
  });

  it('rejecting human-review reruns onReject.rerun with feedback, without touching upstream done steps', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    for (const id of ['design-analyzer', 'design-recreator', 'visual-reviewer']) {
      run = runner.runStep(PIPELINE, run, id, USER);
      run = runner.completeStep(PIPELINE, run, id, USER);
      if (run.steps.find((s) => s.id === id)?.status === 'auto-review') run = runner.passAutoReview(PIPELINE, run, id, USER);
    }
    run = runner.runStep(PIPELINE, run, 'human-review', USER);
    run = runner.completeStep(PIPELINE, run, 'human-review', USER);

    run = runner.reject(PIPELINE, run, 'human-review', USER, 'colors are off');

    expect(run.steps.find((s) => s.id === 'human-review')?.status).toBe('failed');
    const rerunTarget = run.steps.find((s) => s.id === 'design-recreator')!;
    expect(rerunTarget.status).toBe('awaiting-work');
    expect(rerunTarget.feedback).toBe('colors are off');
    expect(rerunTarget.attempt).toBe(2);
    // design-analyzer (upstream, already done) is untouched
    expect(run.steps.find((s) => s.id === 'design-analyzer')?.status).toBe('done');
    expect(nextEligibleStep(PIPELINE, run)?.id).toBe('design-recreator');
  });

  it('reject requires a non-empty reason', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    run = runner.runStep(PIPELINE, run, 'design-analyzer', USER);
    expect(() => runner.reject(PIPELINE, run, 'design-analyzer', USER, '   ')).toThrow(/reason/i);
  });

  it('rerunStep bumps the run revision but keeps the same epicId/pipelineId (no new run)', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    run = runner.runStep(PIPELINE, run, 'design-analyzer', USER);
    run = runner.completeStep(PIPELINE, run, 'design-analyzer', USER);
    run = runner.passAutoReview(PIPELINE, run, 'design-analyzer', USER);
    const revisionBefore = run.revision;

    run = runner.rerunStep(PIPELINE, run, 'design-analyzer', USER, 'try again with a wider crop');

    expect(run.epicId).toBe('EPIC-001');
    expect(run.pipelineId).toBe('redraw-design');
    expect(run.revision).toBe(revisionBefore + 1);
    const step = run.steps.find((s) => s.id === 'design-analyzer')!;
    expect(step.status).toBe('awaiting-work');
    expect(step.feedback).toBe('try again with a wider crop');
    expect(step.attempt).toBe(2);
  });

  it('PipelineRunStore.listForEpic finds every pipeline the epic has run', () => {
    runner.ensureStarted(PIPELINE, 'EPIC-001');
    runner.ensureStarted({ ...PIPELINE, id: 'other-pipeline' }, 'EPIC-001');
    const runs = store.listForEpic('EPIC-001');
    expect(runs.map((r) => r.pipelineId).sort()).toEqual(['other-pipeline', 'redraw-design']);
    expect(store.listForEpic('EPIC-002')).toEqual([]);
  });

  it('resume rebuilds from the event log and reports the next eligible step — never creates a new run', () => {
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    run = runner.runStep(PIPELINE, run, 'design-analyzer', USER);

    const { run: resumed, next } = runner.resume(PIPELINE, 'EPIC-001');
    expect(resumed.epicId).toBe(run.epicId);
    expect(resumed.pipelineId).toBe(run.pipelineId);
    expect(next?.id).toBe('design-analyzer');
    expect(next?.status).toBe('running');
  });
});
