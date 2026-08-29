import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  ProjectFoundationService,
  ShapeService,
  type PipelineConfig,
} from '../src';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-shape-')); }

function writeFoundation(rootDir: string): void {
  fs.writeFileSync(path.join(rootDir, 'AGENTS.md'), '# Agreement\n');
  fs.writeFileSync(path.join(rootDir, 'PROJECT.md'), '# Project\n');
  fs.writeFileSync(path.join(rootDir, 'STATUS.md'), '# Status\n');
  fs.writeFileSync(path.join(rootDir, 'DECISIONS.md'), '# Decisions\n');
}

const PIPELINE: PipelineConfig = {
  id: 'delivery',
  on_failure: 'stop',
  steps: [{ agent: 'planner', name: 'Plan', requires: [], produces: ['PLAN.md'], depends_on: [], human_review: true, auto_review: false, enabled: true }],
};

describe('Discovery Foundation and Shape lifecycle', () => {
  it('allows capturing a Shape before Foundation is ready but blocks readiness until context is published', () => {
    const rootDir = root();
    const foundation = new ProjectFoundationService(rootDir, () => '2026-08-24T00:00:00.000Z', () => 'commit-a');
    const shapes = new ShapeService(rootDir, { clock: () => '2026-08-24T00:00:00.000Z', foundation });
    const created = shapes.create({ title: 'Improve onboarding', problem: 'Users get lost.' });
    expect(created.foundation.revision).toBe(0);
    expect(shapes.readiness(created).ready).toBe(false);

    writeFoundation(rootDir);
    foundation.publish();
    expect(shapes.readiness(created).blockers.some((item) => /Project Foundation changed/i.test(item))).toBe(true);
    expect(foundation.inspect().status).toBe('ready');
    fs.appendFileSync(path.join(rootDir, 'DECISIONS.md'), 'Changed\n');
    expect(foundation.inspect().status).toBe('stale');
  });

  it('does not create a new Foundation revision when nothing has changed', () => {
    const rootDir = root();
    writeFoundation(rootDir);
    const foundation = new ProjectFoundationService(rootDir, () => '2026-08-24T00:00:00.000Z', () => 'commit-a');

    const first = foundation.publish();
    const repeated = foundation.publish();

    expect(first.revision).toBe(0);
    expect(repeated).toEqual(first);
    expect(foundation.inspect().foundation?.revision).toBe(0);
  });

  it('only lets a user accept a ready Shape and invalidates acceptance on edit', () => {
    const rootDir = root();
    writeFoundation(rootDir);
    const foundation = new ProjectFoundationService(rootDir, () => '2026-08-24T00:00:00.000Z', () => undefined);
    foundation.publish();
    const shapes = new ShapeService(rootDir, { clock: () => '2026-08-24T00:00:00.000Z', foundation });
    const created = shapes.create({ title: 'Improve onboarding', problem: 'Users get lost.', desiredOutcome: 'Users finish setup.', appetite: 'One cycle' });
    const patched = shapes.patch(created.id, created.revision, {
      selectedApproach: 'Add a guided checklist.',
      rationale: 'It addresses the first-session drop-off without changing account creation.',
      noGos: ['Do not redesign authentication.'],
      acceptanceCriteria: ['A new user can complete setup from the checklist.'],
    }, { kind: 'agent', id: 'discovery-agent' });
    expect(shapes.readiness(patched).ready).toBe(true);
    const ready = shapes.markReady(patched.id, patched.revision, { kind: 'agent', id: 'discovery-agent' });
    expect(() => shapes.accept(ready.id, ready.revision, { kind: 'agent', id: 'discovery-agent' })).toThrow(/human user/i);
    const accepted = shapes.accept(ready.id, ready.revision, { kind: 'user', id: 'owner' });
    expect(accepted.status).toBe('accepted');
    expect(accepted.acceptance?.acceptedRevision).toBe(accepted.revision);
    const reopened = shapes.patch(accepted.id, accepted.revision, { risks: ['Copy needs localization.'] }, { kind: 'agent', id: 'discovery-agent' });
    expect(reopened.status).toBe('exploring');
    expect(reopened.acceptance).toBeUndefined();
  });

  it('converts an accepted Shape to exactly one legacy Epic with immutable provenance', () => {
    const rootDir = root();
    writeFoundation(rootDir);
    const foundation = new ProjectFoundationService(rootDir, () => '2026-08-24T00:00:00.000Z', () => undefined);
    foundation.publish();
    const shapes = new ShapeService(rootDir, { clock: () => '2026-08-24T00:00:00.000Z', foundation });
    const created = shapes.create({ title: 'Improve onboarding', problem: 'Users get lost.', desiredOutcome: 'Users finish setup.', appetite: 'One cycle' });
    const patched = shapes.patch(created.id, created.revision, {
      selectedApproach: 'Add a guided checklist.', rationale: 'Focused and reversible.', noGos: ['Do not redesign authentication.'],
      acceptanceCriteria: ['A new user can complete setup from the checklist.'],
    }, { kind: 'agent', id: 'discovery-agent' });
    const ready = shapes.markReady(patched.id, patched.revision, { kind: 'agent', id: 'discovery-agent' });
    const accepted = shapes.accept(ready.id, ready.revision, { kind: 'user', id: 'owner' });

    const converted = shapes.convertToEpic(accepted.id, accepted.revision, {
      epicId: 'EPIC-900', doc: null, target: { kind: 'pipeline', id: PIPELINE.id }, agents: ['planner'], inputs: {}, pipeline: PIPELINE,
    }, { kind: 'user', id: 'owner' });
    expect(converted.shape.status).toBe('converted');
    const inputs = JSON.parse(fs.readFileSync(path.join(rootDir, 'docs/epics/EPIC-900/inputs.json'), 'utf8'));
    expect(inputs.source_shape.id).toBe(created.id);
    expect(inputs.source_shape.acceptance_hash).toBe(accepted.acceptance?.shapeHash);
    expect(fs.readFileSync(path.join(rootDir, 'docs/epics/EPIC-900/artifacts/SHAPE.md'), 'utf8')).toContain('Add a guided checklist.');

    const retry = shapes.convertToEpic(converted.shape.id, converted.shape.revision, {
      epicId: 'EPIC-900', doc: null, target: { kind: 'pipeline', id: PIPELINE.id }, agents: ['planner'], inputs: {}, pipeline: PIPELINE,
    }, { kind: 'user', id: 'owner' });
    expect(retry.alreadyConverted).toBe(true);
  });
});
