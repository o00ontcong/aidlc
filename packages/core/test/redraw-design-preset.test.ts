import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentStore, PipelineStore, SkillStore, applyRedrawDesignPreset } from '../src';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-redraw-preset-')); }

describe('Redraw Design preset', () => {
  it('writes its five skills, agent, and project-scoped pipeline once', () => {
    const workspace = root();
    const first = applyRedrawDesignPreset(workspace);
    expect(first.skillsWritten).toHaveLength(5);
    expect(first.agentWritten).toBe(true);
    expect(first.pipelineWritten).toBe(true);
    expect(new SkillStore(workspace).list().map((item) => item.id)).toEqual([
      'design-system', 'figma-to-ui', 'image-to-ui', 'responsive-layout', 'visual-review',
    ]);
    expect(new AgentStore(workspace).read('design-recreator')?.capabilities).toEqual(['figma', 'files', 'github', 'web']);
    expect(new PipelineStore(workspace).read('redraw-design')?.steps.map((step) => step.id)).toEqual([
      'design-analyzer', 'design-recreator', 'visual-reviewer', 'human-review',
    ]);
  });

  it('is idempotent and does not overwrite an edited project pipeline', () => {
    const workspace = root();
    applyRedrawDesignPreset(workspace);
    const pipelines = new PipelineStore(workspace);
    pipelines.write({ ...pipelines.read('redraw-design')!, version: '2.0.0' });

    expect(applyRedrawDesignPreset(workspace)).toEqual({ skillsWritten: [], agentWritten: false, pipelineWritten: false });
    expect(new PipelineStore(workspace).read('redraw-design')?.version).toBe('2.0.0');
  });
});
