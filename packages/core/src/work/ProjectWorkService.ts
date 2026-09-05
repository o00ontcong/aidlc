import * as fs from 'fs';
import * as path from 'path';

import { nowIso } from '../contracts/common';
import {
  normalizeWorkItemEpicId,
  parseWorkItem,
  type WorkItem,
  type WorkItemContextRef,
  type WorkItemImpact,
  type WorkItemContextPatch,
  type WorkItemPriority,
  type WorkItemRequirement,
  type WorkItemStatus,
} from '../contracts/workItem';
import type { EpicType } from '../contracts/epic';
import { writeFileAtomic } from '../epic/EpicStore';

const WORK_ITEMS_DIR = '.aidlc/work-items';

export class WorkItemRevisionConflictError extends Error {
  constructor(readonly id: string, readonly expectedRevision: number, readonly actualRevision: number) {
    super(`Work item ${id} changed (expected revision ${expectedRevision}, actual ${actualRevision}).`);
    this.name = 'WorkItemRevisionConflictError';
  }
}

export class WorkItemAlreadyExistsError extends Error {
  constructor(readonly id: string) {
    super(`Work item ${id} already exists.`);
    this.name = 'WorkItemAlreadyExistsError';
  }
}

export interface CreateWorkItemInput {
  id: string;
  title: string;
  type: EpicType;
  requirement: WorkItemRequirement;
  priority?: WorkItemPriority;
  context?: WorkItemContextRef;
}

export interface UpdateWorkItemInput {
  title?: string;
  type?: EpicType;
  priority?: WorkItemPriority;
  status?: WorkItemStatus;
  requirement?: WorkItemRequirement;
  context?: WorkItemContextRef;
}

export interface ImpactProposal {
  contextIds: string[];
  symbols?: string[];
  risks?: string[];
}

/**
 * Project backlog stored independently from Discover's global blueprint.
 * A work item is the human-facing request; an Epic is its delivery vehicle.
 * This prevents a new feature or maintenance request from rewriting product
 * history just to get into the implementation workflow.
 */
export class ProjectWorkService {
  constructor(readonly workspaceRoot: string, private readonly clock: () => string = nowIso) {}

  root(): string { return path.join(this.workspaceRoot, WORK_ITEMS_DIR); }
  file(id: string): string { return path.join(this.root(), `${id}.json`); }

  list(): WorkItem[] {
    if (!fs.existsSync(this.root())) { return []; }
    return fs.readdirSync(this.root())
      .filter((name) => name.endsWith('.json'))
      .map((name) => parseWorkItem(JSON.parse(fs.readFileSync(path.join(this.root(), name), 'utf8'))))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  load(id: string): WorkItem | null {
    const file = this.file(id);
    return fs.existsSync(file) ? parseWorkItem(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
  }

  require(id: string): WorkItem {
    const item = this.load(id);
    if (!item) { throw new Error(`Unknown work item ${id}.`); }
    return item;
  }

  create(input: CreateWorkItemInput): WorkItem {
    const id = input.id.trim().toUpperCase();
    if (!/^WORK-[A-Z0-9][A-Z0-9-]*$/.test(id)) { throw new Error('Work item id must match WORK-<SLUG>.'); }
    if (this.load(id)) { throw new WorkItemAlreadyExistsError(id); }
    const at = this.clock();
    const item = parseWorkItem({
      schemaVersion: 1,
      id,
      title: input.title.trim(),
      type: input.type,
      priority: input.priority ?? 'normal',
      status: 'draft',
      requirement: input.requirement,
      context: input.context,
      impact: { status: 'not-analyzed', contextIds: [], symbols: [], risks: [] },
      createdAt: at,
      updatedAt: at,
      revision: 0,
    });
    this.save(item);
    return item;
  }

  /** Store an impact proposal; it remains non-deliverable until a human confirms it. */
  proposeImpact(id: string, proposal: ImpactProposal, expectedRevision: number): WorkItem {
    const current = this.assertRevision(id, expectedRevision);
    const impact: WorkItemImpact = {
      status: 'proposed',
      contextIds: [...new Set(proposal.contextIds.map((value) => value.trim()).filter(Boolean))],
      symbols: [...new Set((proposal.symbols ?? []).map((value) => value.trim()).filter(Boolean))],
      risks: [...new Set((proposal.risks ?? []).map((value) => value.trim()).filter(Boolean))],
      analyzedAt: this.clock(),
    };
    return this.saveNext(current, { impact, status: 'draft' });
  }

  /** A delivery Epic must be scoped to at least one confirmed Project Context node. */
  confirmImpact(id: string, expectedRevision: number): WorkItem {
    const current = this.assertRevision(id, expectedRevision);
    if (current.impact.status !== 'proposed' || current.impact.contextIds.length === 0) {
      throw new Error(`Work item ${current.id} needs at least one proposed context reference before impact can be confirmed.`);
    }
    return this.saveNext(current, {
      impact: { ...current.impact, status: 'confirmed', confirmedAt: this.clock() },
      status: 'ready',
    });
  }

  update(id: string, patch: UpdateWorkItemInput, expectedRevision: number): WorkItem {
    const current = this.require(id);
    if (current.revision !== expectedRevision) {
      throw new WorkItemRevisionConflictError(current.id, expectedRevision, current.revision);
    }
    if (patch.status === 'ready' && current.impact.status !== 'confirmed') {
      throw new Error(`Work item ${current.id} must confirm its impact before becoming ready.`);
    }
    const next = parseWorkItem({
      ...current,
      ...patch,
      title: patch.title === undefined ? current.title : patch.title.trim(),
      updatedAt: this.clock(),
      revision: current.revision + 1,
    });
    this.save(next);
    return next;
  }

  /** Attach one immutable delivery Epic and move the request into active work. */
  attachEpic(id: string, epicId: string, expectedRevision: number): WorkItem {
    const current = this.assertRevision(id, expectedRevision);
    if (current.impact.status !== 'confirmed') {
      throw new Error(`Work item ${current.id} must confirm its impact before creating an Epic.`);
    }
    const normalizedEpicId = normalizeWorkItemEpicId(epicId);
    if (current.epicId && current.epicId !== normalizedEpicId) {
      throw new Error(`Work item ${current.id} is already linked to ${current.epicId}. Create a follow-up work item instead.`);
    }
    return this.saveNext(current, {
      epicId: normalizedEpicId,
      status: current.status === 'completed' || current.status === 'cancelled' ? current.status : 'active',
    });
  }

  /** Delivery proposes a narrow context patch; publishing it is a separate human decision. */
  proposeContextPatch(id: string, patch: Omit<WorkItemContextPatch, 'status' | 'createdAt'>, expectedRevision: number): WorkItem {
    const current = this.assertRevision(id, expectedRevision);
    if (!current.epicId) { throw new Error(`Work item ${current.id} has no delivery Epic to produce a context patch.`); }
    return this.saveNext(current, {
      contextPatch: { ...patch, status: 'proposed', createdAt: this.clock() },
    });
  }

  private assertRevision(id: string, expectedRevision: number): WorkItem {
    const current = this.require(id);
    if (current.revision !== expectedRevision) {
      throw new WorkItemRevisionConflictError(current.id, expectedRevision, current.revision);
    }
    return current;
  }

  private saveNext(current: WorkItem, patch: Partial<WorkItem>): WorkItem {
    const next = parseWorkItem({
      ...current,
      ...patch,
      updatedAt: this.clock(),
      revision: current.revision + 1,
    });
    this.save(next);
    return next;
  }

  private save(item: WorkItem): void {
    fs.mkdirSync(this.root(), { recursive: true });
    writeFileAtomic(this.file(item.id), `${JSON.stringify(item, null, 2)}\n`);
  }
}
