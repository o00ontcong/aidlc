import { describe, expect, it } from 'vitest';

import { CommandBus } from '../src/application/CommandBus';

describe('CommandBus — thrown error -> structured CommandResult.error (plan §18.6)', () => {
  it('falls back to command.execution_failed for a plain Error with no .code', async () => {
    const bus = new CommandBus();
    bus.register('boom.plain', () => {
      throw new Error('something broke');
    });
    const result = await bus.dispatch(bus.command('1', 'boom.plain', { kind: 'user', id: 'u' }, {}));
    expect(result.status).toBe('error');
    expect(result.error).toMatchObject({ code: 'command.execution_failed', summary: 'something broke' });
    expect(result.error?.recoveryActions).toEqual([]);
    expect(result.error?.metadata).toBeUndefined();
  });

  it('propagates a thrown error\'s .code, .recoveryActions and .metadata into CommandResult.error', async () => {
    class ChangeRevisionConflictError extends Error {
      readonly code = 'change.revision_conflict';
      readonly recoveryActions = [{ kind: 'reload', label: 'Reload the current Change' }, { kind: 'rebase', label: 'Rebase your edit' }];
      readonly metadata = { expectedRevision: 2, actualRevision: 3, expectedContentHash: 'a'.repeat(64), actualContentHash: 'b'.repeat(64) };
      constructor() {
        super('Change CHG-1 changed (expected revision 2, actual 3).');
        this.name = 'ChangeRevisionConflictError';
      }
    }
    const bus = new CommandBus();
    bus.register('boom.conflict', () => {
      throw new ChangeRevisionConflictError();
    });
    const result = await bus.dispatch(bus.command('1', 'boom.conflict', { kind: 'user', id: 'u' }, {}));
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('change.revision_conflict');
    expect(result.error?.recoveryActions).toEqual([
      { kind: 'reload', label: 'Reload the current Change' },
      { kind: 'rebase', label: 'Rebase your edit' },
    ]);
    expect(result.error?.metadata).toEqual({ expectedRevision: 2, actualRevision: 3, expectedContentHash: 'a'.repeat(64), actualContentHash: 'b'.repeat(64) });
  });

  it('ignores malformed recoveryActions/metadata rather than echoing unexpected data', async () => {
    class WeirdError extends Error {
      readonly code = 'weird.thing';
      readonly recoveryActions = ['not-an-object', { kind: 'not-a-real-kind', label: 'x' }, { label: 'missing kind' }];
      readonly metadata = { ok: 'fine', nested: { not: 'allowed' }, list: [1, 2, 3] };
      constructor() { super('weird'); }
    }
    const bus = new CommandBus();
    bus.register('boom.weird', () => {
      throw new WeirdError();
    });
    const result = await bus.dispatch(bus.command('1', 'boom.weird', { kind: 'user', id: 'u' }, {}));
    expect(result.error?.recoveryActions).toEqual([]);
    expect(result.error?.metadata).toEqual({ ok: 'fine' });
  });

  it('rejects a duplicate handler registration for the same command name', () => {
    const bus = new CommandBus();
    bus.register('dup.cmd', () => ({ schemaVersion: 1 as const, commandId: 'x', status: 'ok' as const, warnings: [], evidence: [], recoveryActions: [] }));
    expect(() => bus.register('dup.cmd', () => { throw new Error('unreachable'); })).toThrow(/already registered/);
  });
});
