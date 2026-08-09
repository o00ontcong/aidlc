import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ProjectLayoutMigrationService } from '../src/release/ProjectLayoutMigration';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-layout-')); }

describe('ProjectLayoutMigrationService', () => {
  it('previews and explicitly creates only standard files, canonical assets and approved artifacts', () => {
    const workspace = root();
    fs.writeFileSync(path.join(workspace, 'CLAUDE.md'), 'user instructions\n');
    fs.mkdirSync(path.join(workspace, '.aidlc/runtime'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.aidlc/runtime/review.md'), 'runtime evidence');
    const service = new ProjectLayoutMigrationService(workspace, () => '2026-08-09T00:00:00.000Z');
    const preview = service.preview({
      canonicalAssets: [{ kind: 'agent', path: 'ios.md', content: '# iOS agent\n' }],
      artifactPolicy: { schemaVersion: 1, defaults: { persist: 'runtime', commit: false }, types: { report: { path: 'docs/epics/{epic}/REPORT.md', commit: true }, scratch: { path: 'docs/epics/{epic}/SCRATCH.md' } } },
      artifactCandidates: [{ type: 'report', source: '.aidlc/runtime/review.md', epicId: 'EPIC-1' }, { type: 'scratch', source: '.aidlc/runtime/review.md', epicId: 'EPIC-1' }],
    });
    expect(preview.items.find((item) => item.path === 'docs/epics/EPIC-1/REPORT.md')?.disposition).toBe('create');
    expect(preview.items.find((item) => item.path === '.aidlc/runtime/review.md')?.disposition).toBe('skipped');
    expect(preview.preservedFiles).toEqual(['CLAUDE.md', 'AGENTS.md']);
    expect(() => service.apply(preview, false)).toThrow(/explicit confirm/);
    const applied = service.apply(preview, true);
    expect(fs.existsSync(path.join(workspace, '.aidlc/project.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, '.aidlc/workflows/default.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, '.claude/settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, '.claude/agents/ios.md'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, '.aidlc/locks/canonical-assets.json'))).toBe(true);
    expect(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8')).toBe('user instructions\n');
    expect(fs.readFileSync(path.join(workspace, 'docs/epics/EPIC-1/REPORT.md'), 'utf8')).toBe('runtime evidence');
    expect(applied.createdFiles).toContain('.aidlc/project.yaml');
  });

  it('does not overwrite user-managed standard files', () => {
    const workspace = root();
    fs.mkdirSync(path.join(workspace, '.aidlc'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.aidlc/project.yaml'), 'custom: true\n');
    const service = new ProjectLayoutMigrationService(workspace);
    const preview = service.preview();
    expect(preview.items.find((item) => item.path === '.aidlc/project.yaml')?.disposition).toBe('conflict');
    expect(() => service.apply(preview, true)).toThrow(/conflicts/);
  });

  it('merges only managed gitignore entries and rejects asset traversal before reading files', () => {
    const workspace = root();
    fs.writeFileSync(path.join(workspace, '.gitignore'), 'node_modules/\n');
    const service = new ProjectLayoutMigrationService(workspace);
    const preview = service.preview();
    expect(preview.items.find((item) => item.path === '.gitignore')?.disposition).toBe('update-managed');
    expect(() => service.preview({ canonicalAssets: [{ kind: 'skill', path: '../../../../escape.md', content: 'nope' }] })).toThrow(/outside the workspace/);
    service.apply(preview, true);
    expect(fs.readFileSync(path.join(workspace, '.gitignore'), 'utf8')).toContain('.aidlc/cache/');
  });

  it('rejects an approved artifact source that escapes through a symlink', () => {
    const workspace = root();
    const outside = root();
    fs.writeFileSync(path.join(outside, 'secret.md'), 'must not be copied');
    fs.symlinkSync(outside, path.join(workspace, 'outside-link'));
    const service = new ProjectLayoutMigrationService(workspace);

    expect(() => service.preview({
      artifactPolicy: { schemaVersion: 1, defaults: { persist: 'runtime', commit: false }, types: { report: { path: 'docs/{epic}.md', commit: true } } },
      artifactCandidates: [{ type: 'report', source: 'outside-link/secret.md', epicId: 'EPIC-1' }],
    })).toThrow(/unsafe artifact source/);
  });
});
