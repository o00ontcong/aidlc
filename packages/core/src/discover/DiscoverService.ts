/**
 * The one place Discover touches the disk.
 *
 * Content lives in Markdown under `docsRoot` and is authoritative. This
 * service owns only the sidecar under `.aidlc/discover/` — where the pipeline
 * is, what each doc/item hashed to last time, and one snapshot per agent run
 * so any run can be undone. Losing the sidecar loses undo and provenance; it
 * never loses a word of the docs (plan §3.5).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { ActorRef } from '../contracts/common';
import { nowIso } from '../contracts/common';
import {
  parseDiscoverIndex,
  type DiscoverHandoff,
  type DiscoverIndex,
  type DiscoverItemMeta,
  type DiscoverRun,
  type DiscoverScope,
  type DiscoverStepId,
} from '../contracts/discover';
import { writeFileAtomic } from '../epic/EpicStore';
import {
  DISCOVER_STEPS,
  allDocPaths,
  getFileSpec,
  getStepSpec,
  nextStepId,
  type DocFileSpec,
} from './DocSpec';
import { applyOps, renderEmptyDoc, type DocOp, type PatchResult } from './mdPatch';
import {
  checkSourceRepoWrites,
  fingerprintSourceRepos,
  singleRepoScope,
  type SourceRepoFingerprint,
} from './sourceScope';
import { itemSignature, parseDoc, proseSectionKeyOf, type DocItem, type DocModel, type DocRecord } from './mdParse';
import {
  checkGuardrails,
  diffBlueprints,
  getAllStepStatuses,
  getStepStatus,
  isStepEmpty,
  validateBlueprint,
  type Blueprint,
  type BlueprintContext,
  type BlueprintDiff,
  type GuardrailIssue,
  type StepStatus,
  type ValidationIssue,
} from './validate';

const DISCOVER_DIR = '.aidlc/discover';
const INDEX_FILE = 'index.json';
const SNAPSHOTS_DIR = 'snapshots';
/**
 * Inside a run's snapshot dir: the git state of every declared source repo at
 * the moment the run started. Lives with the snapshot rather than in
 * `index.json` because it is per-run scratch, and it dies with the snapshot.
 */
const SOURCE_FINGERPRINT_FILE = '_source-repos.json';
const MAX_RUNS = 50;

export class DiscoverNotInitializedError extends Error {
  constructor() {
    super('No Discover blueprint in this workspace yet.');
    this.name = 'DiscoverNotInitializedError';
  }
}

export class DiscoverRevisionConflictError extends Error {
  constructor(readonly expectedRevision: number, readonly actualRevision: number) {
    super(`Discover blueprint changed while writing (expected revision ${expectedRevision}, actual ${actualRevision}).`);
    this.name = 'DiscoverRevisionConflictError';
  }
}

export interface InitBlueprintInput {
  seedSentence: string;
  title?: string;
  docsRoot?: string;
  outputLanguage?: 'en' | 'vi';
  /** The repo layout, when the caller already asked for it. Left undeclared otherwise. */
  scope?: DiscoverScope;
  actor: ActorRef;
}

export interface ApplyOpsOptions {
  actor: ActorRef;
  /** Optimistic concurrency — omit to skip the check (file watcher paths). */
  expectedRevision?: number;
  /** Set when the edit came from an agent run rather than a person. */
  runId?: string;
}

export interface ApplyOpsResult extends PatchResult {
  index: DiscoverIndex;
}

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

interface ProseEntry { text: string }

interface FoundEntry {
  kind: 'item' | 'record' | 'prose';
  sectionKey: string;
  entry: DocItem | DocRecord | ProseEntry;
}

function findEntry(doc: DocModel, id: string): FoundEntry | undefined {
  const proseSectionKey = proseSectionKeyOf(id);
  if (proseSectionKey !== undefined) {
    const section = doc.sections.find((s) => s.key === proseSectionKey && s.kind === 'prose');
    return section ? { kind: 'prose', sectionKey: section.key, entry: { text: section.prose } } : undefined;
  }
  for (const section of doc.sections) {
    const item = section.items.find((i) => i.id === id);
    if (item) { return { kind: 'item', sectionKey: section.key, entry: item }; }
    const record = section.records.find((r) => r.id === id);
    if (record) { return { kind: 'record', sectionKey: section.key, entry: record }; }
  }
  return undefined;
}

/** Put an entry the run deleted back exactly as the snapshot held it. */
function restoreOp(found: FoundEntry): DocOp {
  if (found.kind === 'item') {
    const item = found.entry as DocItem;
    return { op: 'addItem', section: found.sectionKey, id: item.id, text: item.text };
  }
  if (found.kind === 'prose') {
    return { op: 'setProse', section: found.sectionKey, value: (found.entry as ProseEntry).text };
  }
  const record = found.entry as DocRecord;
  return {
    op: 'addRecord',
    section: found.sectionKey,
    id: record.id,
    title: record.title,
    fields: record.fields.map((f) => ({ label: f.label, value: f.value, items: f.items })),
  };
}

function titleFromSeed(seed: string): string {
  const trimmed = seed.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 72) { return trimmed; }
  return `${trimmed.slice(0, 69)}…`;
}

export class DiscoverService {
  constructor(readonly workspaceRoot: string) {}

  // ── paths ────────────────────────────────────────────────────────────────

  discoverDir(): string { return path.join(this.workspaceRoot, DISCOVER_DIR); }
  indexFile(): string { return path.join(this.discoverDir(), INDEX_FILE); }
  snapshotDir(runId: string): string { return path.join(this.discoverDir(), SNAPSHOTS_DIR, runId); }

  docsRoot(index?: DiscoverIndex): string {
    return path.join(this.workspaceRoot, (index ?? this.load())?.docsRoot ?? 'docs');
  }

  docFile(docPath: string, index?: DiscoverIndex): string {
    return path.join(this.docsRoot(index), docPath);
  }

  // ── index ────────────────────────────────────────────────────────────────

  exists(): boolean { return fs.existsSync(this.indexFile()); }

  load(): DiscoverIndex | null {
    if (!this.exists()) { return null; }
    return parseDiscoverIndex(JSON.parse(fs.readFileSync(this.indexFile(), 'utf8')));
  }

  require(): DiscoverIndex {
    const index = this.load();
    if (!index) { throw new DiscoverNotInitializedError(); }
    return index;
  }

  private save(index: DiscoverIndex): DiscoverIndex {
    const next: DiscoverIndex = { ...index, updatedAt: nowIso() };
    writeFileAtomic(this.indexFile(), `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  private bump(index: DiscoverIndex, expectedRevision?: number): DiscoverIndex {
    if (expectedRevision !== undefined && expectedRevision !== index.revision) {
      throw new DiscoverRevisionConflictError(expectedRevision, index.revision);
    }
    return { ...index, revision: index.revision + 1 };
  }

  init(input: InitBlueprintInput): DiscoverIndex {
    const existing = this.load();
    if (existing) { return existing; }
    const now = nowIso();
    const index: DiscoverIndex = {
      schemaVersion: 1,
      id: 'DISC-001',
      title: input.title?.trim() || titleFromSeed(input.seedSentence),
      seedSentence: input.seedSentence.trim(),
      docsRoot: input.docsRoot ?? 'docs',
      outputLanguage: input.outputLanguage ?? 'en',
      scope: input.scope,
      currentStep: 'idea',
      revision: 0,
      docs: {},
      items: {},
      runs: [],
      handoffs: [],
      createdAt: now,
      updatedAt: now,
    };
    const saved = this.save(index);
    // The seed sentence is content, so it belongs in the doc, not the sidecar.
    return this.applyOps(
      'product/IDEA.md',
      [{ op: 'setProse', section: 'seed', value: input.seedSentence.trim() }],
      { actor: input.actor },
      saved,
    ).index;
  }

  // ── reading docs ─────────────────────────────────────────────────────────

  readDoc(docPath: string, index?: DiscoverIndex): DocModel {
    const spec = getFileSpec(docPath);
    if (!spec) { throw new Error(`"${docPath}" is not a Discover document.`); }
    const file = this.docFile(docPath, index);
    if (!fs.existsSync(file)) { return parseDoc(renderEmptyDoc(spec), spec, false); }
    return parseDoc(fs.readFileSync(file, 'utf8'), spec, true);
  }

  readBlueprint(index?: DiscoverIndex): BlueprintContext {
    const idx = index ?? this.load() ?? undefined;
    const docs: Blueprint = new Map();
    for (const docPath of allDocPaths()) { docs.set(docPath, this.readDoc(docPath, idx)); }
    return { docs, extraFiles: this.readExtraFiles(idx) };
  }

  private readExtraFiles(index?: DiscoverIndex): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const step of DISCOVER_STEPS) {
      if (!step.extraDir) { continue; }
      const dir = path.join(this.docsRoot(index), step.extraDir.path);
      out[step.extraDir.path] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => step.extraDir!.pattern.test(f)).sort()
        : [];
    }
    return out;
  }

  /** The blueprint as it looked when `runId` started. Empty when the snapshot is gone. */
  readSnapshot(runId: string, index?: DiscoverIndex): BlueprintContext {
    const root = this.snapshotDir(runId);
    const docs: Blueprint = new Map();
    for (const docPath of allDocPaths()) {
      const spec = getFileSpec(docPath)!;
      const file = path.join(root, docPath);
      docs.set(docPath, fs.existsSync(file)
        ? parseDoc(fs.readFileSync(file, 'utf8'), spec, true)
        : parseDoc(renderEmptyDoc(spec), spec, false));
    }
    const extraFiles: Record<string, string[]> = {};
    for (const step of DISCOVER_STEPS) {
      if (!step.extraDir) { continue; }
      const dir = path.join(root, step.extraDir.path);
      extraFiles[step.extraDir.path] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => step.extraDir!.pattern.test(f)).sort()
        : [];
    }
    void index;
    return { docs, extraFiles };
  }

  // ── status ───────────────────────────────────────────────────────────────

  stepStatus(stepId: DiscoverStepId, ctx?: BlueprintContext): StepStatus {
    return getStepStatus(ctx ?? this.readBlueprint(), stepId);
  }

  allStepStatuses(ctx?: BlueprintContext): StepStatus[] {
    return getAllStepStatuses(ctx ?? this.readBlueprint());
  }

  validate(ctx?: BlueprintContext): ValidationIssue[] {
    const index = this.load() ?? undefined;
    return validateBlueprint(ctx ?? this.readBlueprint(index), index);
  }

  advanceStep(expectedRevision?: number): DiscoverIndex {
    const index = this.bump(this.require(), expectedRevision);
    const next = nextStepId(index.currentStep);
    if (!next) { return this.save(index); }
    return this.save({ ...index, currentStep: next });
  }

  setCurrentStep(step: DiscoverStepId, expectedRevision?: number): DiscoverIndex {
    return this.save({ ...this.bump(this.require(), expectedRevision), currentStep: step });
  }

  // ── writing docs ─────────────────────────────────────────────────────────

  applyOps(docPath: string, ops: DocOp[], options: ApplyOpsOptions, indexOverride?: DiscoverIndex): ApplyOpsResult {
    const spec = getFileSpec(docPath);
    if (!spec) { throw new Error(`"${docPath}" is not a Discover document.`); }
    const index = this.bump(indexOverride ?? this.require(), options.expectedRevision);
    const file = this.docFile(docPath, index);
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : renderEmptyDoc(spec);
    const result = applyOps(before, spec, ops);
    if (result.content !== before) { writeFileAtomic(file, result.content); }
    return { ...result, index: this.save(this.reindexDoc(index, docPath, spec, result.content, options)) };
  }

  /** Rewrite the sidecar's view of one doc from what is now on disk. */
  private reindexDoc(
    index: DiscoverIndex,
    docPath: string,
    spec: DocFileSpec,
    content: string,
    options: { actor: ActorRef; runId?: string },
  ): DiscoverIndex {
    const doc = parseDoc(content, spec, true);
    const now = nowIso();
    const origin: DiscoverItemMeta['origin'] = options.actor.kind === 'agent' ? 'ai' : 'human';
    const items: Record<string, DiscoverItemMeta> = { ...index.items };
    const live = new Set<string>();

    for (const section of doc.sections) {
      for (const entry of [...section.items, ...section.records]) {
        const key = `${docPath}#${entry.id}`;
        live.add(key);
        const hash = hashContent(itemSignature(entry));
        const prev = items[key];
        if (prev && prev.hash === hash) { continue; }
        items[key] = {
          origin,
          hash,
          pinned: prev?.pinned ?? false,
          // A rewrite clears the "look at this" flag; the reviewer set it against the old text.
          flagged: false,
          updatedAt: now,
        };
      }
    }
    for (const key of Object.keys(items)) {
      if (key.startsWith(`${docPath}#`) && !live.has(key)) { delete items[key]; }
    }

    return {
      ...index,
      items,
      docs: { ...index.docs, [docPath]: { hash: hashContent(content), updatedAt: now, lastRunId: options.runId } },
    };
  }

  /**
   * Replace a whole document with hand-written Markdown — the "raw" editor.
   * Deliberately not expressed as ops: the file is the source of truth, so a
   * person editing it wholesale is a first-class path, not a fallback. What
   * they write is what is stored; the sidecar simply re-reads it afterwards.
   */
  writeDoc(docPath: string, content: string, options: ApplyOpsOptions): DiscoverIndex {
    const spec = getFileSpec(docPath);
    if (!spec) { throw new Error(`"${docPath}" is not a Discover document.`); }
    const index = this.bump(this.require(), options.expectedRevision);
    const normalized = `${content.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`;
    writeFileAtomic(this.docFile(docPath, index), normalized);
    return this.save(this.reindexDoc(index, docPath, spec, normalized, options));
  }

  /** Raw Markdown as it sits on disk, or the empty skeleton when the file is absent. */
  readRaw(docPath: string, index?: DiscoverIndex): string {
    const spec = getFileSpec(docPath);
    if (!spec) { throw new Error(`"${docPath}" is not a Discover document.`); }
    const file = this.docFile(docPath, index);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : renderEmptyDoc(spec);
  }

  /**
   * Re-read every doc from disk into the sidecar without changing content —
   * how a hand edit (or an agent writing the file directly) gets picked up.
   */
  reindexAll(actor: ActorRef, runId?: string): DiscoverIndex {
    let index = this.require();
    for (const docPath of allDocPaths()) {
      const spec = getFileSpec(docPath)!;
      const file = this.docFile(docPath, index);
      if (!fs.existsSync(file)) { continue; }
      const content = fs.readFileSync(file, 'utf8');
      if (index.docs[docPath]?.hash === hashContent(content)) { continue; }
      index = this.reindexDoc(index, docPath, spec, content, { actor, runId });
    }
    return this.save({ ...index, revision: index.revision + 1 });
  }

  setItemFlags(docPath: string, id: string, flags: { pinned?: boolean; flagged?: boolean }, expectedRevision?: number): DiscoverIndex {
    const index = this.bump(this.require(), expectedRevision);
    const key = `${docPath}#${id}`;
    const meta = index.items[key];
    if (!meta) { throw new Error(`${key} is not a tracked item.`); }
    return this.save({ ...index, items: { ...index.items, [key]: { ...meta, ...flags, updatedAt: nowIso() } } });
  }

  // ── hand-off ─────────────────────────────────────────────────────────────

  /**
   * Remember that a phase became an epic. Deliberately append-only and
   * deliberately thin: the epic owns its own progress from here, and Discover
   * only needs to know the phase is spoken for.
   */
  recordHandoff(handoff: Omit<DiscoverHandoff, 'at'>): DiscoverIndex {
    const index = this.require();
    if (index.handoffs.some((h) => h.phaseId === handoff.phaseId)) {
      throw new Error(`${handoff.phaseId} has already been handed off to ${index.handoffs.find((h) => h.phaseId === handoff.phaseId)!.epicId}.`);
    }
    return this.save({
      ...index,
      revision: index.revision + 1,
      handoffs: [...index.handoffs, { ...handoff, at: nowIso() }],
    });
  }

  handoffFor(phaseId: string, index?: DiscoverIndex): DiscoverHandoff | undefined {
    return (index ?? this.load())?.handoffs.find((h) => h.phaseId === phaseId);
  }

  // ── source scope ─────────────────────────────────────────────────────────

  /** The declared repo layout, or `undefined` while the user has never been asked. */
  scope(index?: DiscoverIndex): DiscoverScope | undefined {
    return (index ?? this.load())?.scope;
  }

  /**
   * The layout to actually scan with. Falls back to "this one repo, its own
   * source" for a blueprint created before layouts existed — the behaviour
   * those blueprints already had — without writing that assumption to disk,
   * so the wizard still gets to ask.
   */
  effectiveScope(index?: DiscoverIndex): DiscoverScope {
    const idx = index ?? this.load() ?? undefined;
    return idx?.scope ?? singleRepoScope(this.workspaceRoot, idx?.createdAt ?? nowIso());
  }

  /**
   * Record which repos this blueprint describes. Overwrites wholesale: the
   * user re-declares a layout when the repo tree changes, and merging a stale
   * repo list into a new one would quietly keep a repo that has moved away.
   */
  setScope(scope: Omit<DiscoverScope, 'declaredAt'>): DiscoverIndex {
    const index = this.require();
    return this.save({
      ...this.bump(index),
      scope: { ...scope, declaredAt: nowIso() },
    });
  }

  // ── agent runs ───────────────────────────────────────────────────────────

  /** Snapshot the docs, then record the run so its diff has something to compare against. */
  startRun(
    stepId: DiscoverStepId,
    options: { note?: string; runId?: string; kind?: 'step' | 'scan' | 'edit' } = {},
  ): { index: DiscoverIndex; run: DiscoverRun } {
    const index = this.require();
    const ctx = this.readBlueprint(index);
    const kind = options.kind ?? 'step';
    const runId = options.runId ?? `run-${String(index.runs.length + 1).padStart(3, '0')}`;
    this.snapshotDocs(runId, index);
    // A scan is the only run that reads outside `docsRoot`, so it is the only
    // one that can wander into a source repo and write there.
    if (kind === 'scan') { this.writeSourceFingerprint(runId, index); }
    const run: DiscoverRun = {
      id: runId,
      step: stepId,
      // A scan reconciles every step against the real codebase in one pass —
      // "fill vs refine" is decided per step inside that pass, not up front.
      mode: kind === 'scan' ? 'refine' : (isStepEmpty(ctx, stepId) ? 'fill' : 'refine'),
      kind,
      startedAt: nowIso(),
      note: options.note,
      diff: { added: [], updated: [], removed: [] },
      guardrail: [],
      revertable: true,
      status: 'running',
    };
    const allRuns = [...index.runs, run];
    const evicted = allRuns.slice(0, Math.max(0, allRuns.length - MAX_RUNS));
    for (const r of evicted) { fs.rmSync(this.snapshotDir(r.id), { recursive: true, force: true }); }
    const runs = allRuns.slice(-MAX_RUNS);
    return { index: this.save({ ...index, revision: index.revision + 1, runs }), run };
  }

  /**
   * Close a run: diff what the agent wrote against the snapshot, check it
   * against the guardrails, and mark everything it touched as AI-authored.
   */
  finishRun(runId: string): { index: DiscoverIndex; run: DiscoverRun; diff: BlueprintDiff; guardrail: GuardrailIssue[] } {
    // Metadata as of the run START: reindexing drops the entries for items
    // the agent removed, and those are exactly the ones the pinned/human
    // guardrails have to be able to see.
    const beforeIndex = this.require();
    const index = this.reindexAll({ kind: 'agent', id: 'discover-agent' }, runId);
    const run = index.runs.find((r) => r.id === runId);
    if (!run) { throw new Error(`Unknown Discover run "${runId}".`); }
    const before = this.readSnapshot(runId, index);
    const after = this.readBlueprint(index);
    const diff = diffBlueprints(before.docs, after.docs);
    // Only a plain step run is scoped to its own files — a scan or a
    // person's direct edit may legitimately touch any doc.
    const allowed = run.kind === 'step' ? getStepSpec(run.step).files.map((f) => f.path) : allDocPaths();
    const guardrail = [
      ...checkGuardrails(before.docs, after.docs, beforeIndex, allowed),
      ...this.checkSourceRepos(run, index),
    ];
    const updated: DiscoverRun = {
      ...run,
      finishedAt: nowIso(),
      diff,
      guardrail: guardrail.map((g) => `${g.code}: ${g.message}`),
      // Safe to call again: everything above is recomputed from the snapshot,
      // so a late write by the agent simply grows the diff.
      status: run.status === 'running' || run.status === 'review' ? 'review' : run.status,
    };
    return {
      index: this.save({ ...index, runs: index.runs.map((r) => (r.id === runId ? updated : r)) }),
      run: updated,
      diff,
      guardrail,
    };
  }

  /** Diff a finished run again from its snapshot — the UI's "Xem diff". */
  diffRun(runId: string): BlueprintDiff {
    const index = this.require();
    return diffBlueprints(this.readSnapshot(runId, index).docs, this.readBlueprint(index).docs);
  }

  /** Put every doc back the way the snapshot found it. */
  revertRun(runId: string): DiscoverIndex {
    const index = this.require();
    const snapshotRoot = this.snapshotDir(runId);
    if (!fs.existsSync(snapshotRoot)) { throw new Error(`Snapshot for "${runId}" is gone — this run can no longer be reverted.`); }
    for (const docPath of allDocPaths()) {
      const from = path.join(snapshotRoot, docPath);
      const to = this.docFile(docPath, index);
      if (fs.existsSync(from)) { writeFileAtomic(to, fs.readFileSync(from, 'utf8')); }
      else if (fs.existsSync(to)) { fs.rmSync(to); }
    }
    for (const step of DISCOVER_STEPS) {
      if (!step.extraDir) { continue; }
      const from = path.join(snapshotRoot, step.extraDir.path);
      const to = path.join(this.docsRoot(index), step.extraDir.path);
      if (fs.existsSync(to)) { fs.rmSync(to, { recursive: true, force: true }); }
      if (fs.existsSync(from)) { fs.cpSync(from, to, { recursive: true }); }
    }
    const reindexed = this.reindexAll({ kind: 'user', id: 'revert' }, runId);
    // Nothing left to undo back to once the snapshot has been applied.
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
    return this.save({
      ...reindexed,
      runs: reindexed.runs.map((r) => (r.id === runId ? { ...r, revertable: false, status: 'reverted' as const } : r)),
    });
  }

  /** The run the user still owes a verdict on, if any. */
  activeRun(index?: DiscoverIndex): DiscoverRun | undefined {
    const runs = (index ?? this.load())?.runs ?? [];
    return [...runs].reverse().find((r) => r.status === 'running' || r.status === 'review');
  }

  /** Accept what a run wrote. The snapshot goes with it — nothing left to undo. */
  keepRun(runId: string): DiscoverIndex {
    const index = this.require();
    if (!index.runs.some((r) => r.id === runId)) { throw new Error(`Unknown Discover run "${runId}".`); }
    fs.rmSync(this.snapshotDir(runId), { recursive: true, force: true });
    return this.save({
      ...index,
      revision: index.revision + 1,
      runs: index.runs.map((r) => (r.id === runId ? { ...r, status: 'kept' as const, revertable: false } : r)),
    });
  }

  /**
   * Undo part of a run: each key is `<doc path>#<ID>`, and each one goes back
   * to exactly what the snapshot holds — restored, re-worded, or removed
   * again. The rest of the run stays. A restored entry lands at the end of its
   * section rather than its original position; its id and text are what matter.
   */
  revertEntries(runId: string, keys: string[], actor: ActorRef): { index: DiscoverIndex; reverted: string[]; issues: string[] } {
    const index = this.require();
    if (!fs.existsSync(this.snapshotDir(runId))) { throw new Error(`Snapshot for "${runId}" is gone — this run can no longer be undone.`); }
    const before = this.readSnapshot(runId, index).docs;
    const byDoc = new Map<string, string[]>();
    for (const key of keys) {
      const [docPath, id] = key.split('#') as [string, string];
      if (!docPath || !id) { continue; }
      byDoc.set(docPath, [...(byDoc.get(docPath) ?? []), id]);
    }

    let latest = index;
    const reverted: string[] = [];
    const issues: string[] = [];
    for (const [docPath, ids] of byDoc) {
      const snapshot = before.get(docPath);
      const current = this.readDoc(docPath, latest);
      const ops: DocOp[] = [];
      for (const id of ids) {
        const was = snapshot ? findEntry(snapshot, id) : undefined;
        const now = findEntry(current, id);
        if (!was && !now) { issues.push(`${docPath}#${id} is in neither the snapshot nor the document.`); continue; }
        if (!was && now) {
          ops.push(
            now.kind === 'item' ? { op: 'removeItem', id }
              : now.kind === 'record' ? { op: 'removeRecord', id }
              : { op: 'setProse', section: now.sectionKey, value: '' },
          );
        } else if (was && !now) {
          ops.push(restoreOp(was));
        } else if (was && now) {
          const unchanged = was.kind === 'prose'
            ? (was.entry as ProseEntry).text === (now.entry as ProseEntry).text
            : itemSignature(was.entry as DocItem | DocRecord) === itemSignature(now.entry as DocItem | DocRecord);
          if (unchanged) { continue; }
          if (was.kind === 'prose') {
            ops.push({ op: 'setProse', section: was.sectionKey, value: (was.entry as ProseEntry).text });
          } else if (was.kind === 'item') {
            ops.push({ op: 'updateItem', id, text: (was.entry as DocItem).text });
          } else {
            ops.push({
              op: 'updateRecord',
              id,
              title: (was.entry as DocRecord).title,
              fields: (was.entry as DocRecord).fields.map((f) => ({ label: f.label, value: f.value, items: f.items })),
            });
          }
        } else { continue; }
        reverted.push(`${docPath}#${id}`);
      }
      if (ops.length === 0) { continue; }
      const result = this.applyOps(docPath, ops, { actor, runId }, latest);
      latest = result.index;
      issues.push(...result.issues);
    }
    // Without this, a reverted entry stays listed in the run's own diff —
    // recomputed from the (now unchanged) doc against the snapshot, it drops
    // out on its own the same way a late agent write grows it (finishRun's
    // own doc comment).
    if (reverted.length > 0) { latest = this.finishRun(runId).index; }
    return { index: latest, reverted, issues };
  }

  /**
   * Confirm specific entries from a still-open run: fold their current value
   * into the run's own snapshot copy, so a later "undo the whole run" no
   * longer touches them and they drop off this run's diff. The mirror of
   * `revertEntries`, which instead writes the snapshot's value back into the
   * live doc — here the live doc never changes, only the run's baseline does.
   */
  keepEntries(runId: string, keys: string[]): { index: DiscoverIndex; kept: string[]; issues: string[] } {
    const index = this.require();
    const snapshotRoot = this.snapshotDir(runId);
    if (!fs.existsSync(snapshotRoot)) {
      throw new Error(`Snapshot for "${runId}" is gone — this run's entries are already final.`);
    }
    const byDoc = new Map<string, string[]>();
    for (const key of keys) {
      const [docPath, id] = key.split('#') as [string, string];
      if (!docPath || !id) { continue; }
      byDoc.set(docPath, [...(byDoc.get(docPath) ?? []), id]);
    }

    const kept: string[] = [];
    const issues: string[] = [];
    for (const [docPath, ids] of byDoc) {
      const spec = getFileSpec(docPath);
      if (!spec) { issues.push(`"${docPath}" is not a Discover document.`); continue; }
      const current = this.readDoc(docPath, index);
      const snapshotFile = path.join(snapshotRoot, docPath);
      const snapshotContent = fs.existsSync(snapshotFile) ? fs.readFileSync(snapshotFile, 'utf8') : renderEmptyDoc(spec);
      const snapshotDoc = parseDoc(snapshotContent, spec, true);

      const ops: DocOp[] = [];
      for (const id of ids) {
        const was = findEntry(snapshotDoc, id);
        const now = findEntry(current, id);
        if (!was && !now) { issues.push(`${docPath}#${id} is in neither the snapshot nor the document.`); continue; }
        if (!was && now) {
          ops.push(restoreOp(now)); // it's new — add it to the snapshot too
        } else if (was && !now) {
          ops.push(
            was.kind === 'item' ? { op: 'removeItem', id }
              : was.kind === 'record' ? { op: 'removeRecord', id }
              : { op: 'setProse', section: was.sectionKey, value: '' },
          ); // it's gone — confirm the removal in the snapshot too
        } else if (was && now) {
          if (was.kind === 'prose') {
            ops.push({ op: 'setProse', section: was.sectionKey, value: (now.entry as ProseEntry).text });
          } else if (was.kind === 'item') {
            ops.push({ op: 'updateItem', id, text: (now.entry as DocItem).text });
          } else {
            ops.push({
              op: 'updateRecord',
              id,
              title: (now.entry as DocRecord).title,
              fields: (now.entry as DocRecord).fields.map((f) => ({ label: f.label, value: f.value, items: f.items })),
            });
          }
        }
        kept.push(`${docPath}#${id}`);
      }
      if (ops.length === 0) { continue; }
      const patched = applyOps(snapshotContent, spec, ops);
      writeFileAtomic(snapshotFile, patched.content);
    }

    const finished = kept.length > 0 ? this.finishRun(runId).index : index;
    return { index: finished, kept, issues };
  }

  /**
   * Keep run snapshots out of `git status` in the host project. Idempotent:
   * appends a rule to `.aidlc/.gitignore` (creating it if needed) the first
   * time a snapshot is taken, mirroring GitRunStateStore.ensureIgnored.
   */
  private ensureSnapshotsIgnored(): void {
    const rule = `${SNAPSHOTS_DIR}/`;
    const ignoreFile = path.join(this.discoverDir(), '.gitignore');
    const existing = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf8') : '';
    if (existing.split(/\r?\n/).includes(rule)) { return; }
    const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
    fs.mkdirSync(this.discoverDir(), { recursive: true });
    fs.appendFileSync(ignoreFile, `${prefix}${rule}\n`);
  }

  /** Git state of every declared source repo, stored beside the run's snapshot. */
  private writeSourceFingerprint(runId: string, index: DiscoverIndex): void {
    const scope = this.effectiveScope(index);
    if (scope.repos.every((r) => r.path === '.')) { return; }
    const file = path.join(this.snapshotDir(runId), SOURCE_FINGERPRINT_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, `${JSON.stringify(fingerprintSourceRepos(this.workspaceRoot, scope), null, 2)}\n`);
  }

  /**
   * Did this run write into a repo that is source, not blueprint? Silent for
   * anything but a scan, and silent when the fingerprint is missing — an
   * older run, or a single-repo blueprint with nothing to compare.
   */
  private checkSourceRepos(run: DiscoverRun, index: DiscoverIndex): GuardrailIssue[] {
    if (run.kind !== 'scan') { return []; }
    const file = path.join(this.snapshotDir(run.id), SOURCE_FINGERPRINT_FILE);
    if (!fs.existsSync(file)) { return []; }
    let before: SourceRepoFingerprint;
    try {
      before = JSON.parse(fs.readFileSync(file, 'utf8')) as SourceRepoFingerprint;
    } catch {
      return [];
    }
    return checkSourceRepoWrites(before, fingerprintSourceRepos(this.workspaceRoot, this.effectiveScope(index)));
  }

  private snapshotDocs(runId: string, index: DiscoverIndex): void {
    this.ensureSnapshotsIgnored();
    const root = this.snapshotDir(runId);
    fs.rmSync(root, { recursive: true, force: true });
    for (const docPath of allDocPaths()) {
      const from = this.docFile(docPath, index);
      if (!fs.existsSync(from)) { continue; }
      const to = path.join(root, docPath);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
    for (const step of DISCOVER_STEPS) {
      if (!step.extraDir) { continue; }
      const from = path.join(this.docsRoot(index), step.extraDir.path);
      if (!fs.existsSync(from)) { continue; }
      fs.cpSync(from, path.join(root, step.extraDir.path), { recursive: true });
    }
  }
}
