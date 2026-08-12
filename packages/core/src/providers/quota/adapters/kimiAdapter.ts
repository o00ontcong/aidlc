/**
 * Kimi (Moonshot) adapter.
 *
 * Not verified on a real account: this dev machine has no `kimi` binary, no
 * Moonshot-pointed `ANTHROPIC_BASE_URL`, and no `MOONSHOT_API_KEY`, so there
 * was nothing to test Moonshot's usage API against. Per project rule
 * "verify trước, code sau" (§2.3) and "đừng tự chế cơ chế thay thế phức tạp"
 * (§7): detect + account presence are implemented (file/env checks only,
 * verifiable without an account), but quotas() intentionally ships
 * detect-only until someone with real Moonshot access can confirm the usage
 * endpoint's shape. Wire the network call there once verified — gate it
 * behind `env.allowNetworkProbes` (never call out without opt-in).
 */

import type { ProviderProbe } from '../types';
import { isOnPath } from '../util/detect';

function usesMoonshotBaseUrl(env: Parameters<ProviderProbe['detect']>[0]): boolean {
  const baseUrl = env.env.ANTHROPIC_BASE_URL ?? '';
  return baseUrl.includes('moonshot');
}

export const kimiAdapter: ProviderProbe = {
  id: 'kimi',
  displayName: 'Kimi',
  presentation: { initial: 'K', iconBg: 'rgba(0,136,255,0.18)', iconFg: 'rgb(90,175,255)' },

  async detect(env) {
    const installed = isOnPath('kimi', env) || usesMoonshotBaseUrl(env) || !!env.env.MOONSHOT_API_KEY;
    return installed
      ? { installed: true }
      : { installed: false, reason: 'no kimi binary, Moonshot ANTHROPIC_BASE_URL, or MOONSHOT_API_KEY found' };
  },

  async accounts(env) {
    if (env.env.MOONSHOT_API_KEY || (usesMoonshotBaseUrl(env) && env.env.ANTHROPIC_API_KEY)) {
      return [{ id: 'api-key', label: 'API key' }];
    }
    return [];
  },

  async quotas() {
    // Not shipped: no verified Moonshot usage-API response on hand to parse
    // against. Returning [] here is the honest "unknown", not a bug.
    return [];
  },
};
