import { describe, expect, it } from 'vitest';

import { consolidateCanvasFeedback } from '../src/v2/canvasFeedback';

describe('consolidateCanvasFeedback', () => {
  it('keeps comment ids and tells the agent to resolve applied comments in the sidecar', () => {
    const out = consolidateCanvasFeedback([
      'Reviewer feedback collected in the Canvas.',
      'Only comments with status other than resolved are included.',
      '- id: ann_abc | status: open at "Open Questions": drop this bullet',
      '- id: composer | status: open: also tighten the API table',
    ].join('\n'));

    expect(out).toContain('## Unresolved Canvas comments');
    expect(out).toContain('id: ann_abc');
    expect(out).toContain('status: open');
    expect(out).toContain('drop this bullet');
    expect(out).toContain('also tighten the API table');
    expect(out).toContain('.annotron.json');
    expect(out).toMatch(/status` to `"resolved"`/);
    expect(out).not.toMatch(/^- Reviewer feedback collected/m);
  });

  it('dedupes identical instructions case-insensitively', () => {
    const out = consolidateCanvasFeedback('- fix the metric\n- Fix the metric\n');
    expect(out.match(/fix the metric/gi)).toHaveLength(1);
  });

  it('falls back when the reviewer sent an empty payload', () => {
    const out = consolidateCanvasFeedback('   \n');
    expect(out).toContain('Review the Canvas annotations');
  });
});
