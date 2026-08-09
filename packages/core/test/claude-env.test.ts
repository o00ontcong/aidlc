import { describe, expect, it } from 'vitest';

import { buildClaudeSpawnEnv } from '../src/runner/claudeEnv';

describe('buildClaudeSpawnEnv', () => {
  it('does not forward unrelated parent-process credentials', () => {
    const env = buildClaudeSpawnEnv({}, {
      PATH: '/usr/bin', HOME: '/tmp/home', CLAUDECODE: '1',
      ANTHROPIC_API_KEY: 'ephemeral', GITHUB_TOKEN: 'github-secret',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
    });

    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/tmp/home' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.CLAUDECODE).toBeUndefined();
  });

  it('keeps credentials for an explicitly enabled backend and explicit workspace overrides', () => {
    const env = buildClaudeSpawnEnv({ APP_RUNTIME_TOKEN: 'explicit' }, {
      PATH: '/usr/bin', CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_ACCESS_KEY_ID: 'bedrock-user', AWS_SECRET_ACCESS_KEY: 'bedrock-secret',
      GITHUB_TOKEN: 'not-for-claude',
    });

    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1');
    expect(env.AWS_ACCESS_KEY_ID).toBe('bedrock-user');
    expect(env.AWS_SECRET_ACCESS_KEY).toBe('bedrock-secret');
    expect(env.APP_RUNTIME_TOKEN).toBe('explicit');
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });
});
