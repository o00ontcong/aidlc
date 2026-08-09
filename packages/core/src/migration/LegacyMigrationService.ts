/** Explicit, reversible migration from legacy delivery/run/epic files. */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  createDefaultAutonomyPolicy,
  formatEpicEventId,
  nowIso,
  toEpicId,
  type Epic,
  type EpicId,
  type EpicProfile,
} from '../contracts';
import { EpicStore, writeFileAtomic } from '../epic';
import { discoverLegacyRecords, readLegacyWorkspaceConfig, type LegacyKind, type LegacyRecord, type LegacyWorkspaceConfig } from './LegacyCompatibility';

export type MigrationStatus = 'preview' | 'applied' | 'rolled-back' | 'partial-failure';

export interface MigrationItem {
  source: { kind: LegacyKind; id: string; file: string };
  /** All legacy records correlated to the same logical Epic. `source` is retained for compatibility. */
  sources: Array<{ kind: LegacyKind; id: string; file: string }>;
  targetEpicId: EpicId;
  targetFile: string;
  disposition: 'create' | 'already-migrated' | 'conflict';
  warnings: string[];
}

export interface MigrationPreview {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: 'preview';
  workspace: LegacyWorkspaceConfig;
  items: MigrationItem[];
  sourceFiles: string[];
  warnings: string[];
}

export interface MigrationManifest {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  appliedAt?: string;
  status: MigrationStatus;
  sourceFiles: string[];
  createdTargets: string[];
  createdTargetHashes: Record<string, string>;
  backupDir: string;
  errors: string[];
  mappings?: Array<{ targetEpicId: EpicId; sourceFiles: string[] }>;
}

export interface ApplyMigrationOptions { confirm: boolean; }

function digest(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function fileDigest(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assertWorkspacePath(root: string, file: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(file);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing migration path outside workspace: ${file}`);
  }
  return resolved;
}

function safeEpicId(_kind: LegacyKind, id: string): EpicId {
  const normalized = id.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'LEGACY';
  return toEpicId(normalized.startsWith('EPIC-') ? normalized : `EPIC-${normalized}`);
}

function logicalId(record: LegacyRecord): string {
  const request = record.raw.request && typeof record.raw.request === 'object' ? record.raw.request as Record<string, unknown> : undefined;
  const candidate = record.raw.epicId ?? record.raw.epic ?? request?.epicId ?? record.raw.id ?? record.id;
  return String(candidate).replace(/--run-\d+$/i, '').replace(/^EPIC-/i, '').toUpperCase();
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function mapProfile(record: LegacyRecord): EpicProfile {
  if (record.kind === 'delivery' && Array.isArray(record.raw.workerRunIds) && record.raw.workerRunIds.length > 1) return 'parallel';
  return 'standard';
}

function mapEpic(record: LegacyRecord, id: EpicId, at: string): Epic {
  const request = record.raw.request && typeof record.raw.request === 'object' ? record.raw.request as Record<string, unknown> : undefined;
  const title = asText(request?.title ?? record.raw.title, `Migrated ${record.kind} ${record.id}`);
  const legacyDescription = asText(request?.description ?? record.raw.description, 'No legacy description was recorded.');
  // This marker makes a new preview recognize an already-created projection
  // without inventing another durable state field on the unified Epic.
  const description = `${legacyDescription}\n\nMigrated from ${record.file}. Audit source remains at its original path.`;
  const legacyStatus = String(record.raw.status ?? '');
  const status: Epic['status'] = legacyStatus === 'completed' ? 'completed'
    : legacyStatus === 'blocked' || legacyStatus === 'failed' ? 'blocked'
      : 'draft';
  return {
    schemaVersion: 1, id, title, description, type: 'feature', profile: mapProfile(record), status,
    autonomy: createDefaultAutonomyPolicy(), stages: [],
    createdAt: asText(record.raw.createdAt, at), updatedAt: asText(record.raw.updatedAt, at),
    blockedReason: status === 'blocked' ? asText(record.raw.lastError, 'Legacy state requires review before resume.') : undefined,
    revision: 0,
  };
}

function mapCorrelatedEpic(records: LegacyRecord[], id: EpicId, at: string): Epic {
  const primary = records.find((record) => record.kind === 'epic-scaffold') ?? records.find((record) => record.kind === 'delivery') ?? records[0]!;
  const base = mapEpic(primary, id, at);
  const statuses = records.map((record) => String(record.raw.status ?? ''));
  const status: Epic['status'] = statuses.some((value) => value === 'completed' || value === 'done') ? 'completed'
    : statuses.some((value) => value === 'blocked' || value === 'failed') ? 'blocked'
      : base.status;
  const parallel = records.some((record) => mapProfile(record) === 'parallel');
  return {
    ...base,
    profile: parallel ? 'parallel' : base.profile,
    status,
    description: `${base.description.split('\n\nMigrated from ')[0]}\n\nMigrated from ${records.map((record) => record.file).join(', ')}. Audit sources remain at their original paths.`,
    blockedReason: status === 'blocked' ? base.blockedReason ?? 'A correlated legacy record failed or was blocked; review source audit files.' : undefined,
  };
}

function backupFile(root: string, backupDir: string, file: string): void {
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing to backup source outside workspace: ${file}`);
  const target = path.join(backupDir, 'files', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
}

function legacyAuditEntries(record: LegacyRecord): unknown[] {
  const candidates = [record.raw.history, record.raw.events, record.raw.auditLog];
  return candidates.find(Array.isArray) ?? [];
}

/** W2B service. Preview is read-only; apply needs an explicit confirmation. */
export class LegacyMigrationService {
  private readonly store: EpicStore;
  constructor(readonly workspaceRoot: string, private readonly clock: () => string = nowIso) { this.store = new EpicStore(workspaceRoot); }

  preview(): MigrationPreview {
    const records = discoverLegacyRecords(this.workspaceRoot);
    const workspace = readLegacyWorkspaceConfig(this.workspaceRoot);
    const sources = records.map((record) => record.file);
    if (workspace.exists) sources.push(workspace.file);
    const id = `migration-${digest(sources.map((file) => path.relative(this.workspaceRoot, file)))}`;
    const groups = new Map<string, LegacyRecord[]>();
    for (const record of records) groups.set(logicalId(record), [...(groups.get(logicalId(record)) ?? []), record]);
    const items = [...groups.values()].map((correlated) => {
      const source = correlated[0]!;
      const targetEpicId = safeEpicId(source.kind, logicalId(source));
      const targetFile = this.store.epicStateFile(targetEpicId);
      const existing = this.store.loadEpic(targetEpicId);
      const warnings: string[] = [];
      let disposition: MigrationItem['disposition'] = 'create';
      if (existing) {
        disposition = correlated.every((record) => existing.description.includes(record.file)) ? 'already-migrated' : 'conflict';
        if (disposition === 'conflict') warnings.push(`Target ${targetEpicId} already exists and does not look like this migration.`);
      }
      return { source: { kind: source.kind, id: source.id, file: source.file }, sources: correlated.map((record) => ({ kind: record.kind, id: record.id, file: record.file })), targetEpicId, targetFile, disposition, warnings };
    });
    return { schemaVersion: 1, id, createdAt: this.clock(), status: 'preview', workspace, items, sourceFiles: sources.sort(), warnings: workspace.warnings };
  }

  manifestFile(id: string): string {
    if (!/^migration-[a-f0-9]{16}$/.test(id)) throw new Error(`Invalid migration id: ${id}`);
    return path.join(this.workspaceRoot, '.aidlc', 'migration-backups', id, 'manifest.json');
  }

  loadManifest(id: string): MigrationManifest | null {
    try { return JSON.parse(fs.readFileSync(this.manifestFile(id), 'utf8')) as MigrationManifest; } catch { return null; }
  }

  apply(preview: MigrationPreview, options: ApplyMigrationOptions): MigrationManifest {
    if (!options.confirm) throw new Error('Legacy migration requires explicit confirm: true. Preview never mutates legacy files.');
    const existing = this.loadManifest(preview.id);
    if (existing?.status === 'applied') return existing;
    if (preview.items.some((item) => item.disposition === 'conflict')) throw new Error('Migration preview has target conflicts; resolve them before apply.');
    const backupDir = path.dirname(this.manifestFile(preview.id));
    const manifest: MigrationManifest = existing ?? { schemaVersion: 1, id: preview.id, createdAt: this.clock(), status: 'preview', sourceFiles: preview.sourceFiles, createdTargets: [], createdTargetHashes: {}, backupDir, errors: [], mappings: preview.items.map((item) => ({ targetEpicId: item.targetEpicId, sourceFiles: item.sources.map((source) => source.file) })) };
    manifest.createdTargetHashes ??= {};
    try {
      for (const source of preview.sourceFiles) if (fs.existsSync(source)) backupFile(this.workspaceRoot, backupDir, source);
      // Persist the in-progress manifest before the first target write, so a
      // crash can be recovered by invoking apply again or explicit rollback.
      manifest.status = 'partial-failure';
      writeFileAtomic(this.manifestFile(preview.id), `${JSON.stringify(manifest, null, 2)}\n`);
      const records = new Map(discoverLegacyRecords(this.workspaceRoot).map((record) => [record.file, record]));
      for (const item of preview.items) {
        if (item.disposition === 'already-migrated') continue;
        const correlated = item.sources.map((source) => records.get(source.file));
        if (correlated.some((record) => !record)) throw new Error(`A correlated legacy source disappeared since preview: ${item.sources.map((source) => source.file).join(', ')}`);
        if (this.store.loadEpic(item.targetEpicId)) continue; // idempotent after a partial write
        const mapped = mapCorrelatedEpic(correlated as LegacyRecord[], item.targetEpicId, this.clock());
        this.store.saveEpic(mapped);
        manifest.createdTargets.push(item.targetFile);
        manifest.createdTargetHashes[item.targetFile] = fileDigest(item.targetFile);
        for (const source of correlated as LegacyRecord[]) {
          const entries = [
            { kind: 'source', file: source.file, legacyKind: source.kind, legacyId: source.id },
            ...legacyAuditEntries(source).map((entry) => ({ kind: 'legacy-event', entry })),
          ];
          for (const entry of entries) {
            const sequence = this.store.readEpicEvents(mapped.id).length + 1;
            this.store.appendEpicEvent(mapped.id, {
              schemaVersion: 1,
              id: formatEpicEventId(mapped.id, sequence),
              at: this.clock(),
              actor: { kind: 'system', id: 'legacy-migration' },
              epicId: mapped.id,
              command: 'migration.import',
              from: mapped.status,
              to: mapped.status,
              evidence: [{ kind: 'file', ref: path.relative(this.workspaceRoot, source.file), status: 'preserved' }],
              detail: JSON.stringify(entry),
            });
          }
        }
        const eventsFile = this.store.epicEventsFile(mapped.id);
        if (fs.existsSync(eventsFile)) {
          manifest.createdTargets.push(eventsFile);
          manifest.createdTargetHashes[eventsFile] = fileDigest(eventsFile);
        }
        writeFileAtomic(this.manifestFile(preview.id), `${JSON.stringify(manifest, null, 2)}\n`);
      }
      manifest.status = 'applied'; manifest.appliedAt = this.clock();
    } catch (error) {
      manifest.status = 'partial-failure'; manifest.errors.push(error instanceof Error ? error.message : String(error));
      writeFileAtomic(this.manifestFile(preview.id), `${JSON.stringify(manifest, null, 2)}\n`);
      throw error;
    }
    writeFileAtomic(this.manifestFile(preview.id), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  }

  /** Explicit rollback only removes projections this migration itself created; backups/legacy sources remain. */
  rollback(id: string, options: ApplyMigrationOptions): MigrationManifest {
    if (!options.confirm) throw new Error('Rollback requires explicit confirm: true.');
    const manifest = this.loadManifest(id);
    if (!manifest) throw new Error(`Migration manifest ${id} does not exist.`);
    if (manifest.status === 'rolled-back') return manifest;
    manifest.createdTargetHashes ??= {};
    for (const target of [...manifest.createdTargets].sort().reverse()) {
      const safeTarget = assertWorkspacePath(this.workspaceRoot, target);
      if (fs.existsSync(safeTarget)) {
        const expectedHash = manifest.createdTargetHashes[target];
        if (!expectedHash || fileDigest(safeTarget) !== expectedHash) {
          throw new Error(`Refusing to remove changed or unverifiable migration target: ${safeTarget}`);
        }
        fs.unlinkSync(safeTarget);
      }
      const dir = path.dirname(safeTarget);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
    manifest.status = 'rolled-back';
    writeFileAtomic(this.manifestFile(id), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  }
}
