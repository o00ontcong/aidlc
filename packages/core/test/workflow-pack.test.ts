import { describe, expect, it } from 'vitest';
import { listBuiltinWorkflowPacks, lockWorkflowPack, resolveBuiltinWorkflowPack } from '../src/packs';

describe('built-in SDLC workflow packs', () => {
  it('ships two versioned packs with five-stage guide metadata', () => {
    expect(listBuiltinWorkflowPacks().map((pack) => pack.id)).toEqual(['sdlc-core', 'regulated']);
    for (const pack of listBuiltinWorkflowPacks()) {
      expect(Object.keys(pack.guide)).toEqual(['understand', 'plan', 'build', 'verify', 'ship']);
      expect(pack.artifactPolicy.defaults).toEqual({ persist: 'runtime', commit: false });
    }
  });

  it('maps the core five-stage flow and regulated traceability explicitly', () => {
    expect(resolveBuiltinWorkflowPack('sdlc-core').actions?.understand?.[0].id).toBe('analyze-project');
    const regulated = resolveBuiltinWorkflowPack('regulated');
    expect(regulated.capabilityRequirements).toContainEqual(expect.objectContaining({ capabilityId: 'artifact-annotation' }));
    expect(regulated.artifactPolicy.types.traceability.commit).toBe(true);
  });

  it('generates a deterministic lock and rejects a missing version', () => {
    const pack = resolveBuiltinWorkflowPack('sdlc-core', '1.0.0');
    expect(lockWorkflowPack(pack)).toEqual(lockWorkflowPack(pack));
    expect(() => resolveBuiltinWorkflowPack('sdlc-core', '9.0.0')).toThrow(/not bundled/);
  });
});
