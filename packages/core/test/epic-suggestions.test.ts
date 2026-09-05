import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscoverService,
  DOC_ARCHITECTURE,
  DOC_FEATURES,
  DOC_IMPLEMENTATION_PLAN,
  DOC_MODULES,
  DOC_PRODUCT,
  DOC_PROJECT_STRUCTURE,
  DOC_REQUIREMENTS,
  DOC_SKELETON,
  DOC_TECH_STACK,
  suggestEpics,
  classifyPhaseWork,
  classifyItemCoverage,
  type ActorRef,
} from '../src';

const USER: ActorRef = { kind: 'user', id: 'test' };
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }); }
});

function setupBlueprint(): { root: string; service: DiscoverService } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epic-suggest-'));
  roots.push(root);
  const service = new DiscoverService(root);
  service.init({ seedSentence: 'Trading strategy tool.', actor: USER });
  service.applyOps(DOC_FEATURES, [
    { op: 'addItem', section: 'features', group: 'strategy', text: 'Parse raw strategy — FR-01.' },
    { op: 'addItem', section: 'features', group: 'backtest', text: 'Run backtest — FR-02.' },
  ], { actor: USER });
  service.applyOps(DOC_MODULES, [
    {
      op: 'addRecord',
      section: 'modules',
      title: 'Strategy engine',
      fields: [{ label: 'Responsibility', value: 'packages/strategy/engine.ts' }],
    },
  ], { actor: USER });
  return { root, service };
}

describe('suggestEpics', () => {
  it('proposes bootstrap when skeleton is missing', () => {
    const { root, service } = setupBlueprint();
    const index = service.require();
    const ctx = service.readBlueprint(index);
    const suggestions = suggestEpics({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(suggestions.some((s) => s.kind === 'no-skeleton' && s.recipeId === 'cofofo-foundation')).toBe(true);
    const sk = suggestions.find((s) => s.kind === 'no-skeleton')!;
    expect(sk.brief).toContain('Generate Skeleton');
  });

  it('flags features without matching source files', () => {
    const { root, service } = setupBlueprint();
    const index = service.require();
    const ctx = service.readBlueprint(index);
    const suggestions = suggestEpics({ workspaceRoot: root, ctx, index, checkFoundation: false });
    const notImpl = suggestions.filter((s) => s.kind === 'not-implemented');
    expect(notImpl.length).toBeGreaterThanOrEqual(2);
    expect(notImpl[0]!.recipeId).toBe('cofofo-feature');
    expect(notImpl[0]!.brief).toContain('Docs vs code');
  });

  it('detects partial implementation drift', () => {
    const { root, service } = setupBlueprint();
    const engineDir = path.join(root, 'packages', 'strategy');
    fs.mkdirSync(engineDir, { recursive: true });
    fs.writeFileSync(path.join(engineDir, 'engine.ts'), 'export function run() {}');
    const index = service.require();
    const ctx = service.readBlueprint(index);
    const suggestions = suggestEpics({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(suggestions.some((s) => s.kind === 'docs-stale' || s.kind === 'not-implemented')).toBe(true);
  });

  it('reduces skeleton suggestion when skeleton paths exist on disk', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_SKELETON, [
      { op: 'addItem', section: 'files', text: '`packages/strategy/engine.ts` — core engine' },
    ], { actor: USER });
    const engineDir = path.join(root, 'packages', 'strategy');
    fs.mkdirSync(engineDir, { recursive: true });
    fs.writeFileSync(path.join(engineDir, 'engine.ts'), 'export {}');
    const index = service.require();
    const ctx = service.readBlueprint(index);
    const suggestions = suggestEpics({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(suggestions.some((s) => s.kind === 'no-skeleton')).toBe(false);
  });

  it('fills the bootstrap epic from Discover docs instead of a generic not-ready message', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_PRODUCT, [
      { op: 'setProse', section: 'problem', value: 'Trader không backtest được strategy.' },
      { op: 'setProse', section: 'value', value: 'Chạy backtest lặp lại được.' },
    ], { actor: USER });
    service.applyOps(DOC_ARCHITECTURE, [
      { op: 'addItem', section: 'layers', text: 'Domain' },
      { op: 'addItem', section: 'layers', text: 'Data' },
      { op: 'setProse', section: 'rationale', value: 'Tách engine khỏi IO.' },
    ], { actor: USER });
    service.applyOps(DOC_TECH_STACK, [
      {
        op: 'addRecord',
        section: 'stack',
        title: 'Language',
        fields: [{ label: 'Choice', value: 'TypeScript' }, { label: 'Why', value: 'Monorepo hiện tại.' }],
      },
    ], { actor: USER });
    service.applyOps(DOC_PROJECT_STRUCTURE, [
      { op: 'setProse', section: 'tree', value: '```\npackages/strategy/\npackages/cli/\n```' },
    ], { actor: USER });
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Project skeleton',
        fields: [
          { label: 'Goal', value: 'Dựng monorepo và engine rỗng.' },
          { label: 'Deliverables', items: ['Cây thư mục', 'packages/strategy/engine.ts'] },
        ],
      },
    ], { actor: USER });
    service.applyOps(DOC_SKELETON, [
      { op: 'addItem', section: 'files', text: '`packages/strategy/engine.ts` — core engine' },
      { op: 'addItem', section: 'files', text: '`packages/cli/src/index.ts` — CLI entry' },
      { op: 'addItem', section: 'interfaces', text: '`StrategyParser` — parse raw strategy text' },
    ], { actor: USER });

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const suggestions = suggestEpics({ workspaceRoot: root, ctx, index, checkFoundation: false });
    const sk = suggestions.find((s) => s.kind === 'no-skeleton');
    expect(sk).toBeDefined();
    expect(sk!.recipeId).toBe('cofofo-foundation');
    expect(sk!.description).not.toMatch(/chưa có skeleton hoặc CoFoFo foundation chưa sẵn sàng/i);
    expect(sk!.description).toMatch(/SKELETON\.md/);
    expect(sk!.summary).toMatch(/Discover đã có spec/);
    expect(sk!.details.some((d) => d.includes('packages/strategy/engine.ts'))).toBe(true);
    expect(sk!.brief).toContain('packages/strategy/engine.ts');
    expect(sk!.brief).toContain('TypeScript');
    expect(sk!.brief).toContain('packages/strategy/');
    expect(sk!.brief).toContain('StrategyParser');
    expect(sk!.brief).toContain('Dựng monorepo và engine rỗng.');
    expect(sk!.brief).toContain('## Skeleton (plans/SKELETON.md)');
    expect(sk!.phaseId).toBe('PH-01');
  });

  it('does not flag a feature as missing when its module folder already has source', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_MODULES, [
      { op: 'removeRecord', id: 'M-01' },
      {
        op: 'addRecord',
        section: 'modules',
        title: 'Playback',
        fields: [
          { label: 'Responsibility', value: 'Phát video — F-STRATEGY-01' },
          { label: 'Folder', value: 'App/Features/Player' },
        ],
      },
    ], { actor: USER });
    const playerDir = path.join(root, 'App', 'Features', 'Player');
    fs.mkdirSync(playerDir, { recursive: true });
    fs.writeFileSync(path.join(playerDir, 'PlayerView.swift'), 'struct PlayerView {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const suggestions = suggestEpics({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(suggestions.some((s) => s.kind === 'not-implemented' && s.featureId === 'F-STRATEGY-01')).toBe(false);
  });

  it('marks an implementation-plan phase as already built when its feature exists on disk', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_MODULES, [
      { op: 'removeRecord', id: 'M-01' },
      {
        op: 'addRecord',
        section: 'modules',
        title: 'Playback',
        fields: [
          { label: 'Responsibility', value: 'Phát video — F-STRATEGY-01' },
          { label: 'Folder', value: 'App/Features/Player' },
        ],
      },
    ], { actor: USER });
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Strategy playback',
        fields: [
          { label: 'Goal', value: 'Implement F-STRATEGY-01' },
          { label: 'Deliverables', items: ['Player screen — F-STRATEGY-01'] },
        ],
      },
    ], { actor: USER });
    const playerDir = path.join(root, 'App', 'Features', 'Player');
    fs.mkdirSync(playerDir, { recursive: true });
    fs.writeFileSync(path.join(playerDir, 'PlayerView.swift'), 'struct PlayerView {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const work = classifyPhaseWork({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(work.find((w) => w.phaseId === 'PH-01')?.alreadyBuilt).toBe(true);
  });

  it('keeps a phase pending when the cited feature has no matching source', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Backtest engine',
        fields: [
          { label: 'Goal', value: 'Chạy backtest — F-BACKTEST-01' },
          { label: 'Deliverables', items: ['Backtest runner — F-BACKTEST-01'] },
        ],
      },
    ], { actor: USER });
    const index = service.require();
    const ctx = service.readBlueprint(index);
    const work = classifyPhaseWork({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(work.find((w) => w.phaseId === 'PH-01')?.alreadyBuilt).toBe(false);
  });

  it('treats a Vietnamese login/attestation phase as built when those files exist', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Đăng nhập và device attestation',
        fields: [
          { label: 'Goal', value: 'User đăng nhập và attest thiết bị.' },
          { label: 'Deliverables', items: ['Màn hình login', 'Device attestation'] },
          { label: 'Definition of done', items: ['Login + attestation chạy được trên device'] },
        ],
      },
    ], { actor: USER });
    const authDir = path.join(root, 'App', 'Features', 'Login');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'LoginView.swift'), 'struct LoginView {}');
    fs.writeFileSync(path.join(authDir, 'DeviceAttestation.swift'), 'struct DeviceAttestation {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const work = classifyPhaseWork({ workspaceRoot: root, ctx, index, checkFoundation: false });
    const phase = work.find((w) => w.phaseId === 'PH-01');
    expect(phase?.alreadyBuilt).toBe(true);
    expect(phase?.tokens).toEqual(expect.arrayContaining(['login', 'attestation']));
    expect(phase?.matchedFiles.some((f) => /login|attestation/i.test(f))).toBe(true);
    expect(phase?.matchedFiles.every((f) => /Login|Attestation/i.test(f))).toBe(true);
  });

  it('does not point reveal at an unrelated Core file just because the goal mentions device', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Đăng nhập và device attestation',
        fields: [
          { label: 'Goal', value: 'User đăng nhập và attest thiết bị.' },
          { label: 'Deliverables', items: ['Màn hình login', 'Device attestation'] },
        ],
      },
    ], { actor: USER });
    const loginDir = path.join(root, 'App', 'Features', 'Login');
    const coreDir = path.join(root, 'App', 'Core');
    fs.mkdirSync(loginDir, { recursive: true });
    fs.mkdirSync(coreDir, { recursive: true });
    fs.writeFileSync(path.join(loginDir, 'LoginView.swift'), 'struct LoginView {}');
    fs.writeFileSync(path.join(loginDir, 'DeviceAttestation.swift'), 'struct DeviceAttestation {}');
    fs.writeFileSync(path.join(coreDir, 'DeviceID.swift'), 'struct DeviceID {}');
    fs.writeFileSync(path.join(root, 'App', 'AppDelegate.swift'), 'class AppDelegate {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const work = classifyPhaseWork({ workspaceRoot: root, ctx, index, checkFoundation: false });
    const files = work.find((w) => w.phaseId === 'PH-01')?.matchedFiles ?? [];
    expect(files.some((f) => /Login/i.test(f))).toBe(true);
    expect(files.some((f) => /Core\/DeviceID/i.test(f))).toBe(false);
    expect(files.some((f) => /AppDelegate/i.test(f))).toBe(false);
  });

  it('treats a Vietnamese phase as built when an overlapping in-code feature exists, even without citing F-*', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_FEATURES, [
      { op: 'addItem', section: 'features', group: 'auth', text: 'Đăng nhập bằng Passkey.' },
    ], { actor: USER });
    service.applyOps(DOC_MODULES, [
      {
        op: 'addRecord',
        section: 'modules',
        title: 'Login',
        fields: [
          { label: 'Responsibility', value: 'Đăng nhập — F-AUTH-01' },
          { label: 'Folder', value: 'App/Features/Login' },
        ],
      },
    ], { actor: USER });
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Đăng nhập Passkey',
        fields: [
          { label: 'Goal', value: 'User đăng nhập bằng Passkey trên thiết bị.' },
          { label: 'Deliverables', items: ['Màn hình đăng nhập Passkey'] },
        ],
      },
    ], { actor: USER });
    const loginDir = path.join(root, 'App', 'Features', 'Login');
    fs.mkdirSync(loginDir, { recursive: true });
    fs.writeFileSync(path.join(loginDir, 'LoginView.swift'), 'struct LoginView {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const work = classifyPhaseWork({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(work.find((w) => w.phaseId === 'PH-01')?.alreadyBuilt).toBe(true);
  });

  it('treats a test-coverage phase as built when product tests already exist', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Bù độ phủ test',
        fields: [
          { label: 'Goal', value: 'Bổ sung unit test cho các feature đã có.' },
          { label: 'Deliverables', items: ['Tăng coverage'] },
          { label: 'Definition of done', items: ['Test target build được'] },
        ],
      },
    ], { actor: USER });
    const testsDir = path.join(root, 'App', 'OtenPassTests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'LoginViewTests.swift'), 'final class LoginViewTests {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const work = classifyPhaseWork({ workspaceRoot: root, ctx, index, checkFoundation: false });
    const phase = work.find((w) => w.phaseId === 'PH-01');
    expect(phase?.alreadyBuilt).toBe(true);
    expect(phase?.matchedFiles).toEqual(['App/OtenPassTests']);
  });

  it('keeps a test-coverage phase pending when the tree has source but no tests', () => {
    const { root, service } = setupBlueprint();
    service.applyOps(DOC_IMPLEMENTATION_PLAN, [
      {
        op: 'addRecord',
        section: 'phases',
        title: 'Bù độ phủ test',
        fields: [
          { label: 'Goal', value: 'Bổ sung unit test cho các feature đã có.' },
          { label: 'Deliverables', items: ['Tăng coverage'] },
        ],
      },
    ], { actor: USER });
    const appDir = path.join(root, 'App', 'Features', 'Login');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'LoginView.swift'), 'struct LoginView {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const work = classifyPhaseWork({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(work.find((w) => w.phaseId === 'PH-01')?.alreadyBuilt).toBe(false);
  });
});

describe('classifyItemCoverage', () => {
  function addRequirements(service: DiscoverService): void {
    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'addItem', section: 'functional', text: 'User can parse a strategy.' },
      { op: 'addItem', section: 'functional', text: 'User can run a backtest.' },
      { op: 'addItem', section: 'functional', text: 'User can export a report.' },
    ], { actor: USER });
  }

  it('treats a workspace with no source as not-built, not a second mode', () => {
    const { root, service } = setupBlueprint();
    addRequirements(service);
    const index = service.require();
    const ctx = service.readBlueprint(index);
    const coverage = classifyItemCoverage({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(coverage.sourceFileCount).toBe(0);
    expect(coverage.items.every((i) => i.status === 'missing')).toBe(true);
    expect(coverage.items.find((i) => i.id === 'FR-01')?.coveringFeatureIds).toEqual(['F-STRATEGY-01']);
    expect(coverage.items.find((i) => i.id === 'FR-03')?.coveringFeatureIds).toEqual([]);
  });

  it('marks a feature in-code when its module folder already has source', () => {
    const { root, service } = setupBlueprint();
    addRequirements(service);
    service.applyOps(DOC_MODULES, [
      { op: 'removeRecord', id: 'M-01' },
      {
        op: 'addRecord',
        section: 'modules',
        title: 'Playback',
        fields: [
          { label: 'Responsibility', value: 'Phát video — F-STRATEGY-01' },
          { label: 'Folder', value: 'App/Features/Player' },
        ],
      },
    ], { actor: USER });
    const playerDir = path.join(root, 'App', 'Features', 'Player');
    fs.mkdirSync(playerDir, { recursive: true });
    fs.writeFileSync(path.join(playerDir, 'PlayerView.swift'), 'struct PlayerView {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const coverage = classifyItemCoverage({ workspaceRoot: root, ctx, index, checkFoundation: false });
    expect(coverage.items.find((i) => i.id === 'F-STRATEGY-01')?.status).toBe('in-code');
    expect(coverage.items.find((i) => i.id === 'FR-01')?.status).toBe('in-code');
    expect(coverage.items.find((i) => i.id === 'F-BACKTEST-01')?.status).toBe('missing');
    expect(coverage.items.find((i) => i.id === 'FR-02')?.status).toBe('missing');
  });

  it('still finds source when declared child repos are missing on this machine', () => {
    const { root, service } = setupBlueprint();
    addRequirements(service);
    service.applyOps(DOC_MODULES, [
      { op: 'removeRecord', id: 'M-01' },
      {
        op: 'addRecord',
        section: 'modules',
        title: 'Playback',
        fields: [
          { label: 'Responsibility', value: 'Phát video — F-STRATEGY-01' },
          { label: 'Folder', value: 'App/Features/Player' },
        ],
      },
    ], { actor: USER });
    const playerDir = path.join(root, 'App', 'Features', 'Player');
    fs.mkdirSync(playerDir, { recursive: true });
    fs.writeFileSync(path.join(playerDir, 'PlayerView.swift'), 'struct PlayerView {}');

    const index = service.require();
    const ctx = service.readBlueprint(index);
    const coverage = classifyItemCoverage({
      workspaceRoot: root,
      ctx,
      index,
      checkFoundation: false,
      scope: {
        layout: 'parent',
        repos: [{ path: 'ios', kind: 'mobile', name: 'ios' }],
        excludes: [],
        declaredAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(coverage.sourceFileCount).toBeGreaterThan(0);
    expect(coverage.items.find((i) => i.id === 'F-STRATEGY-01')?.status).toBe('in-code');
    expect(coverage.items.find((i) => i.id === 'FR-01')?.status).toBe('in-code');
  });
});
