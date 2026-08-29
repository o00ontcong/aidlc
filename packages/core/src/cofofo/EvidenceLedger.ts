import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  CofofoEvidenceRecordSchema,
  type CofofoEvidenceRecord,
  type CofofoEvidenceStage,
  type StackProfile,
} from './contracts';
import { commandSpec, selectCatalog } from './Catalog';
import { hashFile, hashObject } from './hash';
import { resolveInside, writeAtomic } from './paths';
import { normalizeStep, type PipelineConfig } from '../schema/WorkspaceSchema';
import type { RunState } from '../runs/RunState';

export type EvidenceStageRevisions = Record<'red' | 'green' | 'refactor' | 'verify', number>;

function stepIndexByName(pipeline: PipelineConfig, name: string): number {
  return pipeline.steps.findIndex((raw) => normalizeStep(raw).name === name);
}

function stepRevisionAt(state: RunState, index: number): number {
  const record = state.steps[index];
  if (!record) {
    throw new CofofoEvidenceError(`Run "${state.runId}" has no step at index ${index}.`);
  }
  return record.revision;
}

/** Derive the evidence revision map exclusively from immutable run state. */
export function evidenceStageRevisionsForRun(
  state: RunState,
  pipeline: PipelineConfig,
): EvidenceStageRevisions {
  const byDeclaredStage: Partial<EvidenceStageRevisions> = {};
  for (let index = 0; index < pipeline.steps.length; index += 1) {
    const stage = normalizeStep(pipeline.steps[index]!).evidence?.stage;
    const record = state.steps[index];
    if (stage && record) byDeclaredStage[stage] = record.revision;
  }

  const reproduceIdx = stepIndexByName(pipeline, 'reproduce');
  const implementIdx = stepIndexByName(pipeline, 'implement');
  const testIdx = stepIndexByName(pipeline, 'test');

  const red = byDeclaredStage.red
    ?? (reproduceIdx >= 0 ? stepRevisionAt(state, reproduceIdx) : implementIdx >= 0 ? stepRevisionAt(state, implementIdx) : undefined);
  const green = byDeclaredStage.green
    ?? (implementIdx >= 0 ? stepRevisionAt(state, implementIdx) : undefined);
  const refactor = byDeclaredStage.refactor ?? green;
  const verify = byDeclaredStage.verify
    ?? (testIdx >= 0 ? stepRevisionAt(state, testIdx) : undefined);

  if (!red || !green || !refactor || !verify) {
    throw new CofofoEvidenceError(`Run "${state.runId}" is missing an evidence-owning delivery phase.`);
  }
  return { red, green, refactor, verify };
}

const PREVIEW_BYTES = 16 * 1024;
const FULL_LOG_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TARGET = /^[A-Za-z0-9_./:\[\]-]{1,200}$/;
const COMPILE_FAILURE = /(?:compile(?:r)? error|failed to build|no such module|cannot find (?:symbol|type)|syntax error|linker command failed)/i;

export class CofofoEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CofofoEvidenceError';
  }
}

function ledgerPath(root: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new CofofoEvidenceError(`Invalid evidence run id: ${runId}`);
  return `.aidlc/evidence/${runId}/ledger.jsonl`;
}

function redact(value: string): string {
  return value
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{12,}\b/g, '[REDACTED_TOKEN]')
    .replace(/((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]')
    // A plain long identifier/word is not evidence of base64. Requiring a
    // base64-only punctuation character avoids redacting a legitimate oracle
    // such as a deliberately long test name while still screening encoded
    // blobs that carry the distinctive alphabet.
    .replace(/(?<![A-Za-z0-9+/=])(?=[A-Za-z0-9+/=]{40,}(?:$|[^A-Za-z0-9+/=]))(?=[A-Za-z0-9+/=]*[+/=])[A-Za-z0-9+/]{40,}={0,2}/g, '[REDACTED_BLOB]');
}

function bounded(value: string, bytes: number): string {
  const buffer = Buffer.from(value);
  if (buffer.length <= bytes) return value;
  const half = Math.floor((bytes - 80) / 2);
  return `${buffer.subarray(0, half).toString()}\n… [output truncated by CoFoFo] …\n${buffer.subarray(buffer.length - half).toString()}`;
}

function readRaw(workspaceRoot: string, runId: string): CofofoEvidenceRecord[] {
  const relative = ledgerPath(workspaceRoot, runId);
  const absolute = resolveInside(workspaceRoot, relative);
  if (!fs.existsSync(absolute)) return [];
  const rows = fs.readFileSync(absolute, 'utf8').split('\n').filter(Boolean);
  return rows.map((row, index) => {
    try { return CofofoEvidenceRecordSchema.parse(JSON.parse(row)); }
    catch (error) { throw new CofofoEvidenceError(`Invalid evidence record ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  });
}

export function readEvidenceLedger(workspaceRoot: string, runId: string): CofofoEvidenceRecord[] {
  const records = readRaw(workspaceRoot, runId);
  const issues = verifyEvidenceLedger(workspaceRoot, runId, records);
  if (issues.length) throw new CofofoEvidenceError(`Evidence ledger is not trustworthy:\n- ${issues.join('\n- ')}`);
  return records;
}

function revisionKey(stage: CofofoEvidenceStage): keyof EvidenceStageRevisions {
  return stage === 'red-waiver' ? 'red' : stage;
}

/** Accepted stages whose evidence belongs to the currently-live step revision. */
export function acceptedStages(
  records: CofofoEvidenceRecord[],
  revisions: EvidenceStageRevisions,
): Set<CofofoEvidenceStage> {
  return new Set(records
    .filter((record) => record.accepted && record.stepRevision === revisions[revisionKey(record.stage)])
    .map((record) => record.stage));
}

export function expectedNext(
  records: CofofoEvidenceRecord[],
  revisions: EvidenceStageRevisions,
): CofofoEvidenceStage {
  const accepted = acceptedStages(records, revisions);
  if (!accepted.has('red') && !accepted.has('red-waiver')) return 'red';
  if (!accepted.has('green')) return 'green';
  if (!accepted.has('refactor')) return 'refactor';
  return 'verify';
}

export function assertStageOrder(
  records: CofofoEvidenceRecord[],
  stage: CofofoEvidenceStage,
  revisions: EvidenceStageRevisions,
): void {
  const expected = expectedNext(records, revisions);
  if (stage === 'red-waiver') {
    if (expected !== 'red') throw new CofofoEvidenceError('A RED waiver is only valid before GREEN evidence exists.');
    return;
  }
  if (stage !== expected) {
    // Re-running the currently incomplete stage is allowed; accepted stages
    // cannot be overwritten or reordered.
    throw new CofofoEvidenceError(`Evidence stage "${stage}" is out of order; next required stage is "${expected}".`);
  }
}

function workingDirectory(profile: StackProfile): string {
  const manifest = profile.evidence.find((evidence) => evidence.kind === 'manifest')?.path;
  return manifest ? path.posix.dirname(manifest) : '.';
}

function saveRecord(workspaceRoot: string, runId: string, records: CofofoEvidenceRecord[], draft: Omit<CofofoEvidenceRecord, 'recordHash'>): CofofoEvidenceRecord {
  const record = CofofoEvidenceRecordSchema.parse({ ...draft, recordHash: hashObject(draft) });
  const relative = ledgerPath(workspaceRoot, runId);
  const content = [...records, record].map((item) => JSON.stringify(item)).join('\n') + '\n';
  writeAtomic(resolveInside(workspaceRoot, relative), content);
  return record;
}

export function captureEvidence(args: {
  workspaceRoot: string;
  runId: string;
  profile: StackProfile;
  stage: Exclude<CofofoEvidenceStage, 'red-waiver'>;
  commandId: string;
  target?: string;
  expectedFailure?: string;
  /** Revision of the phase step currently receiving this evidence. */
  stepRevision: number;
  /** Current revisions of every evidence-owning phase in the run. */
  stageRevisions: EvidenceStageRevisions;
  timeoutMs?: number;
  now?: () => string;
}): CofofoEvidenceRecord {
  const root = fs.realpathSync(path.resolve(args.workspaceRoot));
  const selection = selectCatalog(args.profile);
  if (!selection) throw new CofofoEvidenceError('No audited command allow-list exists for this stack.');
  const records = readEvidenceLedger(root, args.runId);
  if (args.stageRevisions[args.stage] !== args.stepRevision) {
    throw new CofofoEvidenceError(`Evidence revision for stage "${args.stage}" does not match its live run step.`);
  }
  assertStageOrder(records, args.stage, args.stageRevisions);
  const spec = commandSpec(selection, args.commandId);
  const commandArgs = [...spec.args];
  if (spec.acceptsTarget) {
    if (!args.target || !TARGET.test(args.target)) throw new CofofoEvidenceError(`CommandId "${spec.id}" requires a safe --target value.`);
    commandArgs.push(args.target);
  } else if (args.target) {
    throw new CofofoEvidenceError(`CommandId "${spec.id}" does not accept a target.`);
  }
  if (args.stage === 'red' && !args.expectedFailure?.trim()) {
    throw new CofofoEvidenceError('RED evidence requires an expected failure oracle.');
  }

  const clock = args.now ?? (() => new Date().toISOString());
  const startedAt = clock();
  const result = childProcess.spawnSync(spec.executable, commandArgs, {
    cwd: resolveInside(root, workingDirectory(args.profile)),
    encoding: 'utf8',
    timeout: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: FULL_LOG_BYTES * 2,
    env: process.env,
  });
  const finishedAt = clock();
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // The oracle answers whether the command genuinely failed in the intended
  // way. It must see the full, redacted output; the bounded form is storage
  // hygiene only and may remove the relevant line from a large test suite.
  const screened = redact(combined);
  const redacted = bounded(screened, FULL_LOG_BYTES);
  const timedOut = result.error != null && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
  const exitStatus = result.status;
  const oracleMatched = args.stage === 'red'
    ? Boolean(args.expectedFailure && screened.toLowerCase().includes(args.expectedFailure.toLowerCase()) && !COMPILE_FAILURE.test(screened))
    : undefined;
  const accepted = args.stage === 'red'
    ? exitStatus !== null && exitStatus !== 0 && !timedOut && oracleMatched === true
    : exitStatus === 0 && !timedOut;
  const sequence = records.length + 1;
  const logPath = `.aidlc/evidence/${args.runId}/${String(sequence).padStart(4, '0')}-${args.stage}.log`;
  writeAtomic(resolveInside(root, logPath), redacted);
  const previousHash = records.at(-1)?.recordHash;
  const draft: Omit<CofofoEvidenceRecord, 'recordHash'> = {
    schemaVersion: 2,
    id: `${args.runId}-${sequence}-${args.stage}`,
    runId: args.runId,
    sequence,
    stage: args.stage,
    stepRevision: args.stepRevision,
    commandId: spec.id,
    args: commandArgs,
    startedAt,
    finishedAt,
    exitStatus,
    timedOut,
    accepted,
    expectedFailure: args.expectedFailure,
    failureOracleMatched: oracleMatched,
    outputPreview: bounded(redacted, PREVIEW_BYTES),
    logPath,
    logHash: hashFile(resolveInside(root, logPath, true)),
    previousHash,
  };
  return saveRecord(root, args.runId, records, draft);
}

export function recordRedWaiver(args: {
  workspaceRoot: string;
  runId: string;
  reviewer: string;
  reason: string;
  alternativeEvidence: string;
  /** Revision of the reproduce/implement step currently receiving the waiver. */
  stepRevision: number;
  /** Current revisions of every evidence-owning phase in the run. */
  stageRevisions: EvidenceStageRevisions;
  now?: string;
}): CofofoEvidenceRecord {
  const root = fs.realpathSync(path.resolve(args.workspaceRoot));
  const records = readEvidenceLedger(root, args.runId);
  if (args.stageRevisions.red !== args.stepRevision) {
    throw new CofofoEvidenceError('RED waiver revision does not match the live reproduce/implement step.');
  }
  assertStageOrder(records, 'red-waiver', args.stageRevisions);
  if (records.some((record) => record.accepted && record.stage === 'red' && record.stepRevision === args.stepRevision)) {
    throw new CofofoEvidenceError('A RED waiver is not allowed after accepted RED evidence for this step revision.');
  }
  const reviewer = args.reviewer.trim();
  const reason = args.reason.trim();
  const alternativeEvidence = args.alternativeEvidence.trim();
  if (!reviewer || !reason || !alternativeEvidence) {
    throw new CofofoEvidenceError('A RED waiver requires reviewer identity, reason, and alternative evidence.');
  }
  const at = args.now ?? new Date().toISOString();
  const screenedEvidence = redact(alternativeEvidence);
  const sequence = records.length + 1;
  const logPath = `.aidlc/evidence/${args.runId}/${String(sequence).padStart(4, '0')}-red-waiver.log`;
  writeAtomic(resolveInside(root, logPath), screenedEvidence);
  const draft: Omit<CofofoEvidenceRecord, 'recordHash'> = {
    schemaVersion: 2,
    id: `${args.runId}-${sequence}-red-waiver`,
    runId: args.runId,
    sequence,
    stage: 'red-waiver',
    stepRevision: args.stepRevision,
    args: [],
    startedAt: at,
    finishedAt: at,
    exitStatus: null,
    timedOut: false,
    accepted: true,
    waiver: { reviewer, reason, alternativeEvidence: screenedEvidence },
    outputPreview: screenedEvidence,
    logPath,
    logHash: hashFile(resolveInside(root, logPath, true)),
    previousHash: records.at(-1)?.recordHash,
  };
  return saveRecord(root, args.runId, records, draft);
}

export function verifyEvidenceLedger(
  workspaceRoot: string,
  runId: string,
  supplied?: CofofoEvidenceRecord[],
): string[] {
  let records: CofofoEvidenceRecord[];
  try { records = supplied ?? readRaw(workspaceRoot, runId); }
  catch (error) { return [error instanceof Error ? error.message : String(error)]; }
  const issues: string[] = [];
  let previous: string | undefined;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.sequence !== index + 1) issues.push(`record ${index + 1}: non-contiguous sequence`);
    if (record.previousHash !== previous) issues.push(`record ${record.sequence}: hash chain mismatch`);
    const { recordHash, ...draft } = record;
    if (hashObject(draft) !== recordHash) issues.push(`record ${record.sequence}: record hash mismatch`);
    try {
      const log = resolveInside(workspaceRoot, record.logPath, true);
      if (hashFile(log) !== record.logHash) issues.push(`record ${record.sequence}: log hash mismatch`);
    } catch { issues.push(`record ${record.sequence}: log missing or unsafe`); }
    previous = recordHash;
  }
  return issues;
}

export function requireAcceptedEvidence(
  workspaceRoot: string,
  runId: string,
  stage: 'red' | 'green' | 'refactor' | 'verify',
  stepRevision: number,
): void {
  const records = readEvidenceLedger(workspaceRoot, runId);
  const accepted = stage === 'red'
    ? records.some((record) => record.accepted && record.stepRevision === stepRevision && (record.stage === 'red' || record.stage === 'red-waiver'))
    : records.some((record) => record.accepted && record.stepRevision === stepRevision && record.stage === stage);
  if (!accepted) throw new CofofoEvidenceError(`Run "${runId}" has no accepted machine evidence for stage "${stage}" at step revision ${stepRevision}.`);
}
