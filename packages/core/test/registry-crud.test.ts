import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentStore, PipelineRunStore, PipelineStore, StepRunner, type Pipeline } from '../src';

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-registry-crud-'));

describe('registry CRUD durable stores', () => {
  it('removes a scoped agent without touching its shadowed counterpart', () => {
    const workspace = root(); const global = root();
    const agents = new AgentStore(workspace, global);
    const base = { id: 'release-manager', name: 'Global', description: 'd', model: 'm', tier: 'review' as const, skills: [], capabilities: [] };
    agents.write(base, 'global');
    agents.write({ ...base, name: 'Project' }, 'project');
    expect(agents.scopeOf(base.id)).toBe('project');
    expect(agents.remove(base.id, 'project')).toBe(true);
    expect(agents.read(base.id)?.name).toBe('Global');
    expect(agents.scopeOf(base.id)).toBe('global');
  });

  it('finds a durable active run by pipeline before a delete can be allowed', () => {
    const workspace = root();
    const pipeline: Pipeline = { id: 'release-flow', source: 'project', version: '1', steps: [{ id: 'review', skills: [], outputs: [], autoReview: false, humanReview: true }] };
    const runs = new PipelineRunStore(workspace);
    const run = new StepRunner(runs).ensureStarted(pipeline, 'EPIC-DELETE-GUARD');
    expect(runs.listForPipeline('release-flow')).toEqual([run]);
    const store = new PipelineStore(workspace);
    store.write(pipeline);
    expect(store.remove('release-flow')).toBe(true); // store is intentionally low-level; host performs the active-run guard.
  });
});
