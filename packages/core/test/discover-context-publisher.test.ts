import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscoverContextPublisher,
  DiscoverService,
  WorkspaceLoader,
  diagnoseCofofoBinding,
  parseDetailFields,
  DOC_FEATURES,
  DOC_IMPLEMENTATION_PLAN,
  DOC_REQUIREMENTS,
  type ActorRef,
} from '../src';

const USER: ActorRef = { kind: 'user', id: 'test' };
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }); }
});

function write(root: string, relative: string, content: string): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
}

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-discover-publish-'));
  roots.push(root);
  return root;
}

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

function initGit(root: string): void {
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@aidlc.dev']);
  git(root, ['config', 'user.name', 'AIDLC Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'initial']);
}

/** A minimal but internally-consistent Discover blueprint: one draft FR cited by one draft Feature. */
function seedBlueprint(root: string): DiscoverService {
  const service = new DiscoverService(root);
  service.init({ seedSentence: 'App theo doi nhiet do.', actor: USER });
  service.applyOps(DOC_REQUIREMENTS, [
    { op: 'addItem', section: 'functional', text: 'Canh bao khi nhiet do vuot nguong.' },
  ], { actor: USER });
  service.applyOps(DOC_FEATURES, [
    { op: 'addItem', section: 'features', group: 'alert', text: 'Canh bao nhiet do — FR-01.' },
  ], { actor: USER });
  return service;
}

describe('DiscoverContextPublisher', () => {
  it('reports missing/draft status before any publish', () => {
    const root = temporary();
    seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);
    const inspection = publisher.inspect();
    expect(inspection.status).toBe('draft');
    expect(publisher.loadPublished()).toBeNull();
  });

  it('publishes a revision, is idempotent, and only creates history events on real content change', () => {
    const root = temporary();
    seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);

    const first = publisher.publish({ actor: USER, reason: 'Initial publish.' });
    expect(first.discoverRevision).toMatch(/^DREV-[0-9a-f]{12}$/);
    expect(first.parentRevision).toBeNull();
    expect(first.entities.map((entity) => entity.id)).toEqual(['F-ALERT-01', 'FR-01']);

    // Re-publishing unchanged canonical docs must not mint a new revision.
    const again = publisher.publish({ actor: USER, reason: 'No-op republish.' });
    expect(again.discoverRevision).toBe(first.discoverRevision);
    expect(publisher.historyFor('FR-01')).toHaveLength(1);

    const inspection = publisher.inspect();
    expect(inspection.status).toBe('ready');
    expect(inspection.context?.discoverRevision).toBe(first.discoverRevision);
  });

  it('stays READY when only Discover index.revision bookkeeping moves after publish', () => {
    const root = temporary();
    const service = seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);
    const published = publisher.publish({ actor: USER, reason: 'Baseline publish.' });
    expect(publisher.inspect().status).toBe('ready');

    // Sidecar revision bumps used to poison canonicalHash even when docs and
    // source were unchanged — the exact failure after Publish → Start Epic.
    const before = service.require().revision;
    service.setCurrentStep(service.require().currentStep);
    expect(service.require().revision).toBe(before + 1);
    // Even if reindex rewrites a doc hash normalization edge-case, READY must
    // remain content-based — not tied to the sidecar counter.
    service.reindexAll(USER);

    const inspection = publisher.inspect();
    expect(inspection.status).toBe('ready');
    expect(inspection.context?.discoverRevision).toBe(published.discoverRevision);
  });

  it('records a semantic history event with the human-provided reason when an entity changes', () => {
    const root = temporary();
    const service = seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);
    publisher.publish({ actor: USER, reason: 'Initial publish.' });

    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'updateItem', id: 'FR-01', text: 'Canh bao khi nhiet do vuot nguong an toan.' },
    ], { actor: USER });
    const revised = publisher.publish({ actor: USER, reason: 'Tighten the requirement wording.' });
    expect(revised.parentRevision).toBe(publisher.historyFor('FR-01')[1]!.discoverRevision);

    const history = publisher.historyFor('FR-01');
    expect(history).toHaveLength(2);
    expect(history[0]!.reason).toBe('Tighten the requirement wording.');
    expect(history[0]!.changeType).toBe('updated');
    expect(history[0]!.changedFields).toContain('title');
    expect(history[1]!.changeType).toBe('created');

    const detail = publisher.historyDetailsFor('FR-01')[0]!;
    expect(detail.before?.title).toBe('Canh bao khi nhiet do vuot nguong.');
    expect(detail.after?.title).toBe('Canh bao khi nhiet do vuot nguong an toan.');

    const publishHistory = publisher.listPublishHistory();
    expect(publishHistory).toHaveLength(2);
    expect(publishHistory[0]!.discoverRevision).toBe(revised.discoverRevision);
    expect(publishHistory[0]!.title).toBe('Tighten the requirement wording.');
    expect(publishHistory[0]!.reason).toBe('Tighten the requirement wording.');
    expect(publishHistory[0]!.isCurrent).toBe(true);
    expect(publishHistory[1]!.isCurrent).toBe(false);
    expect(publishHistory[0]!.parentRevision).toBe(publishHistory[1]!.discoverRevision);
  });

  it('previewPublishDiff reports entity/doc deltas vs the last publish', () => {
    const root = temporary();
    const service = seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);

    const firstPreview = publisher.previewPublishDiff();
    expect(firstPreview.hasPrevious).toBe(false);
    expect(firstPreview.unchanged).toBe(false);
    expect(firstPreview.entities.map((e) => e.id).sort()).toEqual(['F-ALERT-01', 'FR-01']);
    expect(firstPreview.entities.every((e) => e.change === 'created')).toBe(true);

    publisher.publish({ actor: USER, title: 'Baseline', description: 'Ready.' });
    expect(publisher.previewPublishDiff().unchanged).toBe(true);
    expect(publisher.previewPublishDiff().entities).toEqual([]);

    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'updateItem', id: 'FR-01', text: 'Canh bao khi nhiet do vuot nguong an toan.' },
    ], { actor: USER });

    const dirty = publisher.previewPublishDiff();
    expect(dirty.hasPrevious).toBe(true);
    expect(dirty.unchanged).toBe(false);
    expect(dirty.previousTitle).toBe('Baseline');
    expect(dirty.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'FR-01',
        change: 'updated',
        beforeTitle: 'Canh bao khi nhiet do vuot nguong.',
        title: 'Canh bao khi nhiet do vuot nguong an toan.',
      }),
    ]));
    expect(dirty.documents.some((doc) => doc.path === DOC_REQUIREMENTS && doc.change === 'updated')).toBe(true);
  });

  it('stays READY when Publish rewrites provider stubs or docs/epics change, but stales on product source edits', () => {
    const root = temporary();
    write(root, 'src/app.ts', 'export const version = 1;\n');
    write(root, '.cursor/commands/cofofo-feature-implement.md', 'Context hash: pending\n');
    write(root, 'docs/epics/EPIC-001/state.json', '{"ok":true}\n');
    seedBlueprint(root);
    initGit(root);

    const publisher = new DiscoverContextPublisher(root);
    publisher.publish({ actor: USER, title: 'Baseline' });
    expect(publisher.inspect().status).toBe('ready');

    // Exact failure from the wild: Publish Context embeds the new hash into
    // provider command files, and deleting epic workspaces dirties docs/.
    write(root, '.cursor/commands/cofofo-feature-implement.md', 'Context hash: sha256:deadbeef\n');
    write(root, '.claude/commands/cofofo-feature-implement.md', 'Context hash: sha256:deadbeef\n');
    fs.rmSync(path.join(root, 'docs/epics/EPIC-001'), { recursive: true, force: true });
    expect(publisher.inspect().status).toBe('ready');
    expect(publisher.previewPublishDiff()).toEqual(expect.objectContaining({
      unchanged: true,
      source: expect.objectContaining({ changed: false, changedPaths: [] }),
    }));

    write(root, 'src/app.ts', 'export const version = 2;\n');
    expect(publisher.inspect().status).toBe('stale');
    expect(publisher.previewPublishDiff().source.changedPaths).toContain('src/app.ts');
  });

  it('creates a context pack from the last publish even when inspect() is stale', () => {
    const root = temporary();
    write(root, 'src/app.ts', 'export const version = 1;\n');
    seedBlueprint(root);
    initGit(root);
    const publisher = new DiscoverContextPublisher(root);
    const published = publisher.publish({ actor: USER, title: 'Baseline' });
    expect(publisher.inspect().status).toBe('ready');

    write(root, 'src/app.ts', 'export const version = 2;\n');
    const inspection = publisher.inspect();
    expect(inspection.status).toBe('stale');
    expect(inspection.context?.contextHash).toBe(published.contextHash);

    const pack = publisher.createContextPack({ taskKind: 'feature' });
    expect(pack.contextRef.contextHash).toBe(published.contextHash);
    expect(pack.contextRef.discoverRevision).toBe(published.discoverRevision);
  });

  it('refuses a context pack when Discover has never been published', () => {
    const root = temporary();
    seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);
    expect(publisher.inspect().status).toBe('draft');
    expect(() => publisher.createContextPack({ taskKind: 'feature' })).toThrow(/has not been published/i);
  });

  it('stores title and description on the publish revision and surfaces them in history', () => {
    const root = temporary();
    const service = seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);
    const first = publisher.publish({
      actor: USER,
      title: 'Baseline ready',
      description: 'Requirements and features confirmed for handoff.',
    });
    expect(first.title).toBe('Baseline ready');
    expect(first.description).toBe('Requirements and features confirmed for handoff.');

    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'updateItem', id: 'FR-01', text: 'Canh bao khi nhiet do vuot nguong an toan.' },
    ], { actor: USER });
    const second = publisher.publish({
      actor: USER,
      title: 'Tighten FR wording',
      description: 'Clarify threshold language before delivery.',
    });

    const history = publisher.listPublishHistory();
    expect(history[0]!.discoverRevision).toBe(second.discoverRevision);
    expect(history[0]!.title).toBe('Tighten FR wording');
    expect(history[0]!.description).toBe('Clarify threshold language before delivery.');
    expect(history[1]!.title).toBe('Baseline ready');
  });

  it('writes real code, test, entry-point, dependency, and architecture reconciliation evidence', () => {
    const root = temporary();
    seedBlueprint(root);
    write(root, 'package.json', JSON.stringify({ name: 'demo', dependencies: { vitest: '^4.0.0' }, main: 'src/index.ts' }));
    write(root, 'src/index.ts', 'export * from "./alert";\n');
    write(root, 'src/alert.ts', 'export function alert() { return true; }\n');
    write(root, 'src/alert.test.ts', 'import { alert } from "./alert";\nvoid alert;\n');
    const publisher = new DiscoverContextPublisher(root);
    const context = publisher.publish({ actor: USER, reason: 'Capture brownfield evidence.' });
    const index = JSON.parse(fs.readFileSync(path.join(root, '.aidlc/discover/code-index.json'), 'utf8')) as {
      generated: boolean; doNotEdit: boolean; discoverRevision: string;
      dependencies: Array<{ path: string; names: string[] }>;
      entryPoints: string[];
      entries: Array<{ id: string; status: string; paths: string[]; testPaths: string[] }>;
    };
    expect(index.generated).toBe(true);
    expect(index.doNotEdit).toBe(true);
    expect(index.discoverRevision).toBe(context.discoverRevision);
    expect(index.dependencies).toContainEqual(expect.objectContaining({ path: 'package.json', names: ['vitest'] }));
    expect(index.entryPoints).toContain('src/index.ts');
    expect(index.entries.find((entry) => entry.id === 'F-ALERT-01')).toMatchObject({
      status: 'implemented', paths: expect.arrayContaining(['src/alert.ts']), testPaths: expect.arrayContaining(['src/alert.test.ts']),
    });

    const pack = publisher.createContextPack({ taskKind: 'bugfix', bugScopeId: 'F-ALERT-01' });
    expect(pack.sourcePaths).toEqual(expect.arrayContaining(['src/alert.ts', 'src/alert.test.ts']));
  });

  it('parses detail fields from an item description into structured fields', () => {
    const fields = parseDetailFields([
      '- **Statement:** He thong phai canh bao trong vong 5 giay.',
      '- **Acceptance criteria:**',
      '  - Given nhiet do > 40C, when do xong, then gui canh bao.',
    ].join('\n'));
    expect(fields.statement).toEqual(['He thong phai canh bao trong vong 5 giay.']);
    expect(fields['acceptance criteria']).toEqual(['Given nhiet do > 40C, when do xong, then gui canh bao.']);
  });

  it('creates a token-bounded context pack scoped to a phase citation graph', () => {
    const root = temporary();
    const service = new DiscoverService(root);
    service.init({ seedSentence: 'App theo doi nhiet do.', actor: USER });
    service.applyOps(DOC_REQUIREMENTS, [
      {
        op: 'addItem', section: 'functional', text: 'Canh bao khi nhiet do vuot nguong.',
        description: [
          '- **Status:** Ready',
          '- **Statement:** He thong gui canh bao khi nhiet do vuot nguong an toan.',
          '- **Rationale:** Nguoi dung can biet ngay khi co nguy co qua nhiet.',
          '- **Acceptance criteria:** Given nhiet do > 40C, when he thong kiem tra, then gui canh bao trong 5 giay.',
          '- **Verification method:** Kiem thu tich hop voi cam bien gia lap.',
          '- **Owner:** demo-owner',
        ].join('\n'),
      },
    ], { actor: USER });
    service.applyOps(DOC_FEATURES, [
      {
        op: 'addItem', section: 'features', group: 'alert', text: 'Canh bao nhiet do — FR-01.',
        description: [
          '- **Status:** Ready',
          '- **Problem:** Nguoi dung khong biet khi nhiet do vuot nguong.',
          '- **Desired outcome:** Nhan canh bao kip thoi.',
          '- **In scope:** Canh bao qua app.',
          '- **Definition of done:** Canh bao hien thi dung luc.',
          '- **Owner:** demo-owner',
        ].join('\n'),
      },
    ], { actor: USER });
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord', section: 'phases', title: 'Alerting',
        fields: [
          { label: 'Goal', value: 'Canh bao nguoi dung dung luc.' },
          { label: 'Deliverables', items: ['F-ALERT-01 hoat dong'] },
        ],
      },
    ], { actor: USER });
    const publisher = new DiscoverContextPublisher(root);
    publisher.publish({ actor: USER, reason: 'Initial publish.' });

    const pack = publisher.createContextPack({ taskKind: 'feature', phaseId: 'PH-01' });
    expect(pack.estimatedTokens).toBeLessThanOrEqual(3000);
    expect(pack.entities.map((entity) => entity.id).sort()).toEqual(['F-ALERT-01', 'FR-01']);
    expect(pack.contextRef.discoverRevision).toBe(publisher.loadPublished()!.discoverRevision);

    const loaded = publisher.loadContextPack(publisher.contextPackPath(pack.contextRef.packHash));
    expect(loaded?.contextRef.packHash).toBe(pack.contextRef.packHash);
  });

  it('auto-installs an ECC bundle for the detected stack and binds it onto the delivery pipelines', () => {
    const root = temporary();
    seedBlueprint(root);
    write(root, 'package.json', '{"name":"demo","engines":{"node":">=20"}}\n');
    const publisher = new DiscoverContextPublisher(root);
    publisher.publish({ actor: USER, reason: 'Initial publish.' });

    expect(fs.existsSync(path.join(root, '.aidlc/discover/runtime/ecc-assets.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.aidlc/discover/runtime/bundle-binding.json'))).toBe(true);

    const config = WorkspaceLoader.load(root).config;
    expect(config.pipelines.some((pipeline) => pipeline.id === 'cofofo-feature')).toBe(true);
    const allSkillIds = config.agents.flatMap((agent) => agent.skills);
    expect(allSkillIds.some((id) => id.startsWith('ecc-'))).toBe(true);
    expect(diagnoseCofofoBinding(root)).toEqual([]);

    const workspacePath = path.join(root, '.aidlc/workspace.yaml');
    const tampered = fs.readFileSync(workspacePath, 'utf8').replace(
      /ecc-[a-z0-9-]+/,
      'ecc-not-installed-skill',
    );
    fs.writeFileSync(workspacePath, tampered, 'utf8');
    const issues = diagnoseCofofoBinding(root);
    expect(issues.some((issue) => issue.kind === 'skill-not-installed')).toBe(true);
  });

  it('skips the ECC bundle step silently when no single stack is detected', () => {
    const root = temporary();
    seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);
    expect(() => publisher.publish({ actor: USER, reason: 'Initial publish.' })).not.toThrow();
    expect(fs.existsSync(path.join(root, '.aidlc/discover/runtime/ecc-assets.json'))).toBe(false);
  });

  it('migrates legacy Foundation/Epic files by inventorying them and creating one migration baseline', () => {
    const root = temporary();
    write(root, 'docs/project/foundation/STACK-PROFILE.json', '{"legacy":true}\n');
    write(root, 'docs/epics/EPIC-001/artifacts/INTENT.md', '# Intent\n\nLegacy scope.\n');
    write(root, 'docs/epics/EPIC-001/artifacts/REQUIREMENT.md', '# Requirement\n\nLegacy acceptance criteria.\n');
    const publisher = new DiscoverContextPublisher(root);

    const preview = publisher.previewLegacyMigration();
    expect(preview.discoverInitialized).toBe(false);
    expect(preview.sources.map((source) => source.path)).toEqual([
      'docs/epics/EPIC-001/artifacts/INTENT.md',
      'docs/epics/EPIC-001/artifacts/REQUIREMENT.md',
      'docs/project/foundation/STACK-PROFILE.json',
    ]);
    expect(() => publisher.migrateLegacy({ confirm: false })).toThrow(/confirm/);

    const first = publisher.migrateLegacy({ confirm: true });
    expect(first.createdDiscover).toBe(true);
    expect(first.createdBaseline).toBe(true);
    expect(first.context.actor).toEqual({ kind: 'migration', id: 'discover-migration' });
    const inventory = JSON.parse(fs.readFileSync(path.join(root, first.inventoryPath), 'utf8')) as { generated: boolean; doNotEdit: boolean; discoverRevision: string; sources: unknown[] };
    expect(inventory.generated).toBe(true);
    expect(inventory.doNotEdit).toBe(true);
    expect(inventory.discoverRevision).toBe(first.context.discoverRevision);
    expect(inventory.sources).toHaveLength(3);

    const again = publisher.migrateLegacy({ confirm: true });
    expect(again.createdDiscover).toBe(false);
    expect(again.createdBaseline).toBe(false);
    expect(again.context.discoverRevision).toBe(first.context.discoverRevision);
  });
});
