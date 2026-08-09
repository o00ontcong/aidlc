import * as crypto from 'crypto';
import type { WorkflowPack } from './SdlcPacks';

export interface WorkflowPackLock {
  schemaVersion: 1;
  packId: string;
  version: string;
  hash: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Stable lock that changes whenever the descriptor/workflow policy changes. */
export function lockWorkflowPack(pack: WorkflowPack): WorkflowPackLock {
  return { schemaVersion: 1, packId: pack.id, version: pack.version, hash: `sha256:${crypto.createHash('sha256').update(stable(pack)).digest('hex')}` };
}
