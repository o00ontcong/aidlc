import { describe, expect, it } from 'vitest';
import {
  generatedCofofoWorkspace,
  isRogueCofofoPipelineId,
  pruneRogueCofofoPipelines,
  removeRogueCofofoPipelinesFromWorkspace,
  resolveCofofoPipelineId,
} from '../src';

describe('rogue CoFoFo pipelines', () => {
  it('allows only the three canonical pipelines', () => {
    expect(isRogueCofofoPipelineId('cofofo-foundation')).toBe(false);
    expect(isRogueCofofoPipelineId('cofofo-feature')).toBe(false);
    expect(isRogueCofofoPipelineId('cofofo-bugfix')).toBe(false);
    expect(isRogueCofofoPipelineId('cofofo-delivery')).toBe(true);
    expect(isRogueCofofoPipelineId('cofofo-bootstrap')).toBe(true);
    expect(isRogueCofofoPipelineId('PASS-1087')).toBe(false);
  });

  it('prunes legacy delivery / recipe ids pasted as pipelines', () => {
    const { kept, removed } = pruneRogueCofofoPipelines([
      { id: 'otenpass-workflow' },
      { id: 'cofofo-foundation' },
      { id: 'cofofo-feature' },
      { id: 'cofofo-bugfix' },
      { id: 'cofofo-delivery' },
      { id: 'PASS-1087' },
    ]);
    expect(removed.map((p) => p.id)).toEqual(['cofofo-delivery']);
    expect(kept.map((p) => p.id)).toEqual([
      'otenpass-workflow', 'cofofo-foundation', 'cofofo-feature', 'cofofo-bugfix', 'PASS-1087',
    ]);
  });

  it('removeRogueCofofoPipelinesFromWorkspace mutates the doc', () => {
    const doc = {
      pipelines: [
        { id: 'cofofo-foundation' },
        { id: 'cofofo-delivery' },
        { id: 'cofofo-bootstrap' },
      ],
    };
    expect(removeRogueCofofoPipelinesFromWorkspace(doc)).toEqual([
      'cofofo-delivery', 'cofofo-bootstrap',
    ]);
    expect(doc.pipelines.map((p) => p.id)).toEqual(['cofofo-foundation']);
  });

  it('resolveCofofoPipelineId maps legacy aliases', () => {
    expect(resolveCofofoPipelineId('cofofo-feature')).toBe('cofofo-feature');
    expect(resolveCofofoPipelineId('cofofo-bootstrap')).toBe('cofofo-foundation');
    expect(resolveCofofoPipelineId('cofofo-delivery')).toBe('cofofo-feature');
    expect(resolveCofofoPipelineId('nope')).toBeNull();
  });

  it('generatedCofofoWorkspace exposes exactly three cofofo pipelines and no cofofo recipes', () => {
    const config = generatedCofofoWorkspace({ version: '1.0', name: 't', environment: {} });
    const cofofo = config.pipelines.filter((p) => p.id.startsWith('cofofo-')).map((p) => p.id).sort();
    expect(cofofo).toEqual(['cofofo-bugfix', 'cofofo-feature', 'cofofo-foundation']);
    expect((config.recipes ?? []).filter((r) => r.id.startsWith('cofofo-'))).toEqual([]);
    expect(config.pipelines.find((p) => p.id === 'cofofo-feature')?.foundation?.mode).toBe('cofofo');
    expect(config.pipelines.find((p) => p.id === 'cofofo-bugfix')?.foundation?.mode).toBe('cofofo');
  });
});
