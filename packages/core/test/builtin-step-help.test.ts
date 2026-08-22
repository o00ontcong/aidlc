import { describe, expect, it } from 'vitest';
import {
  getBuiltinStepHelp,
  renderBuiltinStepHelpMarkdown,
  getBuiltinWorkflow,
} from '../src/presets/builtinWorkflows';

describe('builtin step help', () => {
  it('resolves aidlc-workflow plan help', () => {
    const help = getBuiltinStepHelp('aidlc-workflow-full', 'plan');
    expect(help).toBeDefined();
    expect(help!.slashCommand).toBe('/aidlc-workflow-full-plan');
    expect(help!.nextPhaseId).toBe('prototype');
    expect(help!.produces.some((p) => p.includes('PRD.md'))).toBe(true);
  });

  it('resolves aidlc-workflow implement help', () => {
    const help = getBuiltinStepHelp('aidlc-workflow-full', 'implement');
    expect(help).toBeDefined();
    expect(help!.slashCommand).toBe('/aidlc-workflow-full-implement');
    expect(help!.model).toContain('claude');
    expect(help!.acceptanceCriteria.length).toBeGreaterThanOrEqual(0);
  });

  it('renders markdown with command, agent, model, I/O, acceptance', () => {
    const help = getBuiltinStepHelp('aidlc-workflow-full', 'design')!;
    const md = renderBuiltinStepHelpMarkdown(help);
    expect(md).toContain('# Step help: Design');
    expect(md).toContain('/aidlc-workflow-full-design');
    expect(md).toContain('## Model');
    expect(md).toContain('## Required inputs');
    expect(md).toContain('## Expected outputs');
  });

  it('exposes only the AIDLC workflow as a built-in preset', () => {
    expect(getBuiltinWorkflow('aidlc-workflow')?.pipelineId).toBe('aidlc-workflow-full');
    expect(getBuiltinWorkflow('speckit-pipeline')).toBeUndefined();
    expect(getBuiltinWorkflow('project-workspace')).toBeUndefined();
  });
});
