import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateCalls: Array<[string, unknown, number]> = [];

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, def: unknown) => def,
      update: (key: string, value: unknown, target: number) => {
        updateCalls.push([key, value, target]);
        return Promise.resolve();
      },
    }),
  },
}));

vi.mock('@aidlc/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aidlc/core')>();
  return {
    ...actual,
    JiraClient: class {
      async myself() { return { displayName: 'Test User', emailAddress: 'test@acme.com', accountId: 'acc-1' }; }
    },
  };
});

import { verifyAndStoreJiraCredentials } from '../src/v2/jiraCredentials';

describe('verifyAndStoreJiraCredentials — config scope', () => {
  beforeEach(() => {
    updateCalls.length = 0;
  });

  it('writes site and email at Workspace scope, not Global — so connecting Jira in one repo does not leak into every other window', async () => {
    const result = await verifyAndStoreJiraCredentials({
      site: 'acme.atlassian.net',
      email: 'test@acme.com',
      apiToken: 'tok-123',
    });

    expect(result.ok).toBe(true);

    const siteCall = updateCalls.find(([key]) => key === 'site');
    const emailCall = updateCalls.find(([key]) => key === 'email');
    expect(siteCall).toBeDefined();
    expect(emailCall).toBeDefined();

    const WORKSPACE = 2; // vscode.ConfigurationTarget.Workspace
    const GLOBAL = 1; // vscode.ConfigurationTarget.Global
    expect(siteCall![2]).toBe(WORKSPACE);
    expect(siteCall![2]).not.toBe(GLOBAL);
    expect(emailCall![2]).toBe(WORKSPACE);
    expect(emailCall![2]).not.toBe(GLOBAL);
  });
});
