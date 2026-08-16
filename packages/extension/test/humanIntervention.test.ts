import { describe, expect, it } from 'vitest';
import {
  humanInterventionGuide,
  humanInterventionTooltip,
} from '../src/webview/components/epic-v3/human-intervention';

describe('human intervention guidance', () => {
  it('points pack issues at MISSION.md', () => {
    const guide = humanInterventionGuide({ agent: 'feature-spike-agent', stepName: 'package-mission', artifact: 'MISSION.md' });

    expect(guide.source).toContain('MISSION.md');
  });

  it('keeps implementation fixes tied to code', () => {
    const tooltip = humanInterventionTooltip({ agent: 'feature-implement-agent', stepName: 'implement', artifact: 'IMPLEMENTATION-SUMMARY.md' });

    expect(tooltip).toContain('Source code');
    expect(tooltip).toContain('resolve-bugs');
  });

  it('keeps resolve-bugs on the same step until approval', () => {
    const guide = humanInterventionGuide({ agent: 'feature-implement-agent', stepName: 'resolve-bugs', artifact: 'BUG-FIX-LOG.md' });

    expect(guide.source).toContain('BUG-FIX-LOG.md');
    expect(guide.followUp).toMatch(/Approve/i);
  });

  it('provides usable fallback advice for custom pipeline steps', () => {
    const guide = humanInterventionGuide({ agent: 'designer', stepName: 'Visual QA', artifact: 'VISUAL-QA.md' });

    expect(guide.source).toBe('VISUAL-QA.md');
    expect(guide.followUp).toContain('rerun');
  });
});
