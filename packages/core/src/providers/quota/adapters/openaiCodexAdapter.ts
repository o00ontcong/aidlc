/**
 * OpenAI Codex adapter.
 *
 * Verified on a real dev machine: `codex` rollout logs at
 * `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` contain `event_msg`
 * entries shaped like:
 *   { "type": "event_msg", "payload": { "type": "token_count",
 *       "rate_limits": { "primary": { "used_percent": 64.0,
 *         "window_minutes": 10080, "resets_at": 1786849673 },
 *         "secondary": null, "plan_type": "plus", ... } } }
 * `used_percent` is computed by Codex's own backend, not derived by us, so
 * this is `source: 'local-log'` (we read it from a local file, we don't call
 * an API ourselves) with `confidence: 'exact'` (it's not an estimate).
 * `secondary` was null in every session sampled on a "plus" plan — window
 * mapping below is by `window_minutes`, not position, so it degrades
 * gracefully if only one window is ever reported.
 *
 * Login is detected by the presence of `$CODEX_HOME/auth.json`'s `tokens`
 * key (existence only — never read the token value).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ProviderProbe, QuotaWindow } from '../types';
import { isOnPath, resolveConfigDir, dirExists } from '../util/detect';
import { findLatestFile } from '../util/findLatestFile';
import { readNewLines } from '../util/tailReader';

function configDir(env: Parameters<ProviderProbe['detect']>[0]): string {
  return resolveConfigDir(env, 'CODEX_HOME', '.codex');
}

function windowLabel(minutes: number): { id: string; label: string } {
  if (Math.abs(minutes - 300) <= 30) return { id: 'session-5h', label: 'session (5h)' };
  if (Math.abs(minutes - 10080) <= 60) return { id: 'weekly-7d', label: 'weekly (7d)' };
  const hours = Math.round(minutes / 60);
  return { id: `window-${minutes}m`, label: hours >= 24 ? `window (${Math.round(hours / 24)}d)` : `window (${hours}h)` };
}

interface RateLimitWindow {
  used_percent: number;
  window_minutes: number;
  resets_at?: number;
}

function parseRateLimitsLine(line: string): { primary?: RateLimitWindow; secondary?: RateLimitWindow } | undefined {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return undefined;
  }
  const payload = (obj as { payload?: unknown })?.payload as { type?: string; rate_limits?: unknown } | undefined;
  if (payload?.type !== 'token_count' || !payload.rate_limits) return undefined;
  return payload.rate_limits as { primary?: RateLimitWindow; secondary?: RateLimitWindow };
}

function toQuotaWindow(w: RateLimitWindow): QuotaWindow {
  const { id, label } = windowLabel(w.window_minutes);
  return {
    id,
    label,
    kind: 'percent',
    used: Math.round(w.used_percent),
    limit: 100,
    resetsAt: w.resets_at ? new Date(w.resets_at * 1000).toISOString() : undefined,
    source: 'local-log',
    confidence: 'exact',
  };
}

export const openaiCodexAdapter: ProviderProbe = {
  id: 'openai-codex',
  displayName: 'OpenAI Codex',
  presentation: { initial: 'O', iconBg: 'rgba(255,255,255,0.08)', iconFg: '#E6E8E8' },

  async detect(env) {
    const dir = configDir(env);
    const installed = isOnPath('codex', env) || dirExists(dir);
    return installed
      ? { installed: true }
      : { installed: false, reason: `codex binary not on PATH and ${dir} not found` };
  },

  async accounts(env) {
    const authFile = path.join(configDir(env), 'auth.json');
    try {
      const raw = JSON.parse(fs.readFileSync(authFile, 'utf8')) as { tokens?: unknown; OPENAI_API_KEY?: unknown };
      if (raw.tokens) return [{ id: 'oauth', label: 'Account 1' }];
      if (raw.OPENAI_API_KEY) return [{ id: 'api-key', label: 'API key' }];
      return [];
    } catch {
      return [];
    }
  },

  async quotas(env) {
    const sessionsRoot = path.join(configDir(env), 'sessions');
    const latest = findLatestFile(sessionsRoot, (name) => name.startsWith('rollout-') && name.endsWith('.jsonl'));
    if (!latest) return [];

    let rateLimits: { primary?: RateLimitWindow; secondary?: RateLimitWindow } | undefined;
    for (const line of readNewLines(latest)) {
      const parsed = parseRateLimitsLine(line);
      if (parsed) rateLimits = parsed;
    }
    if (!rateLimits) return [];

    const windows: QuotaWindow[] = [];
    if (rateLimits.primary) windows.push(toQuotaWindow(rateLimits.primary));
    if (rateLimits.secondary) windows.push(toQuotaWindow(rateLimits.secondary));
    return windows;
  },
};
