import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PIPELINE_ID,
  DEFAULT_WORKFLOW_ID,
  orderDefaultPipelines,
  pickDefaultPipelineId,
} from '../src/defaultWorkflow';

describe('extension default workflow', () => {
  it('uses CoFoFo feature as the default without depending on preset order', () => {
    expect(DEFAULT_WORKFLOW_ID).toBe('cofofo-workflow');
    expect(DEFAULT_PIPELINE_ID).toBe('cofofo-feature');
    expect(pickDefaultPipelineId([
      { id: 'custom' },
      { id: 'cofofo-foundation' },
      { id: 'cofofo-feature' },
    ])).toBe('cofofo-feature');
  });

  it('orders startable CoFoFo pipelines before optional workflows', () => {
    expect(orderDefaultPipelines([
      { id: 'custom' },
      { id: 'cofofo-foundation' },
      { id: 'cofofo-bugfix' },
      { id: 'cofofo-feature' },
    ]).map((pipeline) => pipeline.id)).toEqual([
      'cofofo-feature',
      'cofofo-bugfix',
      'cofofo-foundation',
      'custom',
    ]);
  });
});
