/**
 * Host-side plumbing for the Discover tab.
 *
 * The webview never reads a file: this module turns what is on disk (the
 * Markdown docs plus `.aidlc/discover/`) into one plain payload, and turns the
 * webview's intents back into `DiscoverService` calls. Keeping it out of
 * `workspaceWebview.ts` keeps that switch statement readable — the Ideas tab's
 * 250 lines in there are exactly what this avoids repeating.
 */

import * as fs from 'fs';
import * as path from 'path';

import { discoverRepoChangeCount, discoverRepoIsDirty } from './discoverGitCommit';
import { suggestNextEpicId, formatSequencedEpicId } from './suggestNextEpicId';
import {
  resolveCofofoPipelineId,
  CofofoFoundationService,
  DiscoverService,
  DISCOVER_STEPS,
  DOC_FEATURES,
  DOC_REQUIREMENTS,
  getFileSpec,
  getPhase,
  isStepEmpty,
  itemBody,
  extractIds,
  listPhases,
  normalizeStep,
  proseSectionKeyOf,
  DiscoverContextPublisher,
  ProjectWorkService,
  DISCOVER_CODE_INDEX_PATH,
  parseDetailFields,
  scaffoldEpic,
  suggestEpics,
  findEpicSuggestion,
  classifyPhaseWork,
  classifyItemCoverage,
  suggestRecipeForPhase,
  WorkspaceLoader,
  DISCOVER_HANDOFF_RECIPE_IDS,
  type CofofoRecipeId,
  type DiscoverHandoff,
  type DiscoverPhase,
  type DiscoverScope,
  type BlueprintContext,
  type DiscoverIndex,
  type DiscoverRun,
  type DiscoverStepId,
  type DocModel,
  type EpicSuggestion,
  type DiscoverItemCoverage,
  type DiscoverCodeIndex,
  type WorkItem,
} from '@aidlc/core';
import { readYaml, writeYaml } from './yamlIO';

export interface DiscoverItemUi {
  id: string;
  text: string;
  description?: string;
  origin: 'ai' | 'human';
  pinned: boolean;
  flagged: boolean;
  detail?: DiscoverItemDetailUi;
}

/** Structured detail shown from the small “Chi tiết” action in steps 3 and 4. */
export interface DiscoverItemDetailUi {
  kind: 'requirement' | 'feature';
  status: 'draft' | 'review' | 'ready' | 'deprecated';
  fields: Record<string, string[]>;
  contextPreview?: { estimatedTokens: number; discoverRevision?: string };
  /** Canonical Markdown source for the dialog's edit form. */
  editable?: { docPath: string; section: string; revision: number; description: string; updatedAt?: string; origin: 'ai' | 'human' };
  readiness: { required: string[]; missing: string[] };
  links: { references: string[]; coveringFeatureIds: string[]; coveredRequirementIds: string[] };
  evidence: {
    status: 'planned' | 'implemented' | 'stale' | 'orphaned' | 'conflict';
    sourcePaths: string[];
    testPaths: string[];
    entryPoints: string[];
    sourceFileCount: number;
    discoverRevision?: string;
    sourceCommit?: string | null;
  };
  publication: {
    status: 'missing' | 'draft' | 'ready' | 'stale' | 'conflict';
    nextAction: string;
    discoverRevision?: string;
    title?: string;
    publishedAt?: string;
    sourceCommit?: string | null;
    dirty?: boolean;
  };
  history: Array<{
    discoverRevision: string;
    publishedAt: string;
    changeType: string;
    changedFields: string[];
    summary: string;
    reason: string;
    breaking: boolean;
    actor: { kind: string; id: string };
    source?: { taskId?: string; jiraKey?: string; runId?: string; command?: string };
    beforeHash: string | null;
    afterHash: string;
    before?: { title: string; status: 'draft' | 'review' | 'ready' | 'deprecated'; fields: Record<string, string[]> };
    after?: { title: string; status: 'draft' | 'review' | 'ready' | 'deprecated'; fields: Record<string, string[]> };
  }>;
}

export interface DiscoverRecordUi {
  id: string;
  title: string;
  fields: { label: string; value: string; items: string[] }[];
  origin: 'ai' | 'human';
  pinned: boolean;
  flagged: boolean;
}

export interface DiscoverSectionUi {
  key: string;
  heading: string;
  kind: string;
  /** Spec metadata the editor needs to offer the right "add" affordance. */
  idPrefix?: string;
  grouped?: boolean;
  hint?: string;
  fields?: { label: string; list?: boolean; required?: boolean }[];
  prose: string;
  items: DiscoverItemUi[];
  records: DiscoverRecordUi[];
  /** Lines the parser could not read as items — surfaced, never dropped. */
  stray: number;
}

export interface DiscoverDocUi {
  path: string;
  title: string;
  exists: boolean;
  /** Absolute path, so "open in editor" needs no second lookup. */
  filePath: string;
  step: DiscoverStepId;
  /** Raw Markdown, so the tab can show and edit the file itself, not only a rendering of it. */
  raw: string;
  sections: DiscoverSectionUi[];
  updatedAt?: string;
  lastRunId?: string;
}

export interface DiscoverStepUi {
  id: DiscoverStepId;
  order: number;
  label: string;
  labelVi?: string;
  goal: string;
  files: string[];
  /** The only user-facing step state: docs already have content, or they do not. */
  hasContent: boolean;
}

export interface DiscoverPhaseUi extends DiscoverPhase {
  /** What the tab pre-selects in the recipe picker; the human still confirms. */
  suggestedRecipe: CofofoRecipeId;
  /** Set once this phase has become an epic. */
  handoff?: DiscoverHandoff;
  /** Cited features (or skeleton) already exist on disk — do not offer a new implement-epic. */
  alreadyBuilt?: boolean;
  /** Sample of matching source paths that justified `alreadyBuilt`. */
  builtFiles?: string[];
  searchTokens?: string[];
  missingFeatureIds?: string[];
  scannedFileCount?: number;
}

export interface DiscoverUi {
  id: string;
  title: string;
  seedSentence: string;
  docsRoot: string;
  docsRootPath: string;
  outputLanguage: 'en' | 'vi';
  /**
   * Which repos this blueprint describes, once declared. Surfaced so the tab
   * can show what a scan is actually scoped to — an undeclared scope is why a
   * scan on a parent repo used to describe the wrong thing.
   */
  scope?: DiscoverScope;
  currentStep: DiscoverStepId;
  revision: number;
  steps: DiscoverStepUi[];
  docs: DiscoverDocUi[];
  devDocs: { path: string; exists: boolean; filePath: string }[];
  extraFiles: Record<string, string[]>;
  issues: { level: string; code: string; message: string; file?: string; id?: string }[];
  /** Pre-filled epic proposals from docs ↔ code reconciliation (Kiểm tra panel). */
  epicSuggestions: EpicSuggestion[];
  /** Per-FR / feature / screen inventory for steps 3, 4 and 6. */
  itemCoverage: DiscoverItemCoverage & { items: Array<DiscoverItemCoverage['items'][number] & { detail?: DiscoverItemDetailUi }> };
  /** Latest publish state; Discover Markdown remains editable regardless of this state. */
  context: {
    status: 'missing' | 'draft' | 'ready' | 'stale' | 'conflict';
    discoverRevision?: string;
    publishedAt?: string;
    title?: string;
    description?: string;
    nextAction: string;
    /** Project-level Publish Context revisions (newest first). */
    publishHistory: Array<{
      discoverRevision: string;
      parentRevision: string | null;
      publishedAt: string;
      title: string;
      description: string;
      reason: string;
      eventCount: number;
      entityIds: string[];
      sourceCommit: string | null;
      isCurrent: boolean;
    }>;
    /** Live vs last publish — what Publish Context would lock in. */
    publishDiff: {
      hasPrevious: boolean;
      previousRevision: string | null;
      previousTitle: string | null;
      unchanged: boolean;
      documents: Array<{ path: string; change: 'added' | 'updated' | 'removed' }>;
      entities: Array<{
        id: string;
        kind: 'requirement' | 'feature' | 'other';
        change: 'created' | 'updated' | 'removed' | 'deprecated' | 'relinked';
        title: string;
        beforeTitle?: string;
        changedFields: string[];
        status: 'draft' | 'review' | 'ready' | 'deprecated';
        beforeStatus?: 'draft' | 'review' | 'ready' | 'deprecated';
      }>;
      rules: Array<{ id: string; change: 'added' | 'updated' | 'removed'; text?: string; beforeText?: string }>;
      source: {
        changed: boolean;
        previousCommit: string | null;
        currentCommit: string | null;
        dirty: boolean;
        changedPaths: string[];
      };
    };
  };
  /** Feature, bug and maintenance requests; each is promoted to an Epic separately. */
  workItems: WorkItem[];
  runs: DiscoverRun[];
  /** Three-pass scan campaign, when one exists. */
  scanCampaign?: { status: 'active' | 'done'; lastKeptPass: 0 | 1 | 2 | 3 };
  /** Implementation Plan phases, each one a candidate epic. */
  phases: DiscoverPhaseUi[];
  /** The run still owing a verdict, with its diff resolved to readable rows. */
  activeRun?: {
    run: DiscoverRun;
    added: DiscoverDiffRowUi[];
    updated: DiscoverDiffRowUi[];
    removed: DiscoverDiffRowUi[];
  };
  /** Whether the commit-target repo has local git changes. */
  hasUncommittedChanges: boolean;
  /** Count of changed paths in the commit-target repo. */
  uncommittedChangeCount: number;
}

export interface DiscoverDiffRowUi {
  key: string;
  file: string;
  id: string;
  /** Current text, or the snapshot's text for a removed entry. */
  text: string;
  /** Previous text for an updated entry. */
  before?: string;
}

type DetailKind = DiscoverItemDetailUi['kind'];
type DetailFieldMap = Record<string, string[]>;

function currentEntityStatus(fields: DetailFieldMap, fallback: DiscoverItemDetailUi['status']): DiscoverItemDetailUi['status'] {
  const value = fields.status?.join(' ').trim().toLowerCase();
  if (value === 'ready') { return 'ready'; }
  if (value === 'review' || value === 'in review') { return 'review'; }
  if (value === 'deprecated') { return 'deprecated'; }
  return fallback;
}

function detailReadiness(kind: DetailKind, fields: DetailFieldMap, references: string[]): { required: string[]; missing: string[] } {
  const required = kind === 'requirement'
    ? ['Statement', 'Rationale / user value', 'Acceptance criteria', 'Verification', 'Owner']
    : ['Problem', 'Desired outcome', 'In scope', 'Definition of Done', 'Owner', 'Linked requirement'];
  const hasAny = (...keys: string[]) => keys.some((key) => (fields[key] ?? []).some((value) => value.trim().length > 0));
  const candidates = kind === 'requirement'
    ? [
      ['Statement', ['statement']],
      ['Rationale / user value', ['rationale', 'user value']],
      ['Acceptance criteria', ['acceptance criteria', 'acceptance criterion']],
      ['Verification', ['verification', 'verification method']],
      ['Owner', ['owner']],
    ] as const
    : [
      ['Problem', ['problem']],
      ['Desired outcome', ['desired outcome', 'outcome']],
      ['In scope', ['in scope', 'scope']],
      ['Definition of Done', ['definition of done', 'dod']],
      ['Owner', ['owner']],
      ['Linked requirement', []],
    ] as const;
  return {
    required,
    missing: candidates
      .filter(([, keys]) => keys.length > 0 ? !hasAny(...keys) : !references.some((id) => id.startsWith('FR-') || id.startsWith('NFR-')))
      .map(([label]) => label),
  };
}

function loadCodeIndex(root: string): DiscoverCodeIndex | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, DISCOVER_CODE_INDEX_PATH), 'utf8')) as DiscoverCodeIndex;
    return data.schemaVersion === 1 && Array.isArray(data.entries) ? data : undefined;
  } catch {
    return undefined;
  }
}

function fallbackEvidenceStatus(status: DiscoverItemCoverage['items'][number]['status'] | undefined): DiscoverItemDetailUi['evidence']['status'] {
  if (status === 'in-code') { return 'implemented'; }
  if (status === 'stale') { return 'stale'; }
  return 'planned';
}

function entryText(doc: DocModel | undefined, id: string): string | undefined {
  if (!doc) { return undefined; }
  const proseSectionKey = proseSectionKeyOf(id);
  if (proseSectionKey !== undefined) {
    return doc.sections.find((s) => s.key === proseSectionKey)?.prose;
  }
  for (const section of doc.sections) {
    const item = section.items.find((i) => i.id === id);
    if (item) { return itemBody(item); }
    const record = section.records.find((r) => r.id === id);
    if (record) { return record.title || record.fields.map((f) => `${f.label}: ${f.value}`).join(' · '); }
  }
  return undefined;
}

function diffRows(
  keys: string[],
  after: BlueprintContext,
  before: BlueprintContext,
  kind: 'added' | 'updated' | 'removed',
): DiscoverDiffRowUi[] {
  return keys.map((key) => {
    const [file, id] = key.split('#') as [string, string];
    const now = entryText(after.docs.get(file), id);
    const was = entryText(before.docs.get(file), id);
    return {
      key,
      file,
      id,
      text: (kind === 'removed' ? was : now) ?? '',
      before: kind === 'updated' ? was : undefined,
    };
  });
}

function toDocUi(
  service: DiscoverService,
  index: DiscoverIndex,
  ctx: BlueprintContext,
  docPath: string,
  details: Map<string, DiscoverItemDetailUi>,
): DiscoverDocUi {
  const doc = ctx.docs.get(docPath)!;
  const step = DISCOVER_STEPS.find((s) => s.files.some((f) => f.path === docPath))!;
  const meta = index.docs[docPath];
  const flagsFor = (id: string) => {
    const itemMeta = index.items[`${docPath}#${id}`];
    return {
      origin: itemMeta?.origin ?? 'human',
      pinned: itemMeta?.pinned ?? false,
      flagged: itemMeta?.flagged ?? false,
    } as const;
  };
  const specByKey = new Map((getFileSpec(docPath)?.sections ?? []).map((sec) => [sec.key, sec]));
  return {
    path: docPath,
    title: doc.title,
    exists: doc.exists,
    filePath: service.docFile(docPath, index),
    step: step.id,
    raw: service.readRaw(docPath, index),
    updatedAt: meta?.updatedAt,
    lastRunId: meta?.lastRunId,
    sections: doc.sections.map((section) => ({
      key: section.key,
      heading: section.heading,
      kind: section.kind,
      idPrefix: specByKey.get(section.key)?.idPrefix,
      grouped: specByKey.get(section.key)?.grouped,
      hint: specByKey.get(section.key)?.hint,
      fields: specByKey.get(section.key)?.fields?.map((f) => ({ label: f.label, list: f.list, required: f.required })),
      prose: section.prose,
      stray: section.stray.length,
      items: section.items.map((item) => ({
        id: item.id,
        text: item.text,
        description: item.description,
        ...flagsFor(item.id),
        ...(details.has(item.id) ? { detail: details.get(item.id) } : {}),
      })),
      records: section.records.map((record) => ({
        id: record.id,
        title: record.title,
        fields: record.fields.map((f) => ({ label: f.label, value: f.value, items: f.items })),
        ...flagsFor(record.id),
      })),
    })),
  };
}

/** Everything the Discover tab renders, or `undefined` when no blueprint exists yet. */
export function buildDiscoverUi(root: string): DiscoverUi | undefined {
  const service = new DiscoverService(root);
  const index = service.load();
  if (!index) { return undefined; }
  const ctx = service.readBlueprint(index);
  const docsRootPath = service.docsRoot(index);
  const publisher = new DiscoverContextPublisher(root);
  const contextInspection = publisher.inspect();
  const entityById = new Map((contextInspection.context?.entities ?? []).map((entity) => [entity.id, entity]));
  const itemCoverage = classifyItemCoverage({
    workspaceRoot: root,
    ctx,
    index,
    scope: service.declaredScope(),
  });
  const coverageById = new Map(itemCoverage.items.map((item) => [item.id, item]));
  const codeIndex = loadCodeIndex(root);
  const codeEvidenceById = new Map(codeIndex?.entries.map((entry) => [entry.id, entry]) ?? []);
  const detailById = new Map<string, DiscoverItemDetailUi>();
  for (const doc of ctx.docs.values()) {
    for (const section of doc.sections) {
      for (const item of section.items) {
        const kind: DetailKind | undefined = doc.path === DOC_FEATURES
          ? 'feature'
          : doc.path === DOC_REQUIREMENTS ? 'requirement' : undefined;
        if (!kind) { continue; }
        const publishedEntity = entityById.get(item.id);
        const fields = parseDetailFields(item.description);
        const references = extractIds(`${item.text}\n${item.description ?? ''}`).filter((id) => id !== item.id).sort();
        const coverage = coverageById.get(item.id);
        const codeEvidence = codeEvidenceById.get(item.id);
        const itemMeta = index.items[`${doc.path}#${item.id}`];
        detailById.set(item.id, {
          kind,
          status: currentEntityStatus(fields, publishedEntity?.status ?? 'draft'),
          fields,
          editable: {
            docPath: doc.path,
            section: section.key,
            revision: index.revision,
            description: item.description ?? '',
            updatedAt: itemMeta?.updatedAt,
            origin: itemMeta?.origin ?? 'human',
          },
          readiness: detailReadiness(kind, fields, references),
          links: {
            references,
            coveringFeatureIds: coverage?.coveringFeatureIds ?? [],
            coveredRequirementIds: coverage?.coveredFrIds ?? [],
          },
          evidence: {
            status: codeEvidence?.status ?? fallbackEvidenceStatus(coverage?.status),
            sourcePaths: codeEvidence?.paths ?? coverage?.matchedFiles ?? [],
            testPaths: codeEvidence?.testPaths ?? [],
            entryPoints: codeEvidence?.entryPoints ?? [],
            sourceFileCount: itemCoverage.sourceFileCount,
            ...(codeIndex ? { discoverRevision: codeIndex.discoverRevision, sourceCommit: codeIndex.sourceCommit } : {}),
          },
          publication: {
            status: contextInspection.status,
            nextAction: contextInspection.nextAction,
            ...(contextInspection.context ? {
              discoverRevision: contextInspection.context.discoverRevision,
              publishedAt: contextInspection.context.publishedAt,
              sourceCommit: contextInspection.context.sourceCommit,
              dirty: contextInspection.context.dirty,
              ...(contextInspection.context.title ? { title: contextInspection.context.title } : {}),
            } : {}),
          },
          ...(publishedEntity ? {
            contextPreview: {
              estimatedTokens: Math.ceil(JSON.stringify(publishedEntity).length / 4),
              ...(contextInspection.context ? { discoverRevision: contextInspection.context.discoverRevision } : {}),
            },
          } : {}),
          history: publisher.historyDetailsFor(item.id).map(({ event, before, after }) => ({
            discoverRevision: event.discoverRevision,
            publishedAt: event.publishedAt,
            changeType: event.changeType,
            changedFields: event.changedFields,
            summary: event.summary,
            reason: event.reason,
            breaking: event.breaking,
            actor: event.actor,
            source: event.source,
            beforeHash: event.beforeHash,
            afterHash: event.afterHash,
            before,
            after,
          })),
        });
      }
    }
  }

  const active = service.activeRun(index);
  let activeRun: DiscoverUi['activeRun'];
  if (active && (active.status === 'running' || active.status === 'review')) {
    const before = fs.existsSync(service.snapshotDir(active.id))
      ? service.readSnapshot(active.id, index)
      : undefined;
    activeRun = {
      run: active,
      added: before ? diffRows(active.diff.added, ctx, before, 'added') : [],
      updated: before ? diffRows(active.diff.updated, ctx, before, 'updated') : [],
      removed: before ? diffRows(active.diff.removed, ctx, before, 'removed') : [],
    };
  }

  return {
    id: index.id,
    title: index.title,
    seedSentence: index.seedSentence,
    docsRoot: index.docsRoot,
    docsRootPath,
    outputLanguage: index.outputLanguage,
    scope: service.declaredScope(),
    hasUncommittedChanges: discoverRepoIsDirty(root, service.declaredScope()),
    uncommittedChangeCount: discoverRepoChangeCount(root, service.declaredScope()),
    currentStep: index.currentStep,
    revision: index.revision,
    steps: DISCOVER_STEPS.map((step) => ({
      id: step.id,
      order: step.order,
      label: step.label,
      labelVi: step.labelVi,
      goal: step.goal,
      files: step.files.map((f) => f.path),
      hasContent: !isStepEmpty(ctx, step.id),
    })),
    docs: [...ctx.docs.keys()].map((docPath) => toDocUi(service, index, ctx, docPath, detailById)),
    devDocs: DEV_DOCS.map((rel) => ({
      path: rel,
      filePath: path.join(docsRootPath, rel),
      exists: fs.existsSync(path.join(docsRootPath, rel)),
    })),
    extraFiles: ctx.extraFiles,
    issues: service.validate(ctx),
    epicSuggestions: suggestEpics({
      workspaceRoot: root,
      ctx,
      index,
      scope: service.declaredScope(),
    }),
    itemCoverage: {
      ...itemCoverage,
      items: itemCoverage.items.map((item) => ({
        ...item,
        ...(detailById.has(item.id) ? { detail: detailById.get(item.id) } : {}),
      })),
    },
    context: {
      status: contextInspection.status,
      ...(contextInspection.context ? {
        discoverRevision: contextInspection.context.discoverRevision,
        publishedAt: contextInspection.context.publishedAt,
        ...(contextInspection.context.title ? { title: contextInspection.context.title } : {}),
        ...(contextInspection.context.description ? { description: contextInspection.context.description } : {}),
      } : {}),
      nextAction: contextInspection.nextAction,
      publishHistory: publisher.listPublishHistory().map((entry) => ({
        discoverRevision: entry.discoverRevision,
        parentRevision: entry.parentRevision,
        publishedAt: entry.publishedAt,
        title: entry.title,
        description: entry.description,
        reason: entry.reason,
        eventCount: entry.eventCount,
        entityIds: entry.entityIds,
        sourceCommit: entry.sourceCommit,
        isCurrent: entry.isCurrent,
      })),
      publishDiff: publisher.previewPublishDiff(),
    },
    workItems: new ProjectWorkService(root).list(),
    runs: [...index.runs].reverse().slice(0, 20),
    scanCampaign: index.scanCampaign
      ? { status: index.scanCampaign.status, lastKeptPass: index.scanCampaign.lastKeptPass }
      : undefined,
    phases: (() => {
      const workById = new Map(classifyPhaseWork({
        workspaceRoot: root,
        ctx,
        index,
        scope: service.declaredScope(),
      }).map((w) => [w.phaseId, w]));
      return listPhases(ctx).map((phase, idx) => {
        const work = workById.get(phase.id);
        return {
          ...phase,
          suggestedRecipe: suggestRecipeForPhase(phase, idx === 0),
          handoff: index.handoffs.find((h) => h.phaseId === phase.id),
          alreadyBuilt: work?.alreadyBuilt ?? false,
          builtFiles: work?.matchedFiles ?? [],
          searchTokens: work?.tokens ?? [],
          missingFeatureIds: work?.missingFeatureIds ?? [],
          scannedFileCount: work?.scannedFileCount ?? 0,
        };
      });
    })(),
    activeRun,
  };
}

const DEV_DOCS = [
  'development/CODING_RULES.md',
  'development/TESTING_RULES.md',
  'development/GIT_WORKFLOW.md',
];

/**
 * Fold whatever changed on disk back into the sidecar. When a run is open the
 * change is attributed to it and its diff is recomputed — that is what turns a
 * file save by the agent into the review banner, with no click in between.
 */
export function absorbDocChanges(root: string): boolean {
  const service = new DiscoverService(root);
  const index = service.load();
  if (!index) { return false; }
  const active = service.activeRun(index);
  try {
    if (active && fs.existsSync(service.snapshotDir(active.id))) { service.finishRun(active.id); }
    else { service.reindexAll({ kind: 'user', id: 'vscode-user' }); }
    return true;
  } catch {
    // A half-written file is normal mid-run; the next change event retries.
    return false;
  }
}

/** Docs a step owns, absolute — used to open the right file from a step. */
export function stepDocFiles(root: string, stepId: DiscoverStepId): string[] {
  const service = new DiscoverService(root);
  const index = service.load();
  const step = DISCOVER_STEPS.find((s) => s.id === stepId);
  if (!step || !index) { return []; }
  return step.files.map((f) => service.docFile(f.path, index));
}

export function isDiscoverDocPath(docPath: unknown): docPath is string {
  return typeof docPath === 'string' && !!getFileSpec(docPath);
}

// ── hand-off to an epic ────────────────────────────────────────────────────

export interface ScaffoldPhaseInput {
  phaseId: string;
  recipeId: CofofoRecipeId;
  /** Human-confirmed epic title. Falls back to the phase's own title. */
  title?: string;
}

export interface ScaffoldPhaseResult {
  epicId: string;
  /** The immutable, compact Discover slice pinned by this Epic. */
  contextPath: string;
}

/**
 * Turn one Implementation Plan phase into a CoFoFo epic.
 *
 * Mirrors what `reportCofofoBugCommand` does for a bugfix: assemble the recipe
 * into a real pipeline, register it in `workspace.yaml`, then scaffold. The
 * The handoff never copies Markdown into the Epic. It creates an immutable,
 * compact context pack from the published Discover revision and pins that
 * pack in both `inputs.json` and the pipeline RunState.
 */
export function scaffoldEpicFromPhase(root: string, input: ScaffoldPhaseInput): ScaffoldPhaseResult {
  const service = new DiscoverService(root);
  const index = service.require();
  const ctx = service.readBlueprint(index);
  const phase = getPhase(ctx, input.phaseId);
  if (!phase) { throw new Error(`Phase ${input.phaseId} is not in the Implementation Plan.`); }
  const existing = service.handoffFor(phase.id, index);
  if (existing) { throw new Error(`${phase.id} đã được bàn giao cho ${existing.epicId}.`); }
  if (!(DISCOVER_HANDOFF_RECIPE_IDS as readonly string[]).includes(input.recipeId)) {
    throw new Error('Bàn giao phase chỉ dùng cofofo-feature hoặc cofofo-bugfix.');
  }

  const doc = readYaml(root);
  if (!doc) { throw new Error('workspace.yaml is missing — open the Builder tab first.'); }

  // Ensure the delivery pipelines exist even before prepare() has run.
  new CofofoFoundationService(root).ensureWorkflowRegistered();
  const config = WorkspaceLoader.load(root).config;
  const pipelineId = resolveCofofoPipelineId(input.recipeId) ?? input.recipeId;
  const pipeline = config.pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) {
    throw new Error(`Pipeline "${pipelineId}" missing — run CoFoFo register / Kiểm tra & sửa workspace.`);
  }

  const epicId = nextEpicId(root, doc);
  // Reload doc after ensureWorkflowRegistered may have rewritten workspace.yaml.
  const freshDoc = readYaml(root) ?? doc;

  const title = (input.title ?? '').trim() || `${phase.id} — ${phase.title || index.title}`;
  const taskKind = pipelineId === 'cofofo-bugfix' ? 'bugfix' : 'feature';
  const publisher = new DiscoverContextPublisher(root);
  const contextPack = publisher.createContextPack({ taskKind, phaseId: phase.id });
  const contextPath = publisher.contextPackPath(contextPack.contextRef.packHash);

  const result = scaffoldEpic({
    workspaceRoot: root,
    doc: freshDoc,
    epicId,
    title,
    description: phase.goal || phase.deliverables.join('; '),
    target: { kind: 'pipeline', id: pipelineId },
    agents: pipeline.steps.map((step) => normalizeStep(step).agent),
    inputs: { context_pack: contextPath },
    pipeline,
    discoverProvenance: {
      id: index.id,
      revision: index.revision,
      contextRef: contextPack.contextRef,
    },
  });

  service.recordHandoff({ phaseId: phase.id, epicId, recipeId: pipelineId as typeof input.recipeId, title });
  return { epicId, contextPath };
}

export interface ScaffoldSuggestionInput {
  suggestionId: string;
}

/**
 * Start an epic from a Kiểm tra suggestion — all fields are pre-filled; the
 * webview only sends the suggestion id and the host recomputes the brief.
 */
export function scaffoldEpicFromSuggestion(root: string, input: ScaffoldSuggestionInput): ScaffoldPhaseResult {
  const service = new DiscoverService(root);
  const index = service.require();
  const ctx = service.readBlueprint(index);
  const suggestion = findEpicSuggestion({
    workspaceRoot: root,
    ctx,
    index,
    scope: service.declaredScope(),
  }, input.suggestionId);
  if (!suggestion) { throw new Error(`Suggestion ${input.suggestionId} không còn hợp lệ — hãy tải lại Kiểm tra.`); }
  if (!suggestion.phaseId) {
    throw new Error('Suggestion này chưa thuộc một phase Discover. Hãy thêm nó vào Implementation Plan, xuất bản Context, rồi bàn giao từ phase đó.');
  }

  const doc = readYaml(root);
  if (!doc) { throw new Error('workspace.yaml is missing — open the Builder tab first.'); }

  new CofofoFoundationService(root).ensureWorkflowRegistered();
  const config = WorkspaceLoader.load(root).config;
  const pipelineId = resolveCofofoPipelineId(suggestion.recipeId) ?? 'cofofo-feature';
  const pipeline = config.pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) {
    throw new Error(`Pipeline "${pipelineId}" missing — run CoFoFo register / Kiểm tra & sửa workspace.`);
  }

  const freshDoc = readYaml(root) ?? doc;
  const epicId = nextEpicId(root, freshDoc);
  const taskKind = pipelineId === 'cofofo-bugfix' ? 'bugfix' : 'feature';
  const publisher = new DiscoverContextPublisher(root);
  const contextPack = publisher.createContextPack({ taskKind, phaseId: suggestion.phaseId });
  const contextPath = publisher.contextPackPath(contextPack.contextRef.packHash);

  const result = scaffoldEpic({
    workspaceRoot: root,
    doc: freshDoc,
    epicId,
    title: suggestion.title,
    description: suggestion.description,
    target: { kind: 'pipeline', id: pipelineId },
    agents: pipeline.steps.map((step) => normalizeStep(step).agent),
    inputs: { context_pack: contextPath },
    pipeline,
    discoverProvenance: {
      id: index.id,
      revision: index.revision,
      contextRef: contextPack.contextRef,
    },
  });

  service.recordHandoff({
    phaseId: suggestion.phaseId,
    epicId,
    recipeId: pipelineId,
    title: suggestion.title,
  });

  return { epicId, contextPath };
}

/** `EPIC-1060` — digits from existing folders, stored with EPIC- prefix. */
function nextEpicId(root: string, doc: { state?: unknown }): string {
  const epicRoot = ((doc.state as { epics_dir?: unknown } | undefined)?.epics_dir as string | undefined) ?? 'docs/epics';
  const dir = path.join(root, epicRoot);
  const existing = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  return formatSequencedEpicId(suggestNextEpicId(existing));
}
