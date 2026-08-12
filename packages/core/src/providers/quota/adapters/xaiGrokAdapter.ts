/**
 * xAI (Grok) adapter.
 *
 * Per §2.3.4 the design shows this provider permanently in the
 * "not connected" state — there is no known xAI coding-CLI to detect against
 * today. This adapter exists so the provider still appears in the registry
 * (toggle off, "No connections", available in the add-provider wizard) and
 * so adding real xAI support later is a one-file change: implement detect()
 * for whatever CLI/config ships, the rest of the pipeline is unchanged.
 */

import type { ProviderProbe } from '../types';

export const xaiGrokAdapter: ProviderProbe = {
  id: 'xai-grok',
  displayName: 'xAI (Grok)',
  presentation: { initial: 'X', iconBg: 'rgba(255,255,255,0.06)', iconFg: '#6E7574' },

  async detect() {
    return { installed: false, reason: 'no xAI/Grok coding CLI is integrated yet' };
  },

  async accounts() {
    return [];
  },

  async quotas() {
    return [];
  },
};
