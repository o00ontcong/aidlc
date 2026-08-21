import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

import {
  BUILTIN_WORKFLOWS,
  buildAlignmentSeedFile,
  getBuiltinWorkflowByPipelineId,
  scaffoldEpic,
  type PipelineConfig,
} from '../src';

const VALIDATORS = path.join(__dirname, '..', 'templates', 'project-workspace', 'validators');

type Verdict = { decision: 'pass' | 'reject'; reason: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runner = (ctx: any) => Promise<Verdict>;

async function loadRunner(name: string): Promise<Runner> {
  const mod = await import(pathToFileURL(path.join(VALIDATORS, name)).href);
  return mod.default;
}

function writeCharter(root: string, overrides: Record<string, unknown> = {}) {
  const dir = path.join(root, 'docs', 'project', 'charter');
  fs.mkdirSync(dir, { recursive: true });
  const charter = {
    revision: 1,
    hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    goals: [
      { id: 'G-1', title: 'Ship safely', metric: '0 sev-1', status: 'active' },
      { id: 'G-2', title: 'Keep cohesion', metric: 'contract frozen', status: 'active' },
    ],
    nonGoals: [],
    invariants: [
      { id: 'INV-1', rule: 'No cross-package contract rewrite', scope: ['packages/**'], severity: 'blocking' },
    ],
    techRules: [
      { id: 'T-1', kind: 'forbidden', value: 'moment', reason: 'use luxon' },
    ],
    protectedPaths: [],
    deliveryBudget: { maxFilesPerPackage: 12, maxTasksPerPackage: 6 },
    requiredQualityGates: ['test', 'lint'],
    shipPolicy: {
      requirePullRequest: true,
      forbidAgentMergeToDefaultBranch: true,
      defaultBranch: 'main',
      allowAiAssistReview: true,
    },
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'CHARTER.json'), JSON.stringify(charter, null, 2) + '\n');
  return charter;
}

function epicArtifacts(root: string, epic = 'FEAT-1') {
  const dir = path.join(root, 'docs', 'epics', epic, 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFeatureCatalog(root: string, ids = ['auth', 'export']) {
  const dir = path.join(root, 'docs', 'project', 'context', 'visualization');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FEATURE-CATALOG.json'), `${JSON.stringify({
    schemaVersion: 1,
    features: ids.map((id) => ({
      id, name: id, summary: id, confidence: 'high', evidence: [`src/${id}.ts`],
    })),
  }, null, 2)}\n`);
}

function writeFeatureImpact(artifacts: string, epic = 'FEAT-1') {
  fs.writeFileSync(path.join(artifacts, 'FEATURE-IMPACT.json'), `${JSON.stringify({
    schemaVersion: 1,
    epicId: epic,
    features: [
      { id: 'payments', name: 'Payments', change: 'add', summary: 'Checkout' },
      { id: 'export', name: 'Export', change: 'modify', summary: 'CSV' },
      { id: 'auth', name: 'Authentication', change: 'unchanged' },
    ],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(artifacts, 'FEATURE-IMPACT.mmd'), 'flowchart TD\n  app["APP"] --> payments["Payments"]\n');
}

describe('alignmentArtifacts + EpicScaffold seed', () => {
  it('builds ALIGNMENT.md with Serves Goals and narrower constraints', () => {
    const md = buildAlignmentSeedFile({
      epicId: 'FEAT-1',
      servesGoals: ['G-1', 'G-2'],
      scope: 'Add ship gate after system-test',
      featureConstraints: 'Only touch cohesive-feature pipeline',
    });
    expect(md).toContain('## Serves Goals');
    expect(md).toContain('- G-1');
    expect(md).toContain('- G-2');
    expect(md).toContain('Add ship gate after system-test');
    expect(md).toContain('Only touch cohesive-feature pipeline');
  });

  it('scaffoldEpic writes ALIGNMENT.md when alignmentSeed is provided', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-align-scaffold-'));
    const pipeline: PipelineConfig = {
      id: 'cohesive-feature',
      on_failure: 'stop',
      steps: [
        {
          agent: 'aidlc-cohesive-feature-agent', name: 'capture-context',
          requires: [], produces: ['SNAP.md'], depends_on: [],
          human_review: false, auto_review: false, enabled: true,
        },
      ],
    };
    try {
      scaffoldEpic({
        workspaceRoot: root,
        doc: { state: { root: 'docs/epics' } },
        epicId: 'FEAT-1',
        title: 'Ship',
        description: '',
        target: { kind: 'pipeline', id: 'cohesive-feature' },
        agents: ['aidlc-cohesive-feature-agent'],
        inputs: {},
        pipeline,
        alignmentSeed: {
          servesGoals: ['G-1'],
          scope: 'Feature PR after system-test',
          featureConstraints: '',
        },
      });
      const alignment = fs.readFileSync(
        path.join(root, 'docs/epics/FEAT-1/artifacts/ALIGNMENT.md'),
        'utf8',
      );
      expect(alignment).toContain('G-1');
      expect(alignment).toContain('Feature PR after system-test');
      const state = JSON.parse(
        fs.readFileSync(path.join(root, 'docs/epics/FEAT-1/state.json'), 'utf8'),
      );
      expect(state.description).toContain('Feature PR after system-test');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ship phase placement', () => {
  it('places bug resolution before ship on feature-implement', () => {
    const feature = getBuiltinWorkflowByPipelineId('feature-implement')!;
    const ids = feature.phases.map((p) => p.id);
    expect(ids.indexOf('resolve-bugs')).toBe(ids.indexOf('implement') + 1);
    expect(ids.indexOf('ship')).toBe(ids.indexOf('resolve-bugs') + 1);

    const ship = feature.phases.find((p) => p.id === 'ship')!;
    expect(ship.dependsOn).toEqual(['resolve-bugs']);
    expect(ship.autoReviewRunner).toBe('.aidlc/validators/ship.mjs');
    expect(ship.humanReview).toBe(false);

    const bundle = BUILTIN_WORKFLOWS.find((w) => w.id === 'project-workspace')!;
    expect(bundle.primaryPhases!.some((p) => p.id === 'ship')).toBe(true);
    expect(bundle.additionalPipelines!.some((p) => p.id === 'feature-spike')).toBe(true);
    expect(bundle.additionalPipelines!.some((p) => p.id === 'cohesive-work-package')).toBe(false);
  });
});

describe('charter-alignment.mjs', () => {
  let root: string;
  let runner: Runner;

  beforeEach(async () => {
    runner = await loadRunner('charter-alignment.mjs');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-charter-align-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const ctx = (stepName = 'specify') => ({
    workspaceRoot: root,
    state: { runId: 'FEAT-1', currentStepIdx: 0 },
    step: { stepIdx: 0 },
    pipeline: { steps: [{ name: stepName, agent: 'aidlc-cohesive-feature-agent' }] },
  });

  it('rejects when CHARTER.json is missing', async () => {
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(path.join(artifacts, 'ALIGNMENT.md'), '## Serves Goals\n- G-1\n');
    fs.writeFileSync(path.join(artifacts, 'SPEC.md'), '- FEAT-1-FR01 Serves: G-1\n');
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/CHARTER\.json is missing/);
  });

  it('passes when every FR Serves a declared Goal', async () => {
    writeCharter(root);
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(
      path.join(artifacts, 'ALIGNMENT.md'),
      buildAlignmentSeedFile({
        epicId: 'FEAT-1',
        servesGoals: ['G-1'],
        scope: 'Ship gate',
        featureConstraints: '',
      }),
    );
    fs.writeFileSync(
      path.join(artifacts, 'SPEC.md'),
      '## Functional Requirements\n- FEAT-1-FR01 Add PR gate\n  Serves: G-1\n',
    );
    const v = await runner(ctx('specify'));
    expect(v.decision).toBe('pass');
  });

  it('rejects FR missing Serves and orphan declared Goals', async () => {
    writeCharter(root);
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(
      path.join(artifacts, 'ALIGNMENT.md'),
      '## Serves Goals\n- G-1\n- G-2\n\n## Feature Contribution\nX\n',
    );
    fs.writeFileSync(
      path.join(artifacts, 'SPEC.md'),
      '## Functional Requirements\n- FEAT-1-FR01 no serves line\n',
    );
    const v = await runner(ctx('specify'));
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/missing Serves/);
    expect(v.reason).toMatch(/G-2/);
  });

  it('plan phase requires Charter Conformance covering INV-x', async () => {
    writeCharter(root);
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(
      path.join(artifacts, 'ALIGNMENT.md'),
      '## Serves Goals\n- G-1\n\n## Feature Contribution\nX\n',
    );
    fs.writeFileSync(
      path.join(artifacts, 'SPEC.md'),
      '## Functional Requirements\n- FEAT-1-FR01 Serves: G-1\n',
    );
    fs.writeFileSync(
      path.join(artifacts, 'PLAN.md'),
      '## Shared Contract Impact\nNone\n\n## File Impact\nX\n\n## Requirement Traceability\nFR01\n',
    );
    const v = await runner(ctx('plan'));
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/Charter Conformance/);

    fs.writeFileSync(
      path.join(artifacts, 'PLAN.md'),
      '## Charter Conformance\n| INV-1 | respected via ownedPaths |\n\n## Shared Contract Impact\nNone\n',
    );
    writeFeatureCatalog(root);
    writeFeatureImpact(artifacts);
    const v2 = await runner(ctx('plan'));
    expect(v2.decision).toBe('pass');
  });

  it('plan phase requires a feature-tree impact graph against the catalog', async () => {
    writeCharter(root);
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(path.join(artifacts, 'ALIGNMENT.md'), '## Serves Goals\n- G-1\n\n## Feature Contribution\nX\n');
    fs.writeFileSync(path.join(artifacts, 'SPEC.md'), '## Functional Requirements\n- FEAT-1-FR01 Serves: G-1\n');
    fs.writeFileSync(
      path.join(artifacts, 'PLAN.md'),
      '## Charter Conformance\nINV-1 ok\n\n## Shared Contract Impact\nNone\n',
    );
    const missing = await runner(ctx('plan'));
    expect(missing.decision).toBe('reject');
    expect(missing.reason).toMatch(/FEATURE-CATALOG|FEATURE-IMPACT/);

    writeFeatureCatalog(root);
    writeFeatureImpact(artifacts, 'FEAT-1');
    const v = await runner(ctx('plan'));
    expect(v.decision).toBe('pass');
  });

  it('rejects forbidden tech in PLAN without approved VR', async () => {
    writeCharter(root);
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(path.join(artifacts, 'ALIGNMENT.md'), '## Serves Goals\n- G-1\n');
    fs.writeFileSync(path.join(artifacts, 'SPEC.md'), '- FEAT-1-FR01 Serves: G-1\n');
    fs.writeFileSync(
      path.join(artifacts, 'PLAN.md'),
      '## Charter Conformance\nINV-1 ok\n\nWe will use moment for dates.\n',
    );
    const v = await runner(ctx('plan'));
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/forbidden tech/);
  });
});

describe('ship.mjs', () => {
  let root: string;
  let runner: Runner;

  beforeEach(async () => {
    runner = await loadRunner('ship.mjs');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-ship-'));
    writeCharter(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const ctx = (stepName: string) => ({
    workspaceRoot: root,
    state: { runId: 'FEAT-1', currentStepIdx: 0 },
    step: { stepIdx: 0 },
    pipeline: { steps: [{ name: stepName }] },
  });

  it('open-pr requires PR-LINK with head feature/$0', async () => {
    const artifacts = epicArtifacts(root);
    const v0 = await runner(ctx('open-pr'));
    expect(v0.decision).toBe('reject');
    expect(v0.reason).toMatch(/PR-LINK/);

    fs.writeFileSync(
      path.join(artifacts, 'PR-LINK.md'),
      '**URL:** https://example.com/pr/1\n**Base:** main\n**Head:** feature/WRONG\n**Status:** open\n',
    );
    const v1 = await runner(ctx('open-pr'));
    expect(v1.decision).toBe('reject');
    expect(v1.reason).toMatch(/feature\/FEAT-1/);

    fs.writeFileSync(
      path.join(artifacts, 'PR-LINK.md'),
      '**URL:** https://example.com/pr/1\n**Base:** main\n**Head:** feature/FEAT-1\n**Status:** open\n',
    );
    const v2 = await runner(ctx('open-pr'));
    expect(v2.decision).toBe('pass');
  });

  it('await-merge forbids agent merge and supports local human escape hatch', async () => {
    writeCharter(root, {
      shipPolicy: {
        requirePullRequest: true,
        forbidAgentMergeToDefaultBranch: true,
        defaultBranch: 'main',
        allowLocalMergeWithHumanOnly: true,
      },
    });
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(
      path.join(artifacts, 'PR-LINK.md'),
      '**URL:** (none)\n**Base:** main\n**Head:** feature/FEAT-1\n**Status:** merged\n**Merged By:** agent\n',
    );
    const v = await runner(ctx('await-merge'));
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/Agent merge|forbidden/i);

    fs.writeFileSync(
      path.join(artifacts, 'PR-LINK.md'),
      '**URL:** (none)\n**Base:** main\n**Head:** feature/FEAT-1\n**Status:** approved\n**Local Human Approval:** yes\n',
    );
    const v2 = await runner(ctx('await-merge'));
    expect(v2.decision).toBe('pass');
  });

  it('await-merge does not trust a self-reported Status: merged without a real git merge', async () => {
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: root });
    fs.writeFileSync(path.join(root, 'README'), 'main\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: root });
    execFileSync('git', ['branch', '-M', 'main'], { cwd: root });

    const artifacts = epicArtifacts(root);
    fs.writeFileSync(
      path.join(artifacts, 'PR-LINK.md'),
      '**URL:** https://example.com/pr/1\n**Base:** main\n**Head:** feature/FEAT-1\n**Status:** merged\n**Merged By:** human\n',
    );

    // Feature branch exists but was never actually merged — the claimed
    // status alone must not be trusted.
    execFileSync('git', ['checkout', '-b', 'feature/FEAT-1'], { cwd: root });
    fs.writeFileSync(path.join(root, 'feature.txt'), 'unmerged work\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'feature work'], { cwd: root });

    const rejected = await runner(ctx('await-merge'));
    expect(rejected.decision).toBe('reject');
    expect(rejected.reason).toMatch(/not reachable from main/);

    // Actually merge it — the same claimed status is now independently verified.
    execFileSync('git', ['checkout', 'main'], { cwd: root });
    execFileSync('git', ['merge', '--no-ff', 'feature/FEAT-1', '-m', 'merge feature'], { cwd: root });

    const accepted = await runner(ctx('await-merge'));
    expect(accepted.decision).toBe('pass');
  });
});

describe('Project Workspace validators', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-ext-val-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('project-ci fail-closed when requiredQualityGates missing', async () => {
    const runner = await loadRunner('project-ci.mjs');
    writeCharter(root, { requiredQualityGates: ['test', 'lint', 'typecheck'] });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo test' } }),
    );
    const artifacts = epicArtifacts(root);
    fs.writeFileSync(path.join(artifacts, 'SYSTEM-TEST-REPORT.md'), '**Verdict:** GO\n');
    const v = await runner({ workspaceRoot: root, state: { runId: 'FEAT-1' } });
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/requiredQualityGates missing/);
    expect(v.reason).toMatch(/lint|typecheck/);
  });

  it('project-context project-sync rejects charter/convention diffs', async () => {
    const runner = await loadRunner('project-context.mjs');
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: root });
    fs.mkdirSync(path.join(root, 'docs/project/context'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/project/charter'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/project/charter/NORTH-STAR.md'), 'old\n');
    fs.writeFileSync(path.join(root, 'README'), 'x');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: root });
    fs.writeFileSync(path.join(root, 'docs/project/charter/NORTH-STAR.md'), 'tampered\n');

    const artifacts = epicArtifacts(root);
    fs.writeFileSync(
      path.join(artifacts, 'PR-LINK.md'),
      '**URL:** https://example.com/pr/1\n**Base:** main\n**Head:** feature/FEAT-1\n**Status:** merged\n**Merged By:** human\n',
    );

    const v = await runner({
      workspaceRoot: root,
      state: { runId: 'FEAT-1', currentStepIdx: 0 },
      step: { stepIdx: 0 },
      pipeline: { steps: [{ name: 'project-sync' }] },
    });
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/charter/);
  });
});
