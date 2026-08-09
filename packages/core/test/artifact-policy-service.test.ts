import { describe, expect, it } from 'vitest';
import { createDefaultArtifactPolicy } from '../src/contracts';
import { ArtifactPolicyService, resolveArtifactPath } from '../src/artifacts';

describe('ArtifactPolicyService', () => {
  it('defaults to runtime-only, no commit and previews only opted-in artifacts', () => {
    const policy = createDefaultArtifactPolicy();
    policy.types.specification = { path: 'docs/epics/{epic}/SPEC.md', persist: 'project', commit: true };
    policy.types.review = { path: '.aidlc/epics/{epic}/review.md' };
    const preview = new ArtifactPolicyService('/tmp').preview(policy, ['specification', 'review'], { epic: 'EPIC-1' }, ['src/a.ts']);
    expect(preview.artifacts.map((artifact) => artifact.resolvedPath)).toEqual(['docs/epics/EPIC-1/SPEC.md']);
    expect(preview.codePaths).toEqual(['src/a.ts']);
  });
  it('rejects unknown types, traversal, and duplicate canonical review destinations', () => {
    const policy = createDefaultArtifactPolicy();
    policy.types.good = { path: 'docs/{epic}.md', commit: true };
    policy.types.bad = { path: '../secret.md', commit: true };
    policy.types.same = { path: 'docs/{epic}.md', commit: true };
    expect(() => resolveArtifactPath(policy, 'bad', { epic: 'EPIC-1' })).toThrow(/Unsafe/);
    expect(() => resolveArtifactPath(policy, 'missing', { epic: 'EPIC-1' })).toThrow(/Unknown/);
    expect(() => new ArtifactPolicyService('/tmp').preview(policy, ['good', 'same'], { epic: 'EPIC-1' })).toThrow(/canonical/);
  });
});
