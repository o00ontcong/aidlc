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

export type EvidenceStageRevisions = Record<'verify', number>;

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

  const testIdx = stepIndexByName(pipeline, 'test');
  const verify = byDeclaredStage.verify
    ?? (testIdx >= 0 ? stepRevisionAt(state, testIdx) : undefined);

  if (!verify) {
    throw new CofofoEvidenceError(`Run "${state.runId}" is missing an evidence-owning delivery phase.`);
  }
  return { verify };
}

const PREVIEW_BYTES = 16 * 1024;
const FULL_LOG_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TARGET = /^[A-Za-z0-9_./:\[\]-]{1,200}$/;

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

/** Accepted VERIFY records whose evidence belongs to the currently-live test revision. */
export function acceptedStages(
  records: CofofoEvidenceRecord[],
  revisions: EvidenceStageRevisions,
): Set<CofofoEvidenceStage> {
  if (records.some((record) => record.accepted && record.stage === 'verify' && record.stepRevision === revisions.verify)) {
    return new Set(['verify']);
  }
  return new Set();
}

export function expectedNext(
  _records: CofofoEvidenceRecord[],
  _revisions: EvidenceStageRevisions,
): CofofoEvidenceStage {
  return 'verify';
}

export function assertStageOrder(
  _records: CofofoEvidenceRecord[],
  stage: CofofoEvidenceStage,
  _revisions: EvidenceStageRevisions,
): void {
  if (stage !== 'verify') {
    throw new CofofoEvidenceError(`Evidence stage "${stage}" is not a delivery evidence stage; next required stage is "verify".`);
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
  stage: CofofoEvidenceStage;
  commandId: string;
  target?: string;
  timeoutMs?: number;
  /** Revision of the phase step currently receiving this evidence. */
  stepRevision: number;
  /** Current revisions of every evidence-owning phase in the run. */
  stageRevisions: EvidenceStageRevisions;
  now?: () => string;
}): CofofoEvidenceRecord {
  const root = fs.realpathSync(path.resolve(args.workspaceRoot));
  const selection = selectCatalog(args.profile);
  if (!selection) throw new CofofoEvidenceError('Command allow-list requires a single detected stack.');
  const records = readEvidenceLedger(root, args.runId);
  if (args.stageRevisions.verify !== args.stepRevision) {
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
  const screened = redact(combined);
  const redacted = bounded(screened, FULL_LOG_BYTES);
  const timedOut = result.error != null && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
  const exitStatus = result.status;
  const accepted = exitStatus === 0 && !timedOut;
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
    outputPreview: bounded(redacted, PREVIEW_BYTES),
    logPath,
    logHash: hashFile(resolveInside(root, logPath, true)),
    previousHash,
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
  stage: CofofoEvidenceStage,
  stepRevision: number,
): void {
  const records = readEvidenceLedger(workspaceRoot, runId);
  const accepted = records.some((record) => record.accepted && record.stepRevision === stepRevision && record.stage === stage);
  if (!accepted) throw new CofofoEvidenceError(`Run "${runId}" has no accepted machine evidence for stage "${stage}" at step revision ${stepRevision}.`);
}
