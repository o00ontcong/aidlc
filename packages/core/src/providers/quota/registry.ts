/**
 * Registry of provider quota adapters. New providers register here — the
 * aggregator and UI never hardcode a provider id, so adding e.g. Gemini CLI
 * is a one-file change (see docs/prompts/quota-tracker-implementation.md §2.4).
 */

import type { ProviderProbe } from './types';
import { claudeCodeAdapter } from './adapters/claudeCodeAdapter';
import { openaiCodexAdapter } from './adapters/openaiCodexAdapter';
import { kimiAdapter } from './adapters/kimiAdapter';
import { xaiGrokAdapter } from './adapters/xaiGrokAdapter';

export class ProviderRegistry {
  private probes = new Map<string, ProviderProbe>();

  register(probe: ProviderProbe): void {
    this.probes.set(probe.id, probe);
  }

  get(id: string): ProviderProbe | undefined {
    return this.probes.get(id);
  }

  list(): ProviderProbe[] {
    return [...this.probes.values()];
  }
}

/** Registry pre-loaded with the bundled adapters, in design display order. */
export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(claudeCodeAdapter);
  registry.register(openaiCodexAdapter);
  registry.register(kimiAdapter);
  registry.register(xaiGrokAdapter);
  return registry;
}
