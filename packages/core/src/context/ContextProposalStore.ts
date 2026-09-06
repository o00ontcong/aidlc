/**
 * Filesystem repository for `ContextProposal` — `.aidlc/context-proposals/<CP-id>/`:
 * `proposal.json` (CAS-guarded — operations/groups live inline per the
 * locked contract, §18.2), `objects/<hash>.json` (new content objects this
 * proposal introduces, isolated from canonical `.aidlc/context/objects`
 * until Apply), `approvals/APR-*.json` and `events/EVT-*.json` (immutable).
 *
 * Mirrors `change/ChangeStore.ts`'s split from `ContextProposalService.ts`
 * (business rules) for the same reason: this file is CAS + layout only.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  isContextProposalId,
  toContextProposalId,
  type ContextProposalId,
} from '../contracts/ids';
import {
  parseContextProposal,
  parseContextProposalApproval,
  type ContextProposal,
  type ContextProposalApproval,
} from '../contracts/contextProposal';
import { parseDomainEvent, type DomainEvent } from '../contracts/domainEvent';
import { createJsonFileIfAbsent, listJsonFileNames, readJsonFile } from '../storage/atomicJson';
import { AggregateConflictError, mutateAggregateFile, type VersionGuard } from '../storage/WorkspaceTransaction';

const AIDLC_DIR = '.aidlc';
const PROPOSALS_DIR = 'context-proposals';
const PROPOSAL_FILE = 'proposal.json';
const OBJECTS_DIR = 'objects';
const APPROVALS_DIR = 'approvals';
const EVENTS_DIR = 'events';

const proposalAccessor = {
  parse: parseContextProposal,
  getRevision: (proposal: ContextProposal) => proposal.revision,
  getContentHash: (proposal: ContextProposal) => proposal.contentHash,
};

export class ContextProposalStore {
  constructor(readonly workspaceRoot: string) {}

  proposalsRoot(): string {
    return path.join(this.workspaceRoot, AIDLC_DIR, PROPOSALS_DIR);
  }
  proposalDir(id: ContextProposalId): string {
    return path.join(this.proposalsRoot(), id);
  }
  proposalFile(id: ContextProposalId): string {
    return path.join(this.proposalDir(id), PROPOSAL_FILE);
  }
  objectsDir(id: ContextProposalId): string {
    return path.join(this.proposalDir(id), OBJECTS_DIR);
  }
  objectFile(id: ContextProposalId, hash: string): string {
    return path.join(this.objectsDir(id), `${hash}.json`);
  }
  approvalsDir(id: ContextProposalId): string {
    return path.join(this.proposalDir(id), APPROVALS_DIR);
  }
  approvalFile(id: ContextProposalId, approvalId: string): string {
    return path.join(this.approvalsDir(id), `${approvalId}.json`);
  }
  eventsDir(id: ContextProposalId): string {
    return path.join(this.proposalDir(id), EVENTS_DIR);
  }
  eventFile(id: ContextProposalId, eventId: string): string {
    return path.join(this.eventsDir(id), `${eventId}.json`);
  }

  list(): ContextProposal[] {
    if (!fs.existsSync(this.proposalsRoot())) return [];
    return fs
      .readdirSync(this.proposalsRoot())
      .filter((name) => isContextProposalId(name))
      .map((name) => this.read(toContextProposalId(name)))
      .filter((proposal): proposal is ContextProposal => proposal !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  read(id: ContextProposalId): ContextProposal | null {
    const raw = readJsonFile<unknown>(this.proposalFile(id));
    return raw === undefined ? null : parseContextProposal(raw);
  }

  require(id: ContextProposalId): ContextProposal {
    const proposal = this.read(id);
    if (!proposal) throw new AggregateConflictError('proposal.not_found', `Context Proposal ${id} was not found.`);
    return proposal;
  }

  create(id: ContextProposalId, build: () => ContextProposal): ContextProposal {
    return mutateAggregateFile(this.proposalFile(id), proposalAccessor, 'create', build, { errorDomain: 'proposal', displayId: `Context Proposal ${id}` }).next;
  }

  update(id: ContextProposalId, guard: VersionGuard, mutate: (current: ContextProposal) => ContextProposal): ContextProposal {
    return mutateAggregateFile(this.proposalFile(id), proposalAccessor, guard, (current) => mutate(current as ContextProposal), {
      errorDomain: 'proposal',
      displayId: `Context Proposal ${id}`,
    }).next;
  }

  readObject<T = unknown>(id: ContextProposalId, hash: string): T | null {
    const raw = readJsonFile<T>(this.objectFile(id, hash));
    return raw === undefined ? null : raw;
  }

  writeObjectIfAbsent(id: ContextProposalId, hash: string, value: unknown): { created: boolean } {
    return createJsonFileIfAbsent(this.objectFile(id, hash), value);
  }

  listApprovals(id: ContextProposalId): ContextProposalApproval[] {
    return listJsonFileNames(this.approvalsDir(id)).map((name) => parseContextProposalApproval(readJsonFile(path.join(this.approvalsDir(id), name))));
  }

  writeApproval(id: ContextProposalId, approval: ContextProposalApproval): void {
    createJsonFileIfAbsent(this.approvalFile(id, approval.id), approval);
  }

  listEvents(id: ContextProposalId): DomainEvent[] {
    return listJsonFileNames(this.eventsDir(id))
      .map((name) => parseDomainEvent(readJsonFile(path.join(this.eventsDir(id), name))))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  findEventByCommandId(id: ContextProposalId, commandId: string): DomainEvent | null {
    for (const name of listJsonFileNames(this.eventsDir(id))) {
      const raw = readJsonFile<unknown>(path.join(this.eventsDir(id), name));
      if (raw === undefined) continue;
      const event = parseDomainEvent(raw);
      if (event.commandId === commandId) return event;
    }
    return null;
  }

  appendEvent(id: ContextProposalId, event: DomainEvent): void {
    createJsonFileIfAbsent(this.eventFile(id, event.id), event);
  }
}
