import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { redactSecrets } from '../release/ReleaseVerification';
import type { ExecutionFailureRef, RunState } from './RunState';
import { RunStateStore } from './RunStateStore';

const MAX_CAPTURE_CHARS = 64 * 1024;

export interface ExecutionFailureLog extends ExecutionFailureRef {
  schemaVersion: 1;
  runId: string;
  pipelineId: string;
  detail?: string;
  stdout?: string;
  stderr?: string;
  missing?: string[];
  exitCode?: number;
}

export interface RecordExecutionFailureInput {
  code?: string;
  summary: string;
  detail?: string;
  stdout?: string;
  stderr?: string;
  missing?: string[];
  exitCode?: number;
  stepIdx?: number;
  agent?: string;
  retryable?: boolean;
  recoveryCommands?: string[];
}

function clipped(value?: string): string | undefined {
  if (!value) return undefined;
  return value.length <= MAX_CAPTURE_CHARS
    ? value
    : `${value.slice(0, MAX_CAPTURE_CHARS)}\n… [truncated ${value.length - MAX_CAPTURE_CHARS} characters]`;
}

function classify(input: RecordExecutionFailureInput): { code: string; recoveryCommands: string[] } {
  if (input.code) return { code: input.code, recoveryCommands: input.recoveryCommands ?? [] };
  const evidence = [input.summary, input.detail, input.stdout, input.stderr].filter(Boolean).join('\n');
  if (/not logged in|please run\s+\/login|authentication required/i.test(evidence)) {
    return { code: 'runner.authentication_required', recoveryCommands: ['claude /login'] };
  }
  if (/failed to spawn|enoent|command not found/i.test(evidence)) {
    return { code: 'runner.unavailable', recoveryCommands: ['claude --version'] };
  }
  if (input.missing?.length) {
    return { code: 'runner.artifacts_missing', recoveryCommands: [] };
  }
  return { code: 'runner.execution_failed', recoveryCommands: input.recoveryCommands ?? [] };
}

/** Persist one append-only, secret-redacted failure and link it from run state. */
export function recordExecutionFailure(
  workspaceRoot: string,
  state: RunState,
  input: RecordExecutionFailureInput,
): ExecutionFailureRef {
  const id = `failure-${randomUUID()}`;
  const at = new Date().toISOString();
  const classified = classify(input);
  const relative = path.join('.aidlc', 'runs', state.runId, 'logs', `${id}.json`);
  const recoveryCommands = [...new Set([
    ...classified.recoveryCommands,
    ...(input.recoveryCommands ?? []),
    `aidlc run exec ${state.runId}`,
  ])];
  const log = redactSecrets<ExecutionFailureLog>({
    schemaVersion: 1,
    id,
    at,
    code: classified.code,
    summary: input.summary,
    detail: input.detail,
    stdout: clipped(input.stdout),
    stderr: clipped(input.stderr),
    missing: input.missing,
    exitCode: input.exitCode,
    runId: state.runId,
    pipelineId: state.pipelineId,
    stepIdx: input.stepIdx,
    agent: input.agent,
    logPath: relative,
    retryable: input.retryable ?? true,
    recoveryCommands,
  });

  const absolute = path.join(workspaceRoot, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temp = `${absolute}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, absolute);

  const ref: ExecutionFailureRef = {
    id: log.id,
    at: log.at,
    code: log.code,
    summary: log.summary,
    logPath: log.logPath,
    retryable: log.retryable,
    recoveryCommands: log.recoveryCommands,
    stepIdx: log.stepIdx,
    agent: log.agent,
  };
  state.lastFailure = ref;
  state.failureHistory = [...(state.failureHistory ?? []), ref];
  if (typeof input.stepIdx === 'number' && state.steps[input.stepIdx]) {
    state.steps[input.stepIdx].lastFailureId = id;
  }
  RunStateStore.save(workspaceRoot, state);
  return ref;
}
