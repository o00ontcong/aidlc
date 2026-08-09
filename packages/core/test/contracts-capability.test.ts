import { describe, it, expect } from 'vitest';

import {
  CapabilitySchema,
  CapabilityRequirementSchema,
  DEFAULT_CAPABILITIES,
  BUNDLED_CAPABILITY_IDS,
  OPTIONAL_CAPABILITY_IDS,
  type CapabilityProvider,
  type Capability,
} from '../src/contracts/capability';

describe('Capability — bundled vs optional defaults (design doc §0.5, §10)', () => {
  it('AST graph and artifact annotation are bundled and enabled by default', () => {
    for (const id of BUNDLED_CAPABILITY_IDS) {
      const cap = DEFAULT_CAPABILITIES.find((c) => c.id === id);
      expect(cap).toBeDefined();
      expect(cap?.category).toBe('bundled');
      expect(cap?.enabledByDefault).toBe(true);
    }
  });

  it('Test Agent and observability are optional and disabled by default', () => {
    for (const id of OPTIONAL_CAPABILITY_IDS) {
      const cap = DEFAULT_CAPABILITIES.find((c) => c.id === id);
      expect(cap).toBeDefined();
      expect(cap?.category).toBe('optional');
      expect(cap?.enabledByDefault).toBe(false);
    }
  });

  it('bundled and optional id lists do not overlap', () => {
    const bundled = new Set<string>(BUNDLED_CAPABILITY_IDS);
    const optional = new Set<string>(OPTIONAL_CAPABILITY_IDS);
    for (const id of optional) {
      expect(bundled.has(id)).toBe(false);
    }
  });

  it('every DEFAULT_CAPABILITIES entry validates against CapabilitySchema', () => {
    for (const cap of DEFAULT_CAPABILITIES) {
      expect(CapabilitySchema.safeParse(cap).success).toBe(true);
    }
  });
});

describe('CapabilityRequirement', () => {
  it('defaults optional to false — a requirement is a hard prerequisite unless stated otherwise', () => {
    const parsed = CapabilityRequirementSchema.parse({ capabilityId: 'ast-graph' });
    expect(parsed.optional).toBe(false);
  });

  it('round-trips through JSON unchanged', () => {
    const original = { capabilityId: 'test-agent', reason: 'Verify generated code compiles', optional: true };
    const parsed = CapabilityRequirementSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });
});

describe('CapabilityProvider — interface shape (behavioral, smoke-tested via a fake)', () => {
  it('a fake implementation satisfies the interface and reports enable state / health', async () => {
    const fake: CapabilityProvider = {
      id: 'ast-graph',
      describe(): Capability {
        return { id: 'ast-graph', name: 'AST graph', category: 'bundled', enabledByDefault: true };
      },
      async isEnabled() {
        return true;
      },
      async healthCheck() {
        return { capabilityId: 'ast-graph', enabled: true, healthy: true };
      },
    };

    expect(fake.describe().category).toBe('bundled');
    expect(await fake.isEnabled()).toBe(true);
    expect((await fake.healthCheck()).healthy).toBe(true);
  });
});
