import { describe, it, expect } from 'vitest';

import {
  ArtifactPolicySchema,
  parseArtifactPolicy,
  createDefaultArtifactPolicy,
  resolveArtifactDescriptor,
  commitEligibleArtifactTypes,
  type ArtifactPolicy,
} from '../src/contracts/artifact';

function samplePolicy(): ArtifactPolicy {
  return {
    schemaVersion: 1,
    defaults: { persist: 'runtime', commit: false },
    types: {
      specification: { path: 'docs/epics/{epic}/SPEC.md', persist: 'project', commit: true },
      'architecture-decision': { path: 'docs/decisions/{id}.md', persist: 'project', commit: true },
      'execution-plan': { path: '.aidlc/epics/{epic}/plan.md', persist: 'runtime', commit: false },
      'review-log': { path: '.aidlc/epics/{epic}/review.md', persist: 'runtime', commit: false },
    },
  };
}

describe('ArtifactPolicy — product decision: default persist=runtime, commit=false (design doc §0.2 / §7.2)', () => {
  it('createDefaultArtifactPolicy() never commits anything until a type opts in', () => {
    const policy = createDefaultArtifactPolicy();
    expect(policy.defaults).toEqual({ persist: 'runtime', commit: false });
    expect(policy.types).toEqual({});
    expect(commitEligibleArtifactTypes(policy)).toEqual([]);
  });

  it('a type with no persist/commit override falls back to defaults', () => {
    const policy: ArtifactPolicy = {
      schemaVersion: 1,
      defaults: { persist: 'runtime', commit: false },
      types: { 'raw-transcript': { path: '.aidlc/runs/{run}/transcript.md' } },
    };
    const resolved = resolveArtifactDescriptor(policy, 'raw-transcript');
    expect(resolved).toEqual({
      type: 'raw-transcript',
      path: '.aidlc/runs/{run}/transcript.md',
      persist: 'runtime',
      commit: false,
    });
  });

  it('returns undefined for an unknown artifact type instead of throwing', () => {
    expect(resolveArtifactDescriptor(createDefaultArtifactPolicy(), 'unknown-type')).toBeUndefined();
  });
});

describe('ArtifactPolicy — matches the design doc §7.2 example', () => {
  it('resolves specification/architecture-decision as commit:true, execution-plan/review-log as commit:false', () => {
    const policy = samplePolicy();
    expect(resolveArtifactDescriptor(policy, 'specification')?.commit).toBe(true);
    expect(resolveArtifactDescriptor(policy, 'architecture-decision')?.commit).toBe(true);
    expect(resolveArtifactDescriptor(policy, 'execution-plan')?.commit).toBe(false);
    expect(resolveArtifactDescriptor(policy, 'review-log')?.commit).toBe(false);
  });

  it('commitEligibleArtifactTypes only lists the commit:true types — a commit preview never contains runtime/intermediate files', () => {
    const eligible = commitEligibleArtifactTypes(samplePolicy()).sort();
    expect(eligible).toEqual(['architecture-decision', 'specification']);
  });
});

describe('ArtifactPolicy — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = samplePolicy();
    const parsed = parseArtifactPolicy(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('rejects a type entry missing path', () => {
    const bad = { ...samplePolicy(), types: { specification: { persist: 'project', commit: true } } };
    expect(ArtifactPolicySchema.safeParse(bad).success).toBe(false);
  });
});

describe('ArtifactPolicy — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older payload where a type entry omits persist/commit overrides entirely', () => {
    const legacy = {
      schemaVersion: 1,
      defaults: { persist: 'runtime', commit: false },
      types: { 'execution-plan': { path: '.aidlc/epics/{epic}/plan.md' } },
    };
    const parsed = parseArtifactPolicy(legacy);
    expect(resolveArtifactDescriptor(parsed, 'execution-plan')).toEqual({
      type: 'execution-plan',
      path: '.aidlc/epics/{epic}/plan.md',
      persist: 'runtime',
      commit: false,
    });
  });

  it('parses an older payload with no types map at all (defaults to {})', () => {
    const legacy = { schemaVersion: 1, defaults: { persist: 'runtime', commit: false } };
    const parsed = parseArtifactPolicy(legacy);
    expect(parsed.types).toEqual({});
  });
});
