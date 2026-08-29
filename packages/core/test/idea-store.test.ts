import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IdeaRevisionConflictError, IdeaStore, type Idea } from '../src';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-store-')); }

function draft(overrides: Partial<Idea> = {}): Idea {
  return {
    schemaVersion: 1,
    id: 'IDEA-001',
    checkpoint: 'captured',
    ideaRevision: 0,
    seedSentence: 'The list never refreshes.',
    title: 'The list never refreshes.',
    outputLanguage: 'vi',
    foundationHashAtCapture: null,
    answers: {},
    batchIndex: 0,
    batchSubmitted: false,
    prep: { status: 'idle', selfAnswered: [], questions: [] },
    routeConfirmed: false,
    assumptions: [],
    children: [],
    saveStatus: 'saved',
    dirty: false,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('IdeaStore', () => {
  it('round-trips state and rejects a save against a stale expected revision', () => {
    const store = new IdeaStore(root());
    store.save(draft(), null);
    expect(store.require('IDEA-001').ideaRevision).toBe(0);

    const bumped = draft({ ideaRevision: 1, seedSentence: 'Edited.' });
    expect(() => store.save(bumped, 0)).not.toThrow();
    expect(store.require('IDEA-001').seedSentence).toBe('Edited.');

    // Writer B still thinks it is revision 0 — must be refused, not silently applied.
    expect(() => store.save(draft({ ideaRevision: 2 }), 0)).toThrow(IdeaRevisionConflictError);
  });

  it('appends events without ever rewriting an existing line, and dedupes by event id', () => {
    const store = new IdeaStore(root());
    store.save(draft(), null);
    const event = { id: 'evt-1', at: '2026-08-29T00:00:00.000Z', type: 'created' as const, actor: { kind: 'system' as const, id: 'x' }, revision: 0 };
    store.appendEvent('IDEA-001', event);
    store.appendEvent('IDEA-001', event); // duplicate id — must not double-append
    store.appendEvent('IDEA-001', { ...event, id: 'evt-2', type: 'seed_edited', revision: 1 });

    const events = store.readEvents('IDEA-001');
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.id)).toEqual(['evt-1', 'evt-2']);

    const raw = fs.readFileSync(store.eventsFile('IDEA-001'), 'utf8');
    expect(raw.split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('keeps the list usable when one sibling Idea is corrupt', () => {
    const workspaceRoot = root();
    const store = new IdeaStore(workspaceRoot);
    store.save(draft({ id: 'IDEA-001' }), null);
    store.save(draft({ id: 'IDEA-002', updatedAt: '2026-08-29T01:00:00.000Z' }), null);
    fs.mkdirSync(path.join(workspaceRoot, '.aidlc/ideas/IDEA-003'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.aidlc/ideas/IDEA-003/state.json'), '{ not json', 'utf8');

    const listed = store.list();
    expect(listed.map((i) => i.id)).toEqual(['IDEA-002', 'IDEA-001']); // newest updatedAt first
  });

  it('refuses a concurrent write while another writer holds the lock', () => {
    const workspaceRoot = root();
    const store = new IdeaStore(workspaceRoot);
    store.save(draft(), null);
    const lockFile = `${store.stateFile('IDEA-001')}.lock`;
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, '');
    try {
      expect(() => store.save(draft({ ideaRevision: 1 }), 0)).toThrow(IdeaRevisionConflictError);
    } finally {
      fs.unlinkSync(lockFile);
    }
  });
});
