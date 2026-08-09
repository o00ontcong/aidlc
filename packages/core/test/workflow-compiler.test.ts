import { describe, expect, it } from 'vitest';
import { createDefaultAutonomyPolicy, type Epic, type ProjectFacts } from '../src/contracts';
import { compileWorkflow } from '../src/workflows';

const epic = (profile: Epic['profile']): Epic => ({ schemaVersion: 1, id: 'EPIC-WORKFLOW', title: 'Workflow', description: '', type: 'feature', profile, status: 'draft', autonomy: createDefaultAutonomyPolicy(), stages: [], createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z', revision: 0 });
const facts: ProjectFacts = { schemaVersion: 1, projectId: 'project', generatedAt: '2026-08-09T00:00:00.000Z', revision: 1, facts: [] };
const input = (profile: Epic['profile']) => ({ epic: epic(profile), facts, selectedCapabilities: ['ast-graph'], autonomy: createDefaultAutonomyPolicy(), pack: { id: 'sdlc-core', version: '1.0.0' } });

describe('compileWorkflow', () => {
  it('keeps a small Epic to three visible stages', () => {
    const workflow = compileWorkflow(input('quick'));
    expect(workflow.visibleStageIds).toEqual(['understand', 'build', 'verify']);
    expect(workflow.stages).toHaveLength(3);
  });
  it('keeps standard, parallel and regulated timelines to the canonical five stages', () => {
    for (const profile of ['standard', 'parallel', 'regulated'] as const) expect(compileWorkflow(input(profile)).visibleStageIds).toEqual(['understand', 'plan', 'build', 'verify', 'ship']);
    expect(compileWorkflow(input('parallel')).actions.find((action) => action.id === 'implement')?.subrun).toBe(true);
  });
  it('hashes identical compiler input deterministically', () => {
    expect(compileWorkflow(input('standard')).hash).toBe(compileWorkflow(input('standard')).hash);
  });
});
