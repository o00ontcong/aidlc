import { describe, expect, it } from 'vitest';

import {
  DISCOVERY_COPY,
  discoveryCopy,
  translateDiscoveryBlocker,
} from '../src/webview/lib/discoveryI18n';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...keyPaths(child, path)];
  }).sort();
}

describe('Discovery translations', () => {
  it('keeps English and Vietnamese copy structurally aligned', () => {
    expect(keyPaths(DISCOVERY_COPY.vi)).toEqual(keyPaths(DISCOVERY_COPY.en));
    expect(discoveryCopy('en').title).toContain('clear plan');
    expect(discoveryCopy('vi').title).toContain('kế hoạch');
  });

  it('turns technical readiness blockers into plain localized guidance', () => {
    const blocker = 'Selected approach is required.';
    expect(translateDiscoveryBlocker(blocker, 'en')).toBe('Choose the approach you want to use.');
    expect(translateDiscoveryBlocker(blocker, 'vi')).toBe('Chọn hướng tiếp cận bạn muốn sử dụng.');
    expect(translateDiscoveryBlocker('Unknown blocker', 'vi')).toBe('Unknown blocker');
  });
});
