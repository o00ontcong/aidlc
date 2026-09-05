import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectWorkService, WorkItemRevisionConflictError } from '../src';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-work-items-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }); }
});

function create(service: ProjectWorkService) {
  return service.create({
    id: 'work-add-alerts',
    title: 'Add portfolio alerts',
    type: 'feature',
    priority: 'high',
    requirement: {
      outcome: 'Users can receive an alert when a portfolio threshold is crossed.',
      acceptanceCriteria: ['An enabled alert fires once per crossing.', 'Users can disable an alert.'],
      inScope: ['Portfolio settings', 'Alert delivery'],
      outOfScope: ['Broker execution'],
      links: ['JIRA-42'],
    },
    context: {
      discoverRevision: 42,
      source: [{ path: '.', head: 'abc123', ref: 'origin/main' }],
      capturedAt: '2026-09-05T00:00:00.000Z',
    },
  });
}

describe('ProjectWorkService', () => {
  it('keeps feature requirements outside the global Discover blueprint', () => {
    const root = newRoot();
    const service = new ProjectWorkService(root, () => '2026-09-05T00:00:00.000Z');
    const item = create(service);

    expect(item).toMatchObject({
      id: 'WORK-ADD-ALERTS', type: 'feature', status: 'draft', priority: 'high',
      context: { discoverRevision: 42 },
    });
    expect(fs.existsSync(path.join(root, '.aidlc', 'work-items', 'WORK-ADD-ALERTS.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs', 'product', 'REQUIREMENTS.md'))).toBe(false);
  });

  it('uses optimistic concurrency and links one work item to one Epic', () => {
    const service = new ProjectWorkService(newRoot(), () => '2026-09-05T00:00:00.000Z');
    const item = create(service);
    const proposed = service.proposeImpact(item.id, { contextIds: ['FR-PORTFOLIO-04', 'M-NOTIFICATIONS-02'] }, item.revision);
    const ready = service.confirmImpact(item.id, proposed.revision);

    expect(() => service.update(item.id, { priority: 'low' }, item.revision)).toThrow(WorkItemRevisionConflictError);

    const active = service.attachEpic(item.id, 'epic-add-alerts', ready.revision);
    expect(active).toMatchObject({ epicId: 'EPIC-ADD-ALERTS', status: 'active', revision: 3 });
    expect(() => service.attachEpic(item.id, 'EPIC-OTHER', active.revision)).toThrow(/already linked/);
  });

  it('does not allow delivery before an impact is confirmed', () => {
    const service = new ProjectWorkService(newRoot(), () => '2026-09-05T00:00:00.000Z');
    const item = create(service);
    expect(() => service.attachEpic(item.id, 'EPIC-ADD-ALERTS', item.revision)).toThrow(/confirm its impact/);
    expect(() => service.confirmImpact(item.id, item.revision)).toThrow(/at least one proposed context reference/);
  });

  it('creates a narrow context patch only after delivery is linked', () => {
    const service = new ProjectWorkService(newRoot(), () => '2026-09-05T00:00:00.000Z');
    const item = create(service);
    const proposed = service.proposeImpact(item.id, { contextIds: ['FR-PORTFOLIO-04'] }, item.revision);
    const ready = service.confirmImpact(item.id, proposed.revision);
    const active = service.attachEpic(item.id, 'EPIC-ADD-ALERTS', ready.revision);
    const patched = service.proposeContextPatch(item.id, {
      contextIds: ['FR-PORTFOLIO-04'], summary: 'Add delivered portfolio-alert capability.',
    }, active.revision);
    expect(patched.contextPatch).toMatchObject({ status: 'proposed', contextIds: ['FR-PORTFOLIO-04'] });
  });

  it('supports maintenance as a first-class request type', () => {
    const service = new ProjectWorkService(newRoot(), () => '2026-09-05T00:00:00.000Z');
    const item = service.create({
      id: 'WORK-ROTATE-KEYS',
      title: 'Rotate service keys',
      type: 'maintenance',
      requirement: { outcome: 'Rotate expiring service keys without downtime.' },
    });
    expect(item.type).toBe('maintenance');
  });
});
