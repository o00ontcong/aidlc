import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscoverService,
  getPhase,
  listPhases,
  renderBootstrapIntent,
  renderPhaseIntent,
  suggestRecipeForPhase,
  DOC_ARCHITECTURE,
  DOC_FEATURES,
  DOC_IMPLEMENTATION_PLAN,
  DOC_PRODUCT,
  DOC_REQUIREMENTS,
  DOC_SKELETON,
  DOC_TECH_STACK,
  type ActorRef,
} from '../src';

const USER: ActorRef = { kind: 'user', id: 'test' };
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }); }
});

function blueprint(): DiscoverService {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-discover-handoff-'));
  roots.push(root);
  const service = new DiscoverService(root);
  service.init({ seedSentence: 'App xem video 2 subtitle.', actor: USER });
  service.applyOps(DOC_PRODUCT, [
    { op: 'setProse', section: 'problem', value: 'Không so được hai bản dịch cùng lúc.' },
    { op: 'setProse', section: 'value', value: 'Hai subtitle song song.' },
  ], { actor: USER });
  service.applyOps(DOC_REQUIREMENTS, [
    { op: 'addItem', section: 'functional', text: 'Mở video local.' },
    { op: 'addItem', section: 'functional', text: 'Nạp subtitle #1.' },
  ], { actor: USER });
  service.applyOps(DOC_FEATURES, [
    { op: 'addItem', section: 'features', group: 'video', text: 'Phát video — FR-01.' },
  ], { actor: USER });
  service.applyOps(DOC_ARCHITECTURE, [
    { op: 'addItem', section: 'layers', text: 'Presentation' },
    { op: 'addItem', section: 'layers', text: 'Domain' },
    { op: 'setProse', section: 'rationale', value: 'Ít tầng nhất cho một app một màn hình.' },
  ], { actor: USER });
  service.applyOps(DOC_TECH_STACK, [
    { op: 'addRecord', section: 'stack', title: 'Language', fields: [{ label: 'Choice', value: 'Swift' }, { label: 'Why', value: 'Nền tảng iOS.' }] },
  ], { actor: USER });
  service.applyOps(DOC_IMPLEMENTATION_PLAN, [
    {
      op: 'addRecord', section: 'phases', title: 'Project skeleton',
      fields: [
        { label: 'Goal', value: 'Dựng khung project và DI container.' },
        { label: 'Deliverables', items: ['Cây thư mục theo PROJECT_STRUCTURE.md', 'DI container rỗng'] },
        { label: 'Definition of done', items: ['App build được và chạy màn hình trắng'] },
      ],
    },
    {
      op: 'addRecord', section: 'phases', title: 'Video playback',
      fields: [
        { label: 'Goal', value: 'Mở và phát video local.' },
        { label: 'Depends on', items: ['PH-01'] },
        { label: 'Deliverables', items: ['Player hiển thị video — FR-01, F-VIDEO-01'] },
      ],
    },
  ], { actor: USER });
  return service;
}

describe('Discover phases', () => {
  it('reads phases out of the Implementation Plan with their citations resolved', () => {
    const service = blueprint();
    const phases = listPhases(service.readBlueprint());
    expect(phases.map((p) => p.id)).toEqual(['PH-01', 'PH-02']);

    const second = phases[1]!;
    expect(second.title).toBe('Video playback');
    expect(second.goal).toBe('Mở và phát video local.');
    expect(second.dependsOn).toEqual(['PH-01']);
    expect(second.cites.map((c) => c.id)).toEqual(['FR-01', 'F-VIDEO-01']);
    expect(second.cites[0]!.text).toBe('Mở video local.');
    expect(second.cites[0]!.file).toBe(DOC_REQUIREMENTS);
  });

  it('suggests a delivery recipe — feature by default, never a foundation lifecycle route', () => {
    const phases = listPhases(blueprint().readBlueprint());
    expect(suggestRecipeForPhase(phases[0]!, true)).toBe('cofofo-feature');
    expect(suggestRecipeForPhase(phases[1]!, false)).toBe('cofofo-feature');
    expect(suggestRecipeForPhase({
      ...phases[1]!,
      title: 'Nền tảng phiên và hạ tầng network',
      goal: 'Session + network.',
    })).toBe('cofofo-feature');
    expect(suggestRecipeForPhase({
      ...phases[1]!,
      title: 'Sửa lỗi MFA timeout',
      goal: 'Fix bug đăng nhập.',
    })).toBe('cofofo-bugfix');
  });
});

describe('renderPhaseIntent', () => {
  it('carries the phase plus the context an implementer cannot work without', () => {
    const service = blueprint();
    const ctx = service.readBlueprint();
    const intent = renderPhaseIntent(ctx, service.require(), getPhase(ctx, 'PH-02')!);

    expect(intent).toContain('# PH-02 · Video playback');
    expect(intent).toContain('- **Phase:** PH-02 of 2');
    expect(intent).toContain('## Goal\n\nMở và phát video local.');
    expect(intent).toContain('- Player hiển thị video — FR-01, F-VIDEO-01');
    expect(intent).toContain('## Depends on\n\n- PH-01 — Project skeleton');
    // Cited entries are resolved so the epic does not have to open the docs.
    expect(intent).toContain('- **FR-01** — Mở video local.');
    expect(intent).toContain('## Product context');
    expect(intent).toContain('Ít tầng nhất cho một app một màn hình.');
    expect(intent).toContain('**TECH-01** — Language (Choice: Swift · Why: Nền tảng iOS.)');
    expect(intent).toContain('_Snapshot taken when this epic was created.');
  });

  it('does not invent sections for documents that are still empty', () => {
    const service = new DiscoverService(fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-discover-thin-')));
    roots.push(service.workspaceRoot);
    service.init({ seedSentence: 'Một ý tưởng.', actor: USER });
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      { op: 'addRecord', section: 'phases', title: 'Chỉ có mỗi phase này', fields: [{ label: 'Goal', value: 'Làm gì đó.' }] },
    ], { actor: USER });
    const ctx = service.readBlueprint();
    const intent = renderPhaseIntent(ctx, service.require(), getPhase(ctx, 'PH-01')!);

    expect(intent).toContain('## Goal');
    expect(intent).not.toContain('## Architecture');
    expect(intent).not.toContain('## Tech stack');
    expect(intent).toContain('## Deliverables\n\n_(none)_');
  });
});

describe('renderBootstrapIntent', () => {
  it('snapshots skeleton + stack from Discover instead of saying the project is empty', () => {
    const service = blueprint();
    service.applyOps(DOC_SKELETON, [
      { op: 'addItem', section: 'files', text: '`App/Sources/App.swift` — entry' },
    ], { actor: USER });
    const ctx = service.readBlueprint();
    const intent = renderBootstrapIntent(ctx, service.require(), {
      missingPaths: ['App/Sources/App.swift'],
      foundationReady: false,
    });

    expect(intent).toContain('# Generate Skeleton & CoFoFo Foundation');
    expect(intent).toContain('## Skeleton (plans/SKELETON.md)');
    expect(intent).toContain('App/Sources/App.swift');
    expect(intent).toContain('**TECH-01** — Language (Choice: Swift · Why: Nền tảng iOS.)');
    expect(intent).toContain('this epic creates them');
    expect(intent).toContain('It is not a Discover failure.');
    expect(intent).not.toMatch(/Project chưa có skeleton hoặc CoFoFo foundation chưa sẵn sàng/);
  });
});

describe('handoff bookkeeping', () => {
  it('records where a phase went and refuses to hand it off twice', () => {
    const service = blueprint();
    service.recordHandoff({ phaseId: 'PH-01', epicId: 'EPIC-001', recipeId: 'cofofo-bootstrap', title: 'PH-01 — Project skeleton' });

    expect(service.handoffFor('PH-01')?.epicId).toBe('EPIC-001');
    expect(service.handoffFor('PH-02')).toBeUndefined();
    expect(() => service.recordHandoff({ phaseId: 'PH-01', epicId: 'EPIC-002', recipeId: 'cofofo-feature', title: 'again' }))
      .toThrow(/already been handed off to EPIC-001/);
  });
});
