import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentStore, SkillStore, PipelineStore, RegistryValidator, type Pipeline } from '../src';

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('RegistryValidator — the 4 error types (IMPLEMENT.md §2 step 2)', () => {
  let agents: AgentStore;
  let skills: SkillStore;
  let pipelines: PipelineStore;
  let validator: RegistryValidator;

  beforeEach(() => {
    const workspaceRoot = tmpRoot('aidlc-validate-ws-');
    const globalRoot = tmpRoot('aidlc-validate-global-');
    agents = new AgentStore(workspaceRoot, globalRoot);
    skills = new SkillStore(workspaceRoot, globalRoot);
    pipelines = new PipelineStore(workspaceRoot);
    validator = new RegistryValidator(agents, skills, pipelines);

    agents.write({ id: 'design-recreator', name: 'Design Recreator', description: 'd', model: 'claude-opus-4', tier: 'deep', skills: [], capabilities: [] });
    skills.write({ id: 'figma-to-ui', source: 'design', description: 'd', body: 'b' });
  });

  const validPipeline: Pipeline = {
    id: 'redraw-design',
    source: 'project',
    version: '1.0.0',
    steps: [
      { id: 'design-analyzer', agent: 'design-recreator', skills: ['figma-to-ui'], outputs: [], autoReview: true, humanReview: false },
      { id: 'human-review', skills: [], outputs: [], autoReview: false, humanReview: true },
    ],
  };

  it('1. duplicate-id — flags writing a new entity under an id that already exists', () => {
    expect(validator.checkDuplicateId('agent', 'design-recreator')).toMatchObject({ kind: 'duplicate-id' });
    expect(validator.checkDuplicateId('agent', 'brand-new-agent')).toBeNull();
  });

  it('2. missing-skill — a step references a skill that does not exist', () => {
    const pipeline: Pipeline = {
      ...validPipeline,
      steps: [{ id: 's1', skills: ['does-not-exist'], outputs: [], autoReview: false, humanReview: true }],
    };
    expect(validator.validatePipeline(pipeline)).toContainEqual(
      expect.objectContaining({ kind: 'missing-skill', ref: 'does-not-exist', stepId: 's1' }),
    );
  });

  it('3. missing-agent — a step references an agent that does not exist', () => {
    const pipeline: Pipeline = {
      ...validPipeline,
      steps: [{ id: 's1', agent: 'ghost-agent', skills: [], outputs: [], autoReview: false, humanReview: true }],
    };
    expect(validator.validatePipeline(pipeline)).toContainEqual(
      expect.objectContaining({ kind: 'missing-agent', ref: 'ghost-agent', stepId: 's1' }),
    );
  });

  it('4. no-human-review-step — a pipeline where no step has humanReview: true', () => {
    const pipeline: Pipeline = {
      ...validPipeline,
      steps: [{ id: 's1', skills: [], outputs: [], autoReview: true, humanReview: false }],
    };
    expect(validator.validatePipeline(pipeline)).toContainEqual(
      expect.objectContaining({ kind: 'no-human-review-step' }),
    );
  });

  it('a fully valid pipeline produces no issues', () => {
    expect(validator.validatePipeline(validPipeline)).toEqual([]);
  });

  it('validateAll() checks every pipeline currently on disk', () => {
    pipelines.write(validPipeline);
    expect(validator.validateAll()).toEqual([]);

    pipelines.write({ ...validPipeline, id: 'broken', steps: [{ id: 's1', agent: 'ghost', skills: [], outputs: [], autoReview: false, humanReview: true }] });
    expect(validator.validateAll()).toContainEqual(expect.objectContaining({ kind: 'missing-agent', entity: 'pipeline:broken' }));
  });
});
