import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { ActorRef } from '../contracts/common';
import { nowIso } from '../contracts/common';
import type { FoundationSnapshot } from '../contracts/foundation';
import {
  type Shape,
  type ShapeEvent,
  type ShapeOption,
  type ShapeStatus,
} from '../contracts/shape';
import { epicsRoot, scaffoldEpic, type ScaffoldEpicArgs, type ScaffoldEpicResult } from '../runs/EpicScaffold';
import { FoundationNotReadyError, ProjectFoundationService } from '../project/ProjectFoundationService';
import { renderShapeBrief } from './renderShapeBrief';
import { ShapeRevisionConflictError, ShapeStore } from './ShapeStore';

export interface ShapeReadiness {
  ready: boolean;
  blockers: string[];
}

export interface CreateShapeInput {
  id?: string;
  title: string;
  problem: string;
  desiredOutcome?: string;
  appetite?: string;
  constraints?: string[];
  actor?: ActorRef;
}

export interface ShapePatch {
  title?: string;
  problem?: string;
  desiredOutcome?: string;
  appetite?: string;
  constraints?: string[];
  options?: ShapeOption[];
  selectedApproach?: string;
  rationale?: string;
  risks?: string[];
  noGos?: string[];
  acceptanceCriteria?: string[];
  architectureImpact?: string;
  openQuestions?: string[];
  providerSession?: { providerId: string; sessionId: string } | undefined;
}

export interface ConvertShapeToEpicInput extends Omit<ScaffoldEpicArgs, 'workspaceRoot' | 'epicId' | 'title' | 'description' | 'shapeProvenance'> {
  epicId: string;
}

export interface ShapeEpicConversionResult {
  shape: Shape;
  scaffold: ScaffoldEpicResult;
  alreadyConverted: boolean;
}

export class ShapeStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShapeStateError';
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Hash the exact decision content, excluding write metadata and acceptance itself. */
export function hashShapeDecision(shape: Shape): string {
  const { acceptance: _acceptance, conversion: _conversion, createdAt: _createdAt, updatedAt: _updatedAt, ...decision } = shape;
  return crypto.createHash('sha256').update(stableJson(decision)).digest('hex');
}

function eventId(): string { return crypto.randomUUID(); }

function actorOrSystem(actor: ActorRef | undefined): ActorRef {
  return actor ?? { kind: 'system', id: 'aidlc-shapes' };
}

function nonBlank(values: string[]): string[] { return values.map((value) => value.trim()).filter(Boolean); }

/**
 * Coordinates Shape lifecycle. Human acceptance and Epic conversion are
 * explicit methods; generic agent patches never receive those capabilities.
 */
export class ShapeService {
  readonly foundation: ProjectFoundationService;
  readonly store: ShapeStore;

  constructor(
    readonly workspaceRoot: string,
    options: { clock?: () => string; foundation?: ProjectFoundationService; store?: ShapeStore } = {},
  ) {
    this.clock = options.clock ?? nowIso;
    this.foundation = options.foundation ?? new ProjectFoundationService(workspaceRoot, this.clock);
    this.store = options.store ?? new ShapeStore(workspaceRoot);
  }
  private readonly clock: () => string;

  /** Bind a ready Foundation when available; otherwise record an unbound placeholder. */
  private captureFoundationSnapshot(): FoundationSnapshot {
    const inspection = this.foundation.inspect();
    if (inspection.status === 'ready' && inspection.foundation) {
      return inspection.foundation;
    }
    return {
      revision: 0,
      contentHash: '0'.repeat(64),
      publishedAt: this.clock(),
    };
  }

  list(): Shape[] { return this.store.list(); }
  get(id: string): Shape | null { return this.store.load(id); }
  require(id: string): Shape { return this.store.require(id); }

  nextId(): string {
    const largest = this.list().reduce((max, shape) => Math.max(max, Number(shape.id.slice('SHAPE-'.length)) || 0), 0);
    return `SHAPE-${String(largest + 1).padStart(3, '0')}`;
  }

  create(input: CreateShapeInput): Shape {
    const foundation = this.captureFoundationSnapshot();
    const id = input.id?.trim() || this.nextId();
    if (!/^SHAPE-\d{3,}$/.test(id)) throw new ShapeStateError('Shape id must use SHAPE-nnn format.');
    if (this.store.load(id)) throw new ShapeStateError(`Shape ${id} already exists.`);
    const now = this.clock();
    const shape: Shape = {
      schemaVersion: 1,
      id,
      title: input.title.trim(),
      status: 'exploring',
      problem: input.problem.trim(),
      desiredOutcome: input.desiredOutcome?.trim() ?? '',
      appetite: input.appetite?.trim() ?? '',
      constraints: nonBlank(input.constraints ?? []),
      options: [],
      selectedApproach: '',
      rationale: '',
      risks: [],
      noGos: [],
      acceptanceCriteria: [],
      architectureImpact: '',
      openQuestions: [],
      foundation,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    this.store.save(shape, null);
    this.record(shape, 'created', actorOrSystem(input.actor));
    return shape;
  }

  patch(id: string, expectedRevision: number, patch: ShapePatch, actor: ActorRef): Shape {
    const current = this.require(id);
    this.assertPatchable(current);
    if (current.revision !== expectedRevision) throw new ShapeRevisionConflictError(id, expectedRevision, current.revision);
    const now = this.clock();
    const stateInvalidated = current.status === 'ready' || current.status === 'accepted';
    const next: Shape = {
      ...current,
      ...this.cleanPatch(patch),
      status: stateInvalidated ? 'exploring' : current.status,
      acceptance: stateInvalidated ? undefined : current.acceptance,
      updatedAt: now,
      revision: current.revision + 1,
    };
    this.store.save(next, current.revision);
    this.record(next, stateInvalidated ? 'reopened' : 'updated', actor, stateInvalidated ? 'Editing invalidated the previous readiness or acceptance.' : undefined);
    return next;
  }

  readiness(shapeOrId: Shape | string): ShapeReadiness {
    const shape = typeof shapeOrId === 'string' ? this.require(shapeOrId) : shapeOrId;
    const blockers: string[] = [];
    let currentFoundation: FoundationSnapshot;
    try {
      currentFoundation = this.foundation.requireReady();
      if (currentFoundation.revision !== shape.foundation.revision || currentFoundation.contentHash !== shape.foundation.contentHash) {
        blockers.push('Project Foundation changed after this Shape was started. Reopen the Shape against the current Foundation.');
      }
    } catch (error) {
      blockers.push(error instanceof FoundationNotReadyError ? error.message : 'Project Foundation is not ready.');
    }
    if (!shape.problem.trim()) blockers.push('Problem is required.');
    if (!shape.desiredOutcome.trim()) blockers.push('Desired outcome is required.');
    if (!shape.appetite.trim()) blockers.push('Appetite is required.');
    if (!shape.selectedApproach.trim()) blockers.push('Selected approach is required.');
    if (!shape.rationale.trim()) blockers.push('Approach rationale is required.');
    if (nonBlank(shape.noGos).length === 0) blockers.push('At least one no-go is required.');
    if (nonBlank(shape.acceptanceCriteria).length === 0) blockers.push('At least one acceptance criterion is required.');
    if (nonBlank(shape.openQuestions).length > 0) blockers.push('Resolve or explicitly remove all open questions.');
    return { ready: blockers.length === 0, blockers };
  }

  markReady(id: string, expectedRevision: number, actor: ActorRef): Shape {
    const current = this.require(id);
    if (current.revision !== expectedRevision) throw new ShapeRevisionConflictError(id, expectedRevision, current.revision);
    this.assertPatchable(current);
    const readiness = this.readiness(current);
    if (!readiness.ready) throw new ShapeStateError(`Shape is not ready: ${readiness.blockers.join(' ')}`);
    const next: Shape = { ...current, status: 'ready', updatedAt: this.clock(), revision: current.revision + 1 };
    this.store.save(next, current.revision);
    this.record(next, 'ready', actor);
    return next;
  }

  accept(id: string, expectedRevision: number, actor: ActorRef): Shape {
    if (actor.kind !== 'user') throw new ShapeStateError('Only a human user may accept a Shape.');
    const current = this.require(id);
    if (current.status !== 'ready') throw new ShapeStateError('Mark the Shape ready before accepting it.');
    if (current.revision !== expectedRevision) throw new ShapeRevisionConflictError(id, expectedRevision, current.revision);
    const readiness = this.readiness(current);
    if (!readiness.ready) throw new ShapeStateError(`Shape is no longer ready: ${readiness.blockers.join(' ')}`);
    const revision = current.revision + 1;
    const accepted: Shape = {
      ...current,
      status: 'accepted',
      updatedAt: this.clock(),
      revision,
      acceptance: undefined,
    };
    const next: Shape = {
      ...accepted,
      acceptance: { acceptedAt: accepted.updatedAt, acceptedBy: actor, acceptedRevision: revision, shapeHash: hashShapeDecision(accepted) },
    };
    this.store.save(next, current.revision);
    this.record(next, 'accepted', actor);
    return next;
  }

  reopen(id: string, expectedRevision: number, actor: ActorRef): Shape {
    if (actor.kind !== 'user') throw new ShapeStateError('Only a human user may reopen a Shape.');
    const current = this.require(id);
    if (current.status === 'converted') throw new ShapeStateError('A converted Shape is immutable; create a superseding Shape for a new decision.');
    if (current.revision !== expectedRevision) throw new ShapeRevisionConflictError(id, expectedRevision, current.revision);
    const next: Shape = { ...current, status: 'exploring', acceptance: undefined, updatedAt: this.clock(), revision: current.revision + 1 };
    this.store.save(next, current.revision);
    this.record(next, 'reopened', actor);
    return next;
  }

  shelve(id: string, expectedRevision: number, actor: ActorRef): Shape {
    if (actor.kind !== 'user') throw new ShapeStateError('Only a human user may shelve a Shape.');
    const current = this.require(id);
    if (current.status === 'converted') throw new ShapeStateError('A converted Shape cannot be shelved.');
    if (current.revision !== expectedRevision) throw new ShapeRevisionConflictError(id, expectedRevision, current.revision);
    const next: Shape = { ...current, status: 'shelved', updatedAt: this.clock(), revision: current.revision + 1 };
    this.store.save(next, current.revision);
    this.record(next, 'shelved', actor);
    return next;
  }

  /**
   * Crash-safe, idempotent conversion into the legacy Epic scaffold consumed
   * by today's extension UI. The accepted Shape remains the provenance source.
   */
  convertToEpic(id: string, expectedRevision: number, input: ConvertShapeToEpicInput, actor: ActorRef): ShapeEpicConversionResult {
    if (actor.kind !== 'user') throw new ShapeStateError('Only a human user may create an Epic from a Shape.');
    let current = this.require(id);
    if (current.revision !== expectedRevision) throw new ShapeRevisionConflictError(id, expectedRevision, current.revision);
    if (current.status === 'converted') {
      if (current.conversion?.epicId !== input.epicId) throw new ShapeStateError(`Shape ${id} was already converted to ${current.conversion?.epicId}.`);
      return { shape: current, scaffold: { epicDir: path.join(epicsRoot(this.workspaceRoot, input.doc), input.epicId), artifactsDir: path.join(epicsRoot(this.workspaceRoot, input.doc), input.epicId, 'artifacts') }, alreadyConverted: true };
    }
    if (current.status !== 'accepted' || !current.acceptance) throw new ShapeStateError('Accept the Shape before creating an Epic.');
    const acceptance = current.acceptance;
    const readiness = this.readiness(current);
    if (!readiness.ready) throw new ShapeStateError(`Shape is no longer current: ${readiness.blockers.join(' ')}`);

    const pending = current.conversion?.state === 'pending'
      ? current
      : {
        ...current,
        conversion: { epicId: input.epicId, state: 'pending' as const, startedAt: this.clock() },
        updatedAt: this.clock(),
        revision: current.revision + 1,
      };
    if (pending !== current) {
      this.store.save(pending, current.revision);
      this.record(pending, 'conversion-pending', actor, `Epic ${input.epicId}`);
      current = pending;
    }
    if (current.conversion?.epicId !== input.epicId) {
      throw new ShapeStateError(`Shape ${id} conversion is already pending for ${current.conversion?.epicId}.`);
    }

    const targetDir = path.join(epicsRoot(this.workspaceRoot, input.doc), input.epicId);
    let scaffold: ScaffoldEpicResult;
    if (fs.existsSync(targetDir)) {
      const inputsPath = path.join(targetDir, 'inputs.json');
      try {
        const existing = JSON.parse(fs.readFileSync(inputsPath, 'utf8')) as { source_shape?: { id?: unknown; acceptance_hash?: unknown } };
        if (existing.source_shape?.id !== current.id || existing.source_shape?.acceptance_hash !== acceptance.shapeHash) {
          throw new ShapeStateError(`Epic ${input.epicId} already exists and is not the pending conversion for Shape ${id}.`);
        }
        scaffold = { epicDir: targetDir, artifactsDir: path.join(targetDir, 'artifacts') };
      } catch (error) {
        if (error instanceof ShapeStateError) throw error;
        throw new ShapeStateError(`Epic ${input.epicId} already exists and cannot be verified as this Shape conversion.`);
      }
    } else {
      scaffold = scaffoldEpic({
        ...input,
        workspaceRoot: this.workspaceRoot,
        epicId: input.epicId,
        title: current.title,
        description: renderShapeBrief(current),
        shapeProvenance: {
          id: current.id,
          revision: acceptance.acceptedRevision,
          acceptanceHash: acceptance.shapeHash,
          foundation: current.foundation,
          brief: renderShapeBrief(current),
        },
      });
    }

    const reloaded = this.require(id);
    if (reloaded.status === 'converted') return { shape: reloaded, scaffold, alreadyConverted: true };
    if (reloaded.revision !== current.revision || reloaded.conversion?.state !== 'pending') {
      throw new ShapeRevisionConflictError(id, current.revision, reloaded.revision);
    }
    const converted: Shape = {
      ...reloaded,
      status: 'converted',
      conversion: { ...reloaded.conversion, state: 'completed', completedAt: this.clock() },
      updatedAt: this.clock(),
      revision: reloaded.revision + 1,
    };
    this.store.save(converted, reloaded.revision);
    this.record(converted, 'converted', actor, `Epic ${input.epicId}`);
    return { shape: converted, scaffold, alreadyConverted: false };
  }

  private cleanPatch(patch: ShapePatch): ShapePatch {
    const result: ShapePatch = {};
    for (const key of ['title', 'problem', 'desiredOutcome', 'appetite', 'selectedApproach', 'rationale', 'architectureImpact'] as const) {
      if (patch[key] !== undefined) result[key] = patch[key]!.trim();
    }
    for (const key of ['constraints', 'risks', 'noGos', 'acceptanceCriteria', 'openQuestions'] as const) {
      if (patch[key] !== undefined) result[key] = nonBlank(patch[key]!);
    }
    if (patch.options !== undefined) {
      result.options = patch.options.map((option) => ({
        id: option.id.trim(), title: option.title.trim(), summary: option.summary.trim(), tradeoffs: nonBlank(option.tradeoffs),
      }));
    }
    if (patch.providerSession !== undefined) result.providerSession = patch.providerSession;
    return result;
  }

  private assertPatchable(shape: Shape): void {
    if (shape.status === 'converted') throw new ShapeStateError('A converted Shape is immutable; create a superseding Shape.');
    if (shape.status === 'shelved') throw new ShapeStateError('Reopen a shelved Shape before editing it.');
  }

  private record(shape: Shape, type: ShapeEvent['type'], actor: ActorRef, detail?: string): void {
    this.store.appendEvent(shape.id, { id: eventId(), at: this.clock(), type, actor, revision: shape.revision, detail });
  }
}
