import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { LegacyMigrationService, discoverLegacyRecords, readLegacyWorkspaceConfig } from '../src/migration';
import { EpicStore } from '../src/epic';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-migration-')); }
function json(file: string, value: unknown): void { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }

describe('LegacyMigrationService', () => {
  it('previews all legacy layouts without mutating anything', () => {
    const workspace = root();
    json(path.join(workspace, '.aidlc/deliveries/alerts/state.json'), { schemaVersion: 1, id: 'alerts', request: { title: 'Alerts', description: 'Build price alert preferences.' }, status: 'pending' });
    json(path.join(workspace, '.aidlc/runs/old-run.json'), { schemaVersion: 1, runId: 'old-run', status: 'running' });
    json(path.join(workspace, 'docs/epics/EPIC-OLD/state.json'), { schemaVersion: 1, id: 'EPIC-OLD', title: 'Old epic' });
    fs.mkdirSync(path.join(workspace, '.aidlc'), { recursive: true }); fs.writeFileSync(path.join(workspace, '.aidlc/workspace.yaml'), 'version: 1\n');
    const service = new LegacyMigrationService(workspace, () => '2026-08-09T00:00:00.000Z');
    const preview = service.preview();
    expect(preview.items.map((item) => item.source.kind)).toEqual(['delivery', 'run', 'epic-scaffold']);
    expect(preview.items.every((item) => item.disposition === 'create')).toBe(true);
    expect(fs.existsSync(path.join(workspace, '.aidlc/epics'))).toBe(false);
    expect(discoverLegacyRecords(workspace)).toHaveLength(3);
    expect(readLegacyWorkspaceConfig(workspace).raw).toEqual({ version: 1 });
  });

  it('requires explicit apply, keeps legacy sources, writes backup and rolls back only new targets', () => {
    const workspace = root();
    const source = path.join(workspace, '.aidlc/deliveries/alerts/state.json');
    json(source, { schemaVersion: 1, id: 'alerts', request: { title: 'Alerts', description: 'Build price alert preferences.' }, status: 'pending' });
    const service = new LegacyMigrationService(workspace, () => '2026-08-09T00:00:00.000Z');
    const preview = service.preview();
    expect(() => service.apply(preview, { confirm: false })).toThrow(/explicit confirm/);
    const applied = service.apply(preview, { confirm: true });
    expect(applied.status).toBe('applied');
    expect(fs.existsSync(source)).toBe(true);
    expect(fs.existsSync(path.join(applied.backupDir, 'files/.aidlc/deliveries/alerts/state.json'))).toBe(true);
    expect(fs.existsSync(preview.items[0].targetFile)).toBe(true);
    expect(service.apply(preview, { confirm: true })).toEqual(applied);
    expect(service.preview().items[0].disposition).toBe('already-migrated');
    expect(service.rollback(preview.id, { confirm: true }).status).toBe('rolled-back');
    expect(fs.existsSync(preview.items[0].targetFile)).toBe(false);
    expect(fs.existsSync(source)).toBe(true);
  });

  it('never deletes a rollback target outside the workspace or one changed after migration', () => {
    const workspace = root();
    const outside = path.join(root(), 'keep.txt');
    fs.writeFileSync(outside, 'keep');
    const service = new LegacyMigrationService(workspace);
    const id = 'migration-0123456789abcdef';
    json(service.manifestFile(id), {
      schemaVersion: 1, id, createdAt: '2026-08-09T00:00:00.000Z', status: 'applied',
      sourceFiles: [], createdTargets: [outside], createdTargetHashes: {}, backupDir: path.dirname(service.manifestFile(id)), errors: [],
    });
    expect(() => service.rollback(id, { confirm: true })).toThrow(/outside workspace/);
    expect(fs.readFileSync(outside, 'utf8')).toBe('keep');
  });

  it('correlates delivery/run/epic records and imports preserved audit references', () => {
    const workspace = root();
    json(path.join(workspace, '.aidlc/deliveries/ALERTS/state.json'), { id: 'ALERTS', epicId: 'EPIC-ALERTS', status: 'pending', history: [{ action: 'planned' }] });
    json(path.join(workspace, '.aidlc/runs/alerts-run.json'), { runId: 'alerts-run', epicId: 'EPIC-ALERTS', status: 'running', events: [{ action: 'built' }] });
    json(path.join(workspace, 'docs/epics/EPIC-ALERTS/state.json'), { id: 'EPIC-ALERTS', title: 'Alerts', status: 'pending' });
    const service = new LegacyMigrationService(workspace, () => '2026-08-09T00:00:00.000Z');
    const preview = service.preview();
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].sources).toHaveLength(3);
    const manifest = service.apply(preview, { confirm: true });
    expect(manifest.mappings).toEqual([{ targetEpicId: 'EPIC-ALERTS', sourceFiles: expect.arrayContaining(preview.sourceFiles) }]);
    const store = new EpicStore(workspace);
    const events = store.readEpicEvents('EPIC-ALERTS' as never);
    expect(events).toHaveLength(5);
    expect(events.every((event) => event.command === 'migration.import')).toBe(true);
    expect(events.map((event) => event.evidence[0]?.ref)).toEqual(expect.arrayContaining([
      '.aidlc/deliveries/ALERTS/state.json', '.aidlc/runs/alerts-run.json', 'docs/epics/EPIC-ALERTS/state.json',
    ]));
  });
});
