import { describe, expect, it } from 'vitest';
import {
  getBuiltinStepHelp,
  renderBuiltinStepHelpMarkdown,
  getBuiltinWorkflow,
} from '../src/presets/builtinWorkflows';

describe('builtin step help', () => {
  it('resolves project-context establish-baseline help', () => {
    const help = getBuiltinStepHelp('project-context', 'establish-baseline');
    expect(help).toBeDefined();
    expect(help!.slashCommand).toBe('/project-context-establish-baseline');
    expect(help!.nextPhaseId).toBe('publish-context');
    expect(help!.produces.some((p) => p.includes('CHARTER.json'))).toBe(true);
  });

  it('resolves project-context publish-context help', () => {
    const help = getBuiltinStepHelp('project-context', 'publish-context');
    expect(help).toBeDefined();
    expect(help!.slashCommand).toBe('/project-context-publish-context');
    expect(help!.model).toContain('claude');
    expect(help!.produces.some((p) => p.includes('CONTEXT-MANIFEST.json'))).toBe(true);
    expect(help!.acceptanceCriteria.length).toBeGreaterThan(0);
  });

  it('renders markdown with command, agent, model, I/O, acceptance', () => {
    const help = getBuiltinStepHelp('project-context', 'publish-context')!;
    const md = renderBuiltinStepHelpMarkdown(help);
    expect(md).toContain('# Step help: Publish Context');
    expect(md).toContain('/project-context-publish-context');
    expect(md).toContain('## Model');
    expect(md).toContain('## Required inputs');
    expect(md).toContain('## Expected outputs');
    expect(md).toContain('## Acceptance criteria');
  });

  it('renders establish-baseline Mode A interview steps in help markdown', () => {
    const help = getBuiltinStepHelp('project-context', 'establish-baseline')!;
    const md = renderBuiltinStepHelpMarkdown(help);
    expect(md).toContain('one question at a time');
    expect(md).toContain('CHARTER-DISCOVERY.md');
    expect(md).toContain('/project-context-establish-baseline');
  });

  it('cohesive-delivery ships a user guide path', () => {
    expect(getBuiltinWorkflow('cohesive-delivery')?.guide).toBe(
      'media/guides/cohesive-delivery.md',
    );
  });
});
