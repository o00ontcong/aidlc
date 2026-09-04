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

import { discoverRepoIsDirty } from './discoverGitCommit';
import {
  resolveCofofoPipelineId,
  CofofoFoundationService,
  DiscoverService,
  DISCOVER_STEPS,
  getFileSpec,
  getPhase,
  isStepEmpty,
  itemBody,
  listPhases,
  normalizeStep,
  proseSectionKeyOf,
  renderPhaseIntent,
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
} from '@aidlc/core';
import { readYaml, writeYaml } from './yamlIO';

export interface DiscoverItemUi {
  id: string;
  text: string;
  description?: string;
  origin: 'ai' | 'human';
  pinned: boolean;
  flagged: boolean;
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
  itemCoverage: DiscoverItemCoverage;
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
    docs: [...ctx.docs.keys()].map((docPath) => toDocUi(service, index, ctx, docPath)),
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
    itemCoverage: classifyItemCoverage({
      workspaceRoot: root,
      ctx,
      index,
      scope: service.declaredScope(),
    }),
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
  intentPath: string;
}

/**
 * Turn one Implementation Plan phase into a CoFoFo epic.
 *
 * Mirrors what `reportCofofoBugCommand` does for a bugfix: assemble the recipe
 * into a real pipeline, register it in `workspace.yaml`, then scaffold. The
 * one thing added here is `discoverProvenance`, which is what writes
 * `INTENT.md` into the epic's artifacts — the `requirement` gate reads that
 * file, so the brief has to be a snapshot, never a pointer back into docs that
 * can change afterwards.
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

  // Ensure the three CoFoFo pipelines exist even before prepare() has run.
  new CofofoFoundationService(root).ensureRecipesRegistered();
  const config = WorkspaceLoader.load(root).config;
  const pipelineId = resolveCofofoPipelineId(input.recipeId) ?? input.recipeId;
  const pipeline = config.pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) {
    throw new Error(`Pipeline "${pipelineId}" missing — run CoFoFo register / Kiểm tra & sửa workspace.`);
  }

  const epicId = nextEpicId(root, doc);
  // Reload doc after ensureRecipesRegistered may have rewritten workspace.yaml.
  const freshDoc = readYaml(root) ?? doc;

  const brief = renderPhaseIntent(ctx, index, phase);
  const title = (input.title ?? '').trim() || `${phase.id} — ${phase.title || index.title}`;
  const foundation = new CofofoFoundationService(root).inspect().snapshot;

  const result = scaffoldEpic({
    workspaceRoot: root,
    doc: freshDoc,
    epicId,
    title,
    description: phase.goal || phase.deliverables.join('; '),
    target: { kind: 'pipeline', id: pipelineId },
    agents: pipeline.steps.map((step) => normalizeStep(step).agent),
    inputs: {},
    pipeline,
    discoverProvenance: {
      id: index.id,
      revision: index.revision,
      // A workspace with no published CoFoFo Foundation still hands off; the
      // epic runs cofofo-foundation first when needed.
      foundation: foundation ?? { revision: 0, manifestPath: '', manifestHash: 'unpublished', capturedAt: new Date().toISOString() },
      brief,
    },
  });

  service.recordHandoff({ phaseId: phase.id, epicId, recipeId: pipelineId as typeof input.recipeId, title });
  return { epicId, intentPath: path.join(result.artifactsDir, 'INTENT.md') };
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

  const doc = readYaml(root);
  if (!doc) { throw new Error('workspace.yaml is missing — open the Builder tab first.'); }

  new CofofoFoundationService(root).ensureRecipesRegistered();
  const config = WorkspaceLoader.load(root).config;
  const pipelineId = resolveCofofoPipelineId(suggestion.recipeId) ?? 'cofofo-feature';
  const pipeline = config.pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) {
    throw new Error(`Pipeline "${pipelineId}" missing — run CoFoFo register / Kiểm tra & sửa workspace.`);
  }

  const freshDoc = readYaml(root) ?? doc;
  const epicId = nextEpicId(root, freshDoc);
  const foundation = new CofofoFoundationService(root).inspect().snapshot;

  const result = scaffoldEpic({
    workspaceRoot: root,
    doc: freshDoc,
    epicId,
    title: suggestion.title,
    description: suggestion.description,
    target: { kind: 'pipeline', id: pipelineId },
    agents: pipeline.steps.map((step) => normalizeStep(step).agent),
    inputs: {},
    pipeline,
    discoverProvenance: {
      id: index.id,
      revision: index.revision,
      foundation: foundation ?? { revision: 0, manifestPath: '', manifestHash: 'unpublished', capturedAt: new Date().toISOString() },
      brief: suggestion.brief,
    },
  });

  if (suggestion.phaseId) {
    service.recordHandoff({
      phaseId: suggestion.phaseId,
      epicId,
      recipeId: pipelineId,
      title: suggestion.title,
    });
  }

  return { epicId, intentPath: path.join(result.artifactsDir, 'INTENT.md') };
}

/** `EPIC-004` — continues whatever numbering the workspace already uses. */
function nextEpicId(root: string, doc: { state?: unknown }): string {
  const epicRoot = ((doc.state as { epics_dir?: unknown } | undefined)?.epics_dir as string | undefined) ?? 'docs/epics';
  const dir = path.join(root, epicRoot);
  const existing = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  const numbers = existing
    .map((id) => /^EPIC-(\d+)$/.exec(id)?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `EPIC-${String(next).padStart(3, '0')}`;
}
