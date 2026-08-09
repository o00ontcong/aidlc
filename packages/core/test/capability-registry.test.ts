import { describe, expect, it } from 'vitest';

import type { Capability, CapabilityHealthStatus, CapabilityProvider } from '../src/contracts';
import { CapabilityRegistry } from '../src/capabilities';

class TestCapabilityProvider implements CapabilityProvider {
  constructor(readonly id: string, private readonly capability: Capability, private readonly healthy: boolean) {}
  describe(): Capability { return this.capability; }
  async isEnabled(): Promise<boolean> { return this.capability.enabledByDefault; }
  async healthCheck(): Promise<CapabilityHealthStatus> {
    return { capabilityId: this.id, enabled: true, healthy: this.healthy, message: this.healthy ? 'ready' : 'unavailable' };
  }
}

describe('CapabilityRegistry', () => {
  it('enables bundled AST graph and annotation by default while optional capabilities remain disabled', async () => {
    const registry = new CapabilityRegistry();
    expect(await registry.health('ast-graph')).toMatchObject({ enabled: true, healthy: true });
    expect(await registry.health('artifact-annotation')).toMatchObject({ enabled: true, healthy: true });
    expect(await registry.health('test-agent')).toMatchObject({ enabled: false, healthy: false });
    expect(await registry.health('observability')).toMatchObject({ enabled: false, healthy: false });
  });

  it('honors project policy without requiring a VS Code implementation', async () => {
    const registry = new CapabilityRegistry({ 'ast-graph': false });
    expect(await registry.health('ast-graph')).toMatchObject({ enabled: false, healthy: false });
    registry.setEnabled('artifact-annotation', false);
    expect(registry.getPolicy()).toEqual({ 'ast-graph': false, 'artifact-annotation': false });
  });

  it('lets project intelligence query hard and optional capability requirements', async () => {
    const registry = new CapabilityRegistry();
    registry.register(new TestCapabilityProvider(
      'ios-simulator',
      { id: 'ios-simulator', name: 'iOS Simulator', category: 'optional', enabledByDefault: true },
      false,
    ));

    const result = await registry.resolveRequirements([
      { capabilityId: 'ast-graph' },
      { capabilityId: 'ios-simulator', reason: 'Run iOS integration test' },
      { capabilityId: 'observability', optional: true },
    ]);

    expect(result.unavailable).toEqual([{ capabilityId: 'ios-simulator', reason: 'Run iOS integration test' }]);
    expect(result.statuses).toHaveLength(3);
  });
});
