/**
 * Declarative Canvas review policy on a pipeline step (M1, Task 2).
 *
 * A step may opt into content-bound human review by declaring
 * `review: { mode: 'canvas', artifacts: [...] }`. The policy is validated at
 * load time so a malformed gate fails before a run starts rather than at the
 * gate itself.
 *
 * Two invariants carry most of the weight here:
 *   - **Backward compatibility.** A step with no `review` keeps the existing
 *     confirmation-only behavior, and the field must stay absent when unused
 *     so `pipelineHash` is unchanged — a default value would re-hash every
 *     existing pipeline and orphan the snapshot of every in-flight run.
 *   - **No self-defeating gates.** `review` requires `human_review: true`
 *     (a Canvas gate that never pauses is not a gate), forbids `skippable`
 *     (a skipped step's `produces` are treated as satisfied downstream, which
 *     would void the review), and only accepts artifacts the step declares.
 */
import { describe, it, expect } from 'vitest';

import {
  validateWorkspace,
  WorkspaceValidationError,
  normalizeStep,
} from '../src/schema/WorkspaceSchema';
import { pipelineHash } from '../src/runs/PipelineSnapshot';

/** Wrap one step in the smallest workspace the schema accepts. */
function withStep(step: Record<string, unknown>) {
  return {
    version: '1.0',
    name: 'Canvas review',
    pipelines: [{ id: 'p', steps: [step] }],
  };
}

function parseStep(step: Record<string, unknown>) {
  const config = validateWorkspace(withStep(step), 'memory:test');
  const parsed = config.pipelines[0].steps[0];
  if (typeof parsed === 'string') { throw new Error('expected object form'); }
  return parsed;
}

const PRD = 'docs/epics/{epic}/artifacts/PRD.md';

const CANVAS_STEP = {
  agent: 'po',
  produces: [PRD],
  human_review: true,
  review: { mode: 'canvas', artifacts: [PRD] },
};

describe('Canvas review policy — accepted shapes', () => {
  it('parses a step whose review artifact comes from `produces`', () => {
    expect(parseStep(CANVAS_STEP).review).toEqual({ mode: 'canvas', artifacts: [PRD] });
  });

  it('accepts an artifact declared on `requires` instead of `produces`', () => {
    const step = parseStep({
      agent: 'qa',
      requires: [PRD],
      produces: ['docs/epics/{epic}/artifacts/TEST-PLAN.md'],
      human_review: true,
      // Union of produces + requires — a closing gate reviews upstream output too.
      review: {
        mode: 'canvas',
        artifacts: [PRD, 'docs/epics/{epic}/artifacts/TEST-PLAN.md'],
      },
    });
    expect(step.review?.artifacts).toHaveLength(2);
  });

  it('surfaces the policy on the normalized step', () => {
    expect(normalizeStep(CANVAS_STEP).review).toEqual({ mode: 'canvas', artifacts: [PRD] });
  });
});

describe('Canvas review policy — rejected shapes', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    [
      'review without `human_review: true` (a gate that never pauses)',
      { ...CANVAS_STEP, human_review: false },
    ],
    [
      'review on a `skippable` step (skipping would void the gate)',
      { ...CANVAS_STEP, skippable: true },
    ],
    [
      'an artifact absent from both `produces` and `requires`',
      {
        agent: 'po',
        produces: [PRD],
        human_review: true,
        review: { mode: 'canvas', artifacts: ['docs/epics/{epic}/artifacts/SMUGGLED.md'] },
      },
    ],
    [
      'a non-Markdown artifact',
      {
        agent: 'dev',
        produces: ['docs/epics/{epic}/artifacts/report.html'],
        human_review: true,
        review: { mode: 'canvas', artifacts: ['docs/epics/{epic}/artifacts/report.html'] },
      },
    ],
    [
      'a duplicated artifact',
      { ...CANVAS_STEP, review: { mode: 'canvas', artifacts: [PRD, PRD] } },
    ],
    [
      'an empty artifact list',
      { ...CANVAS_STEP, review: { mode: 'canvas', artifacts: [] } },
    ],
    [
      'an unknown review mode',
      { ...CANVAS_STEP, review: { mode: 'freeform', artifacts: [PRD] } },
    ],
  ];

  for (const [label, step] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => validateWorkspace(withStep(step), 'memory:test')).toThrow(
        WorkspaceValidationError,
      );
    });
  }
});

describe('Canvas review policy — backward compatibility', () => {
  const LEGACY_STEP = { agent: 'po', produces: [PRD], human_review: true };

  it('leaves `review` undefined on a step that does not declare it', () => {
    const step = parseStep(LEGACY_STEP);
    expect(step.review).toBeUndefined();
    expect(step.human_review).toBe(true); // legacy confirmation gate untouched
  });

  it('leaves `review` undefined for the bare-string step form', () => {
    expect(normalizeStep('po').review).toBeUndefined();
  });

  it('omits the `review` key entirely when unused, so `pipelineHash` is unchanged', () => {
    // `pipelineHash` serializes every own key of the parsed structure. Proving
    // the key is absent proves the digest of a legacy pipeline cannot move,
    // without pinning a literal digest that would itself need updating.
    const step = parseStep(LEGACY_STEP);
    expect(Object.keys(step)).not.toContain('review');

    const pipeline = validateWorkspace(withStep(LEGACY_STEP), 'memory:test').pipelines[0];
    expect(pipelineHash(pipeline)).toBe(pipelineHash(pipeline));
    expect(pipelineHash(pipeline)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes `pipelineHash` once a step opts into review', () => {
    const legacy = validateWorkspace(withStep(LEGACY_STEP), 'memory:test').pipelines[0];
    const canvas = validateWorkspace(withStep(CANVAS_STEP), 'memory:test').pipelines[0];
    expect(pipelineHash(canvas)).not.toBe(pipelineHash(legacy));
  });
});
