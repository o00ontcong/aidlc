import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let workspaceFolders: Array<{ uri: { fsPath: string } }> = [];

vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() { return workspaceFolders; },
    getConfiguration: () => ({
      get: (key: string, def: unknown) => (key === 'subtasks.enabled' ? true : def),
    }),
  },
}));

vi.mock('../src/v2/jiraCredentials', () => ({
  jiraCredentials: {
    // Simulates a real-world SecretStorage failure (e.g. a Linux keyring
    // error, or a broken remote-SSH session) — the scenario that used to
    // make plan()/create() throw instead of resolving with an error.
    client: vi.fn(async () => { throw new Error('SecretStorage unavailable'); }),
    settings: () => ({
      site: 'acme.atlassian.net',
      email: '',
      projectKey: '',
      boardId: 0,
      jql: '',
      refreshMinutes: 10,
      requestTimeoutSeconds: 20,
      transitionsEnabled: false,
      subtasksEnabled: true,
      transitionMapping: { taskCreated: '', review: '', runCompleted: '', runFailed: '' },
      transitionConfirm: true,
    }),
  },
}));

vi.mock('../src/v2/jiraSprintService', () => ({
  jiraSprintService: {
    cachedTicket: () => ({ key: 'ABC-1', isSubtask: false }),
    refresh: vi.fn(),
  },
}));

import { jiraSubtaskService } from '../src/v2/jiraSubtaskService';

describe('jiraSubtaskService — plan/create never throw on a credential failure', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-jira-subtask-'));
    workspaceFolders = [{ uri: { fsPath: root } }];
    jiraSubtaskService.init(path.resolve('.'), { appendLine: vi.fn() } as unknown as never);
  });

  afterEach(() => {
    jiraSubtaskService.detach();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('plan() resolves with an error instead of rejecting', async () => {
    await expect(jiraSubtaskService.plan('ABC-1')).resolves.toMatchObject({
      ticketKey: 'ABC-1',
      drafts: [],
      error: expect.stringContaining('SecretStorage unavailable'),
    });
  });

  it('planAndPost posts an error result to the panel instead of leaving it hanging', async () => {
    const post = vi.fn();
    jiraSubtaskService.attach({ post });

    await expect(jiraSubtaskService.planAndPost('ABC-1')).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledTimes(1);
    const [msg] = post.mock.calls[0] as [Record<string, unknown>];
    expect(msg.type).toBe('subtaskDrafts');
    expect(msg.drafts).toEqual([]);
    expect(String(msg.error)).toContain('SecretStorage unavailable');
  });

  it('createAndPost posts a failed result to the panel instead of leaving it hanging', async () => {
    const post = vi.fn();
    jiraSubtaskService.attach({ post });

    await expect(jiraSubtaskService.createAndPost('ABC-1', ['backend'])).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledTimes(1);
    const [msg] = post.mock.calls[0] as [Record<string, unknown>];
    expect(msg.type).toBe('subtaskCreateResult');
    expect(msg.created).toEqual([]);
    expect(Array.isArray(msg.failed)).toBe(true);
    expect((msg.failed as unknown[]).length).toBeGreaterThan(0);
  });
});
