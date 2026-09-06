import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ChangeService } from '../src/change';
import { computeChangeContentHash, generateContextRevisionId, toEpicId, type ProjectChangeDraft } from '../src/contracts';

const roots: string[] = [];
const USER = { kind: 'user' as const, id: 'cong' };
const SYSTEM = { kind: 'system' as const, id: 'delivery-runner' };

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-change-delivery-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true });
});

function linkedChange(service: ChangeService) {
  const created = service.create({
    commandId: 'create',
    actor: USER,
    title: 'Keep profile changes visible',
    type: 'feature',
    requirement: { problem: '', desiredOutcome: 'Keep profile changes visible', acceptanceCriteria: [], inScope: [], outOfScope: [], constraints: [] },
    origin: { kind: 'user', entryPoint: 'project', actor: USER },
  }).change;
  const epicId = toEpicId(`EPIC-${created.id.slice('CHG-'.length)}`);
  return service.store.update(created.id, { expectedRevision: created.revision, expectedContentHash: created.contentHash }, (current) => {
    const draft: ProjectChangeDraft = {
      ...current,
      revision: current.revision + 1,
      updatedAt: '2026-09-05T00:00:01.000Z',
      epicLink: {
        state: 'linked', commandId: 'start', epicId,
        changeRevision: current.revision, changeContentHash: current.contentHash,
        changeSnapshotHash: 'a'.repeat(64), contextRevisionId: generateContextRevisionId(),
        contextRootHash: 'b'.repeat(64), linkedAt: '2026-09-05T00:00:01.000Z',
      },
    };
    return { ...draft, contentHash: computeChangeContentHash(draft) };
  });
}

describe('Change delivery close-out', () => {
  it('keeps delivery completion and Context resolution as two separately audited facts', () => {
    const service = new ChangeService(root(), { clock: () => '2026-09-05T00:00:02.000Z' });
    const linked = linkedChange(service);
    const epicId = linked.epicLink!.epicId;

    const pending = service.recordDeliveryCompleted({
      commandId: 'delivery-complete', actor: SYSTEM, changeId: linked.id,
      guard: { expectedRevision: linked.revision, expectedContentHash: linked.contentHash }, epicId,
    }).change;
    expect(pending.contextSync).toMatchObject({ status: 'pending', epicId });

    const done = service.markContextNotRequired({
      commandId: 'no-context-update', actor: USER, changeId: pending.id,
      guard: { expectedRevision: pending.revision, expectedContentHash: pending.contentHash },
      epicId, reason: 'The delivered behavior is already represented by existing context.',
    }).change;
    expect(done.contextSync).toMatchObject({ status: 'not-required', epicId });
    expect(service.store.listEvents(done.id).map((event) => event.type).sort()).toEqual([
      'change.context.notrequired',
      'change.created',
      'change.delivery.completed',
    ]);
  });

  it('rejects a Context close-out without a pending delivery fact or rationale', () => {
    const service = new ChangeService(root());
    const linked = linkedChange(service);
    const epicId = linked.epicLink!.epicId;
    expect(() => service.markContextNotRequired({
      commandId: 'bad-close-out', actor: USER, changeId: linked.id,
      guard: { expectedRevision: linked.revision, expectedContentHash: linked.contentHash }, epicId, reason: ' ',
    })).toThrow('non-blank rationale');
  });
});
