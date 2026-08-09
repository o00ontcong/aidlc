/**
 * Read-only compatibility layer for the pre-redesign workspace layouts.
 *
 * Migration deliberately discovers legacy data without importing or mutating
 * the old state machines. This keeps `preview()` safe to call from UI/CLI and
 * makes a migration an explicit, auditable operation.
 */
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export type LegacyKind = 'delivery' | 'run' | 'epic-scaffold' | 'workspace';

export interface LegacyRecord {
  kind: LegacyKind;
  id: string;
  file: string;
  raw: Record<string, unknown>;
  updatedAt?: string;
}

export interface LegacyWorkspaceConfig {
  exists: boolean;
  file: string;
  raw?: Record<string, unknown>;
  warnings: string[];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readJsonObject(file: string): Record<string, unknown> | undefined {
  try { return object(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return undefined; }
}

function entries(dir: string): fs.Dirent[] {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/** Converts a discovered JSON document to a compatibility record if valid. */
function record(kind: LegacyKind, id: string, file: string): LegacyRecord | undefined {
  const raw = readJsonObject(file);
  if (!raw) return undefined;
  return { kind, id, file, raw, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined };
}

/**
 * Discovers only the old layouts. New `.aidlc/epics/<id>/state.json` and
 * `.aidlc/runs/<id>/state.json` projections are intentionally ignored.
 */
export function discoverLegacyRecords(workspaceRoot: string): LegacyRecord[] {
  const found: LegacyRecord[] = [];
  const deliveries = path.join(workspaceRoot, '.aidlc', 'deliveries');
  for (const entry of entries(deliveries)) {
    if (!entry.isDirectory()) continue;
    const value = record('delivery', entry.name, path.join(deliveries, entry.name, 'state.json'));
    if (value) found.push(value);
  }

  const runs = path.join(workspaceRoot, '.aidlc', 'runs');
  for (const entry of entries(runs)) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const value = record('run', entry.name.slice(0, -'.json'.length), path.join(runs, entry.name));
    if (value) found.push(value);
  }

  const epics = path.join(workspaceRoot, 'docs', 'epics');
  for (const entry of entries(epics)) {
    if (!entry.isDirectory()) continue;
    const value = record('epic-scaffold', entry.name, path.join(epics, entry.name, 'state.json'));
    if (value) found.push(value);
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** Read current workspace.yaml tolerantly: legacy fields stay opaque. */
export function readLegacyWorkspaceConfig(workspaceRoot: string): LegacyWorkspaceConfig {
  const file = path.join(workspaceRoot, '.aidlc', 'workspace.yaml');
  if (!fs.existsSync(file)) return { exists: false, file, warnings: [] };
  try {
    const parsed = object(yaml.load(fs.readFileSync(file, 'utf8')));
    if (!parsed) return { exists: true, file, warnings: ['workspace.yaml must contain a mapping.'] };
    return { exists: true, file, raw: parsed, warnings: [] };
  } catch (error) {
    return { exists: true, file, warnings: [`Unable to parse workspace.yaml: ${error instanceof Error ? error.message : String(error)}`] };
  }
}
