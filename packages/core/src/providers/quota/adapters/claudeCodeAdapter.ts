/**
 * Claude Code adapter.
 *
 * Verified on a real dev machine (see PR description for exact commands run):
 *   - `claude --help` has no usage/limit/quota subcommand.
 *   - `~/.claude/policy-limits.json` holds org policy restrictions, not quota.
 *   - `~/.claude.json` has no numeric usage/rate-limit field; `oauthAccount`
 *     only tells us a login exists (reused via claudeEnv.ts's hasClaudeLogin).
 *   - Session transcripts (`~/.claude/projects/**\/*.jsonl`) carry per-message
 *     token usage, but turning that into a session/weekly percentage needs the
 *     account's plan token budget, which is not exposed locally.
 *
 * Per project rule "không được bịa số": this adapter reports detect + account
 * only. quotas() returns [] with a reason — the UI renders '—' + tooltip
 * rather than an invented percentage. If Anthropic ships a usage API/CLI
 * subcommand later, only quotas() needs to change.
 */

import type { ProviderProbe } from '../types';
import { hasClaudeLogin } from '../../../runner/claudeEnv';
import { isOnPath, resolveConfigDir, dirExists } from '../util/detect';

export const claudeCodeAdapter: ProviderProbe = {
  id: 'claude-code',
  displayName: 'Claude Code',
  presentation: { initial: 'C', iconBg: 'rgba(226,114,91,0.22)', iconFg: '#E2725B' },

  async detect(env) {
    const dir = resolveConfigDir(env, 'CLAUDE_CONFIG_DIR', '.claude');
    const installed = isOnPath('claude', env) || dirExists(dir);
    return installed
      ? { installed: true }
      : { installed: false, reason: `claude binary not on PATH and ${dir} not found` };
  },

  async accounts(env) {
    if (hasClaudeLogin(env.home)) {
      return [{ id: 'oauth', label: 'Account 1' }];
    }
    if (env.env.ANTHROPIC_API_KEY) {
      return [{ id: 'api-key', label: 'API key' }];
    }
    return [];
  },

  async quotas() {
    return [];
  },
};
