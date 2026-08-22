import { describe, expect, it } from 'vitest';
import {
  humanInterventionGuide,
  humanInterventionTooltip,
} from '../src/webview/components/epic-v3/human-intervention';

describe('human intervention guidance', () => {
  it('points PRD issues at the PRD', () => {
    const guide = humanInterventionGuide({ agent: 'po', stepName: 'plan', artifact: 'PRD.md' });

    expect(guide.source).toContain('PRD.md');
  });

  it('keeps implementation fixes tied to code', () => {
    const tooltip = humanInterventionTooltip({ agent: 'developer', stepName: 'implement', artifact: 'TECH-DESIGN.md' });

    expect(tooltip).toContain('Source code');
    expect(tooltip).toContain('execute-test');
  });

  it('sends failing tests back to their root cause', () => {
    const guide = humanInterventionGuide({ agent: 'qa', stepName: 'execute-test', artifact: 'TEST-REPORT.md' });

    expect(guide.source).toContain('TEST-REPORT.md');
    expect(guide.followUp).toMatch(/execute-test/i);
  });

  it('provides usable fallback advice for custom pipeline steps', () => {
    const guide = humanInterventionGuide({ agent: 'designer', stepName: 'Visual QA', artifact: 'VISUAL-QA.md' });

    expect(guide.source).toBe('VISUAL-QA.md');
    expect(guide.followUp).toContain('rerun');
  });
});
