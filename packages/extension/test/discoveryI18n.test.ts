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
    expect(discoveryCopy('en').title).toContain('plan');
    expect(discoveryCopy('vi').title).toContain('kế hoạch');
  });

  it('shows the complete ECC engineering loop and clearly separates the approval gate', () => {
    const english = discoveryCopy('en');
    const vietnamese = discoveryCopy('vi');

    expect(english.engineeringLoop.map((stage) => stage.id)).toEqual([
      'research', 'plan', 'test', 'implement', 'review', 'verify', 'remember', 'improve',
    ]);
    expect(english.engineeringLoop[2].handoff).toBe(true);
    expect(english.approvalGate).toContain('approve');
    expect(vietnamese.approvalGate).toContain('duyệt');
    expect(english.steps).toHaveLength(3);
    expect(english.engineeringPillars).toHaveLength(4);
    expect(english.engineeringPillars.map((pillar) => pillar.stageIds)).toEqual([
      ['research', 'plan'],
      ['test', 'implement'],
      ['review', 'verify'],
      ['remember', 'improve'],
    ]);
  });

  it('turns technical readiness blockers into plain localized guidance', () => {
    const blocker = 'Selected approach is required.';
    expect(translateDiscoveryBlocker(blocker, 'en')).toBe('Choose the approach you want to use.');
    expect(translateDiscoveryBlocker(blocker, 'vi')).toBe('Chọn hướng tiếp cận bạn muốn sử dụng.');
    expect(translateDiscoveryBlocker('Unknown blocker', 'vi')).toBe('Unknown blocker');
  });
});
