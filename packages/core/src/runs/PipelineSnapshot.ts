/** Immutable pipeline snapshots protect in-flight runs from preset upgrades. */
import * as crypto from 'crypto';

import type { PipelineConfig } from '../schema/WorkspaceSchema';
import type { RunState } from './RunState';

export interface PipelineSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  hash: string;
  pipeline: PipelineConfig;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function pipelineHash(pipeline: PipelineConfig): string {
  return `sha256:${crypto.createHash('sha256').update(stable(pipeline)).digest('hex')}`;
}

export function snapshotPipeline(pipeline: PipelineConfig, capturedAt = new Date().toISOString()): PipelineSnapshot {
  const copy = JSON.parse(JSON.stringify(pipeline)) as PipelineConfig;
  return { schemaVersion: 1, capturedAt, hash: pipelineHash(copy), pipeline: copy };
}

/** Prefer the frozen pipeline captured with the run; supports pre-v2 state files. */
export function pipelineForRun(state: RunState, fallback?: PipelineConfig): PipelineConfig | null {
  return state.pipelineSnapshot?.pipeline ?? fallback ?? null;
}
