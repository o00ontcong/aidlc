import { describe, expect, it } from 'vitest';
import {
  getBuiltinStepHelp,
  renderBuiltinStepHelpMarkdown,
  getBuiltinWorkflow,
} from '../src/presets/builtinWorkflows';

describe('builtin step help', () => {
  it('resolves project-context define-charter help', () => {
    const help = getBuiltinStepHelp('project-context', 'define-charter');
    expect(help).toBeDefined();
    expect(help!.slashCommand).toBe('/project-context-define-charter');
    expect(help!.nextPhaseId).toBe('scan-project');
    expect(help!.produces.some((p) => p.includes('CHARTER.json'))).toBe(true);
  });

  it('resolves project-context scan-project help', () => {
    const help = getBuiltinStepHelp('project-context', 'scan-project');
    expect(help).toBeDefined();
    expect(help!.slashCommand).toBe('/project-context-scan-project');
    expect(help!.model).toContain('claude');
    expect(help!.produces.some((p) => p.includes('PROJECT-SCAN.md'))).toBe(true);
    expect(help!.nextPhaseId).toBe('model-project');
    expect(help!.acceptanceCriteria.length).toBeGreaterThan(0);
  });

  it('renders markdown with command, agent, model, I/O, acceptance', () => {
    const help = getBuiltinStepHelp('project-context', 'scan-project')!;
    const md = renderBuiltinStepHelpMarkdown(help);
    expect(md).toContain('# Step help: Scan Project');
    expect(md).toContain('/project-context-scan-project');
    expect(md).toContain('## Model');
    expect(md).toContain('## Required inputs');
    expect(md).toContain('## Expected outputs');
    expect(md).toContain('## Acceptance criteria');
    expect(md).toContain('## Repository Structure');
  });

  it('renders define-charter Mode A interview steps in help markdown', () => {
    const help = getBuiltinStepHelp('project-context', 'define-charter')!;
    const md = renderBuiltinStepHelpMarkdown(help);
    expect(md).toContain('one question at a time');
    expect(md).toContain('CHARTER-DISCOVERY.md');
    expect(md).toContain('/project-context-define-charter');
  });

  it('cohesive-delivery ships a user guide path', () => {
    expect(getBuiltinWorkflow('cohesive-delivery')?.guide).toBe(
      'media/guides/cohesive-delivery.md',
    );
  });
});
