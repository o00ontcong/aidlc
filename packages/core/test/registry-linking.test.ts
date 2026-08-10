import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentStore, SkillStore, PipelineStore, RegistryValidator, type Pipeline } from '../src';

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('registry linking survives a reload (fresh store instances reading from disk)', () => {
  it('agent–skill and pipeline–agent references still resolve after reload', () => {
    const workspaceRoot = tmpRoot('aidlc-linking-ws-');
    const globalRoot = tmpRoot('aidlc-linking-global-');

    new AgentStore(workspaceRoot, globalRoot).write({
      id: 'design-recreator',
      name: 'Design Recreator',
      description: 'd',
      model: 'claude-opus-4',
      tier: 'deep',
      skills: ['figma-to-ui', 'design-system'],
      capabilities: ['figma', 'files'],
    });
    new SkillStore(workspaceRoot, globalRoot).write({ id: 'figma-to-ui', source: 'design', description: 'd', body: 'b' });
    new SkillStore(workspaceRoot, globalRoot).write({ id: 'design-system', source: 'bundled', description: 'd', body: 'b' });

    const pipeline: Pipeline = {
      id: 'redraw-design',
      source: 'project',
      version: '1.0.0',
      steps: [
        { id: 'design-analyzer', agent: 'design-recreator', skills: ['figma-to-ui'], outputs: [], autoReview: true, humanReview: false },
        { id: 'human-review', skills: [], outputs: [], autoReview: false, humanReview: true },
      ],
    };
    new PipelineStore(workspaceRoot).write(pipeline);

    // Fresh instances — nothing carried over in memory, everything re-read from disk.
    const agents = new AgentStore(workspaceRoot, globalRoot);
    const skills = new SkillStore(workspaceRoot, globalRoot);
    const pipelines = new PipelineStore(workspaceRoot);
    const validator = new RegistryValidator(agents, skills, pipelines);

    const reloadedAgent = agents.read('design-recreator');
    expect(reloadedAgent?.skills).toEqual(['figma-to-ui', 'design-system']);
    expect(reloadedAgent?.skills.every((id) => skills.exists(id))).toBe(true);

    const reloadedPipeline = pipelines.read('redraw-design');
    expect(reloadedPipeline?.steps[0].agent).toBe('design-recreator');
    expect(agents.exists(reloadedPipeline!.steps[0].agent!)).toBe(true);

    expect(validator.validatePipeline(reloadedPipeline!)).toEqual([]);
  });
});
