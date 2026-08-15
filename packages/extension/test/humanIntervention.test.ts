import { describe, expect, it } from 'vitest';
import {
  humanInterventionGuide,
  humanInterventionTooltip,
} from '../src/webview/components/epic-v3/human-intervention';

describe('human intervention guidance', () => {
  it('points product-scope issues at the specification source', () => {
    const guide = humanInterventionGuide({ agent: 'cohesive-feature-agent', stepName: 'clarify', artifact: 'SPEC.md' });

    expect(guide.source).toContain('SPEC.md');
    expect(guide.fixAt).toContain('Clarifications');
    expect(guide.followUp).toContain('clarify');
  });

  it('keeps implementation fixes tied to code and required downstream checks', () => {
    const tooltip = humanInterventionTooltip({ agent: 'cohesive-feature-agent', stepName: 'implement', artifact: 'IMPLEMENTATION-SUMMARY.md' });

    expect(tooltip).toContain('Source code');
    expect(tooltip).toContain('cohesion-review');
    expect(tooltip).toContain('system-test');
  });

  it('provides usable fallback advice for custom pipeline steps', () => {
    const guide = humanInterventionGuide({ agent: 'designer', stepName: 'Visual QA', artifact: 'VISUAL-QA.md' });

    expect(guide.source).toBe('VISUAL-QA.md');
    expect(guide.followUp).toContain('rerun');
  });
});
