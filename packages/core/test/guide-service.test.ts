import { expect, it } from 'vitest';
import { STAGE_IDS } from '../src/contracts';
import { GuideService } from '../src/guide';
import { CapabilityRegistry } from '../src/capabilities';
import { FakeModelProvider, ModelProviderRegistry } from '../src/models';
import { createDefaultAutonomyPolicy, type Epic } from '../src/contracts';
it('provides complete, non-mutating help for every canonical stage', () => {
  const guide = new GuideService();
  for (const stage of STAGE_IDS) expect(guide.preview(stage)).toMatchObject({ stage, mutation: false, guide: { why: expect.any(String), doneWhen: expect.any(String) } });
  expect(guide.doctor()[0].ok).toBe(true);
});

it('offers a safe fallback and aggregates capability/provider diagnostics', async () => {
  const guide = new GuideService();
  const completed: Epic = {
    schemaVersion: 1, id: 'EPIC-GUIDE', title: 'Done', description: '', type: 'feature', profile: 'quick', status: 'completed',
    autonomy: createDefaultAutonomyPolicy(), stages: [], createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z', revision: 0,
  };
  expect(guide.nextOrFallback(completed)).toMatchObject({ command: 'epic.explain' });
  const models = new ModelProviderRegistry();
  models.register(new FakeModelProvider('fake', []));
  const diagnostics = await guide.diagnose({ capabilities: new CapabilityRegistry({ 'ast-graph': false }), models });
  expect(diagnostics).toContainEqual(expect.objectContaining({ id: 'capability.ast-graph', ok: false }));
  expect(diagnostics).toContainEqual(expect.objectContaining({ id: 'model.fake' }));
});

it('exposes help topics and explains blocked Epics with recovery actions', () => {
  const guide = new GuideService();
  expect(guide.help('start').id).toBe('start');
  expect(guide.help('missing').id).toBe('unknown');
  const blocked: Epic = {
    schemaVersion: 1, id: 'EPIC-BLOCKED', title: 'Blocked', description: '', type: 'feature', profile: 'quick', status: 'blocked',
    autonomy: createDefaultAutonomyPolicy(), stages: [], blockedReason: 'Needs clarification',
    createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z', revision: 0,
  };
  expect(guide.whyEpicBlocked(blocked)).toMatchObject({
    summary: 'Needs clarification',
    recovery: expect.arrayContaining([expect.objectContaining({ command: 'epic.resume' })]),
  });
});
