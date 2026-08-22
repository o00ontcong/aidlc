import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  ensureProviderManagedTaskCommand,
  LegacyDeliveryStateStore,
  builtinTemplatesRoot,
  loadBuiltinPreset,
  recordHumanCharterEdit,
  validateWorkspace,
} from '../src';

const roots: string[] = [];
const temp = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-project-workspace-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Project Workspace legacy-delivery compatibility', () => {
  it('installs a provider-managed task command that preserves the bug-fix review checkpoint', () => {
    const root = temp();
    ensureProviderManagedTaskCommand(root);

    const command = fs.readFileSync(
      path.join(root, '.claude', 'commands', 'aidlc-provider-managed-task.md'),
      'utf8',
    );
    expect(command).toContain('provider-managed approval');
    expect(command).toContain('resolve-bugs');
    expect(command).toMatch(/resolve-bugs[\s\S]*explicitly approve|explicitly approves[\s\S]*resolve-bugs/i);
    expect(command).toMatch(/question[\s\S]*human answer|human answer[\s\S]*question/i);
    expect(command).not.toContain('Stop at every configured human-review or merge gate');
  });

  it('does not add the retired project-level execution profile to presets', () => {
    const projectWorkspace = BUILTIN_WORKFLOWS.find((workflow) => workflow.id === 'project-workspace')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), projectWorkspace);
    const config = validateWorkspace({ name: 'test', ...preset.workspace }, 'workspace.yaml');
    expect(config.cohesive_delivery).toBeUndefined();
    const legacy = loadBuiltinPreset(builtinTemplatesRoot(), BUILTIN_WORKFLOWS[0]!);
    expect(legacy.workspace.cohesive_delivery).toBeUndefined();
  });

  it('reads historical delivery metadata without creating or mutating it', () => {
    const root = temp();
    const stateFile = path.join(root, '.aidlc', 'deliveries', 'FEATURE-1', 'state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      schemaVersion: 1,
      id: 'FEATURE-1',
      featureRunId: 'FEATURE-1',
      status: 'completed',
    }));

    expect(LegacyDeliveryStateStore.load(root, 'FEATURE-1')).toMatchObject({
      id: 'FEATURE-1',
      featureRunId: 'FEATURE-1',
    });
    expect(LegacyDeliveryStateStore.load(root, '../unsafe')).toBeNull();
  });

  it('records human edits to inferred context, confirms assumptions, and refreshes rule projections', () => {
    const root = temp();
    const charterDir = path.join(root, 'docs/project/charter');
    fs.mkdirSync(charterDir, { recursive: true });
    for (const name of ['NORTH-STAR.md', 'ARCHITECTURE-PRINCIPLES.md', 'TECH-POLICY.md']) {
      fs.writeFileSync(path.join(charterDir, name), `# ${name}\nHuman edited baseline.\n`);
    }
    fs.mkdirSync(path.join(root, 'docs/project/conventions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/project/conventions/CONVENTIONS.md'), '# Conventions\n- Keep tests close.\n');
    fs.writeFileSync(path.join(charterDir, 'CHARTER.json'), JSON.stringify({
      revision: 4,
      hash: 'sha256:' + '0'.repeat(64),
      status: 'provisional',
      origin: 'existing-project-inference',
      goals: [{ id: 'G-1', title: 'Goal', metric: 'Metric', status: 'active', confirmation: 'pending' }],
      nonGoals: [],
      invariants: [{ id: 'INV-1', rule: 'Rule', scope: ['src/**'], severity: 'advisory', confirmation: 'pending' }],
      techRules: [{ id: 'T-1', kind: 'must-use', value: 'pnpm', reason: 'repo policy', confirmation: 'pending' }],
      protectedPaths: [],
      deliveryBudget: { maxFilesPerPackage: 12, maxTasksPerPackage: 6 },
      requiredQualityGates: ['test'],
      shipPolicy: {
        requirePullRequest: true,
        forbidAgentMergeToDefaultBranch: true,
        defaultBranch: 'main',
        allowAiAssistReview: true,
      },
    }, null, 2));

    const result = recordHumanCharterEdit(root, { confirmAll: true });
    expect(result.revision).toBe(5);
    expect(result.status).toBe('confirmed');
    expect(result.confirmedIds).toEqual(['G-1', 'INV-1', 'T-1']);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('revision 5');
  });
});

describe('Project Workspace validator hardening', () => {
  it('uses segment-aware glob matching and scopes approved variances to cited paths', async () => {
    const root = temp();
    const libFile = path.join(__dirname, '..', 'templates', 'project-workspace', 'validators', 'lib.mjs');
    const lib = await import(pathToFileURL(libFile).href + `?t=${Date.now()}`);
    expect(lib.matchesScope('src/a.ts', 'src/*.ts')).toBe(true);
    expect(lib.matchesScope('src/private/secret.json', 'src/*.ts')).toBe(false);
    expect(lib.matchesScope('src/private/a.ts', 'src/**')).toBe(true);

    const dir = path.join(root, 'docs', 'epics', 'FEATURE-1', 'artifacts', 'variance-requests');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'VR-001.md'), [
      '# Variance',
      '**Status:** APPROVED',
      'Allowed path: `src/allowed/**`',
      'Rejected discussion only: `src/protected/**`',
    ].join('\n'));
    expect(lib.approvedVarianceCoversPath(root, 'FEATURE-1', 'src/allowed/a.ts')).toBe(true);
    expect(lib.approvedVarianceCoversPath(root, 'FEATURE-1', 'src/protected/secret.ts')).toBe(false);
  });
});
