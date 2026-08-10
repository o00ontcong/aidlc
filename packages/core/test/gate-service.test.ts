import { describe, it, expect } from 'vitest';

import {
  GateService,
  StepRunner,
  PipelineRunStore,
  type Pipeline,
  type ActorRef,
  EpicService,
} from '../src';
import { parsePipeline } from '../src/contracts/registry';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const USER: ActorRef = { kind: 'user', id: 'cong' };

describe('Hard gate cannot be configured to skip human review (IMPLEMENT.md §2 step 5)', () => {
  it('rejects a step with a hard gate and humanReview: false at parse time', () => {
    const bad = {
      id: 'redraw-design',
      source: 'project' as const,
      version: '1.0.0',
      steps: [
        { id: 'ship', gate: 'merge_default_branch', humanReview: false, skills: [], outputs: [], autoReview: false },
      ],
    };
    expect(() => parsePipeline(bad)).toThrow(/humanReview/);
  });

  it('accepts the same step once humanReview: true', () => {
    const ok = {
      id: 'redraw-design',
      source: 'project' as const,
      version: '1.0.0',
      steps: [
        { id: 'ship', gate: 'merge_default_branch', humanReview: true, skills: [], outputs: [], autoReview: false },
      ],
    };
    expect(() => parsePipeline(ok)).not.toThrow();
  });

  it('a non-hard, project-defined gate does not require humanReview', () => {
    const ok = {
      id: 'redraw-design',
      source: 'project' as const,
      version: '1.0.0',
      steps: [
        { id: 'lint', gate: 'style_check', humanReview: false, skills: [], outputs: [], autoReview: true },
      ],
    };
    expect(() => parsePipeline(ok)).not.toThrow();
  });
});

describe('GateService', () => {
  const PIPELINE: Pipeline = parsePipeline({
    id: 'redraw-design',
    source: 'project',
    version: '1.0.0',
    steps: [
      { id: 'build', skills: [], outputs: [], autoReview: false, humanReview: false },
      { id: 'ship', gate: 'merge_default_branch', humanReview: true, skills: [], outputs: [] },
    ],
  });

  function harness() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-gate-service-'));
    const store = new PipelineRunStore(root);
    const runner = new StepRunner(store);
    const gates = new GateService(runner);
    return { runner, gates, store };
  }

  it('isBypassable is false for a hard-gated step, true otherwise', () => {
    const { gates } = harness();
    expect(gates.isBypassable(PIPELINE, 'ship')).toBe(false);
    expect(gates.isBypassable(PIPELINE, 'build')).toBe(true);
  });

  it('approve/reject route through StepRunner, and reject still requires a reason', () => {
    const { runner, gates, store } = harness();
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    run = runner.runStep(PIPELINE, run, 'build', USER);
    run = runner.completeStep(PIPELINE, run, 'build', USER);
    run = runner.runStep(PIPELINE, run, 'ship', USER);
    run = runner.completeStep(PIPELINE, run, 'ship', USER);

    expect(gates.isAwaitingDecision(PIPELINE, run, 'ship')).toBe(true);
    expect(() => gates.reject(PIPELINE, run, 'ship', USER, '')).toThrow(/reason/i);

    run = gates.approve(PIPELINE, run, 'ship', USER);
    expect(run.steps.find((s) => s.id === 'ship')?.status).toBe('done');
  });

  it('logs a non-empty reject reason before scheduling the rerun', () => {
    const { runner, gates, store } = harness();
    let run = runner.ensureStarted(PIPELINE, 'EPIC-001');
    run = runner.runStep(PIPELINE, run, 'build', USER);
    run = runner.completeStep(PIPELINE, run, 'build', USER);
    run = runner.runStep(PIPELINE, run, 'ship', USER);
    run = runner.completeStep(PIPELINE, run, 'ship', USER);

    gates.reject(PIPELINE, run, 'ship', USER, 'Merge evidence is missing.');
    expect(store.readEvents('EPIC-001', PIPELINE.id)).toContainEqual(expect.objectContaining({
      command: 'gate.reject', detail: 'Merge evidence is missing.',
    }));
  });

  it('request transitions a running Epic to waiting-for-user and records its audit event', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-gate-epic-'));
    const epics = new EpicService(root);
    const draft = epics.create({ id: 'EPIC-001', title: 'Gate test' });
    const ready = epics.transition(draft.id, 'ready', { actor: USER, command: 'epic.prepare' });
    epics.startRun(ready.id, { workflowHash: 'test-workflow', actor: USER, stages: [] });
    const gates = new GateService(new StepRunner(new PipelineRunStore(root)), epics);

    const waiting = gates.request({
      epicId: 'EPIC-001', gate: 'external_communication', stageId: 'ship', actor: USER,
      preview: { gate: 'external_communication', destination: 'customer@example.com', contentSummary: 'Send release notes', mutationScope: ['email'] },
    });

    expect(waiting.status).toBe('waiting-for-user');
    expect(waiting.pendingGate?.preview.gate).toBe('external_communication');
    expect(epics.events(waiting.id).some((event) => event.command === 'gate.request' && event.to === 'waiting-for-user')).toBe(true);
  });
});
