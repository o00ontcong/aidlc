import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

  it('requires a change reason and rejects a blank one', () => {
    const root = temporary();
    seedBlueprint(root);
    const publisher = new DiscoverContextPublisher(root);
    expect(() => publisher.publish({ actor: USER, reason: '   ' })).toThrow(/change reason/);
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
