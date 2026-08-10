import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { registryPipelineCommandId, registryPipelineCommandFile, writePipelineCommand, type Pipeline } from '../src';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-pipeline-cmd-'));
}

const PIPELINE: Pipeline = {
  id: 'redraw-design',
  source: 'project',
  version: '1.0.0',
  steps: [
    { id: 'design-analyzer', agent: 'design-recreator', skills: ['figma-to-ui', 'image-to-ui'], outputs: ['DESIGN-ANALYSIS.md'], autoReview: true, humanReview: false },
    { id: 'design-recreator', agent: 'design-recreator', skills: ['design-system', 'responsive-layout'], outputs: ['src/ui/**'], autoReview: false, humanReview: false },
    { id: 'visual-reviewer', agent: 'design-recreator', skills: ['visual-review'], outputs: ['VISUAL-DIFF.md'], autoReview: true, humanReview: false },
    { id: 'human-review', skills: [], outputs: [], autoReview: false, humanReview: true, onReject: { rerun: 'design-recreator', withFeedback: true } },
  ],
};

describe('registryPipelineCommandId / registryPipelineCommandFile', () => {
  it('names the slash command and file after the pipeline id', () => {
    expect(registryPipelineCommandId('redraw-design')).toBe('aidlc-redraw-design');
    expect(registryPipelineCommandFile('/ws', 'redraw-design')).toBe(path.join('/ws', '.claude', 'commands', 'aidlc-redraw-design.md'));
  });
});

describe('writePipelineCommand', () => {
  it('writes a runnable slash command file referencing the new registry paths', () => {
    const root = tmpRoot();
    const { written, file } = writePipelineCommand(root, PIPELINE);
    expect(written).toBe(true);
    expect(fs.existsSync(file)).toBe(true);

    const body = fs.readFileSync(file, 'utf8');
    expect(body).toContain('/aidlc-redraw-design <epic>');
    expect(body).toContain('.aidlc/epics/<epic>/state.json');
    expect(body).toContain('.claude/agents/<agent>.md');
    expect(body).toContain('.aidlc/skills/<skill>.md');
    expect(body).toContain('design-recreator');
    expect(body).toContain('human review');
  });

  it('is idempotent — does not overwrite an existing file unless asked', () => {
    const root = tmpRoot();
    writePipelineCommand(root, PIPELINE);
    const file = registryPipelineCommandFile(root, PIPELINE.id);
    fs.writeFileSync(file, 'hand-edited', 'utf8');

    const second = writePipelineCommand(root, PIPELINE);
    expect(second.written).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('hand-edited');

    const third = writePipelineCommand(root, PIPELINE, { overwrite: true });
    expect(third.written).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).not.toBe('hand-edited');
  });
});
