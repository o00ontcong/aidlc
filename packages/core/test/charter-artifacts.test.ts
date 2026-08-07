import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CHARTER_JSON_REL,
  CHARTER_MD_FILES,
  CONVENTIONS_REL,
  DRIFT_REPORT_REL,
  RULES_SYNC_TARGETS,
  computeCharterMarkdownHash,
  defaultCharterTemplatesDir,
  parseCharterMarker,
  readCharterJson,
  seedCharterArtifacts,
  syncProjectRules,
} from '../src';

const CHARTER_VALIDATOR = path.join(
  __dirname, '..', 'templates', 'cohesive', 'validators', 'charter.mjs',
);
const RULES_VALIDATOR = path.join(
  __dirname, '..', 'templates', 'cohesive', 'validators', 'rules-sync.mjs',
);

type Verdict = { decision: 'pass' | 'reject'; reason: string };

const tempRoots: string[] = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tmp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-charter-'));
  tempRoots.push(root);
  return root;
}

async function loadRunner(file: string): Promise<(ctx: unknown) => Promise<Verdict>> {
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

describe('seedCharterArtifacts', () => {
  it('seeds charter, conventions, drift stub, and hash-valid CHARTER.json once', () => {
    const root = tmp();
    const first = seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    expect(first.seeded).toEqual(expect.arrayContaining([
      ...CHARTER_MD_FILES.map((name) => path.join('docs', 'project', 'charter', name)),
      CHARTER_JSON_REL,
      CONVENTIONS_REL,
      DRIFT_REPORT_REL,
    ]));
    expect(first.skipped).toEqual([]);

    const charterDir = path.join(root, 'docs', 'project', 'charter');
    const hash = computeCharterMarkdownHash(charterDir);
    const doc = readCharterJson(root);
    expect(doc.hash).toBe(hash);
    expect(doc.revision).toBe(1);
    expect(doc.goals[0]?.metric).toBeTruthy();
    expect(doc.invariants[0]?.severity).toBe('advisory');
    expect(doc.shipPolicy.forbidAgentMergeToDefaultBranch).toBe(true);
    expect(fs.existsSync(path.join(root, CONVENTIONS_REL))).toBe(true);

    const second = seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    expect(second.seeded).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  it('skips existing Intent files without requiring templates on disk', () => {
    const root = tmp();
    seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    // Broken templatesRoot must not throw when every seed target already exists.
    const again = seedCharterArtifacts(root, {
      templatesRoot: path.join(root, 'missing-templates'),
    });
    expect(again.seeded).toEqual([]);
    expect(again.skipped.length).toBeGreaterThan(0);
  });
});

describe('syncProjectRules', () => {
  it('writes marker blocks that match charter revision/hash', () => {
    const root = tmp();
    seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Existing\n\nkeep me\n', 'utf8');

    const result = syncProjectRules(root);
    const doc = readCharterJson(root);
    expect(result.revision).toBe(doc.revision);
    expect(result.hash).toBe(doc.hash);
    expect(result.written).toEqual([...RULES_SYNC_TARGETS]);

    for (const rel of RULES_SYNC_TARGETS) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      const marker = parseCharterMarker(text);
      expect(marker, rel).toEqual({ revision: doc.revision, hash: doc.hash.toLowerCase() });
    }
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toContain('# Existing');
  });
});

describe('charter.mjs validator', () => {
  function writeDefineCharterEpic(root: string, runId: string, idea: string) {
    const epic = path.join(root, 'docs', 'epics', runId);
    fs.mkdirSync(path.join(epic, 'artifacts'), { recursive: true });
    fs.writeFileSync(
      path.join(epic, 'inputs.json'),
      `${JSON.stringify({ idea }, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(epic, 'artifacts', 'CHARTER-DISCOVERY.md'),
      [
        '# Charter discovery',
        '',
        '## Q1: Measurable outcome?',
        '',
        '- Human: Ship cohesive features with approve gates.',
        '',
        '## Discovery decisions',
        '',
        '- G-1 Deliver cohesive, reviewable change — metric: every feature has human Approve before merge',
        '- INV-1 Feature work inherits charter goals (advisory)',
        '- T-1 MUST-USE repository package manager',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  it('passes define-charter shape and rejects hash drift', async () => {
    const runner = await loadRunner(CHARTER_VALIDATOR);
    const root = tmp();
    seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    writeDefineCharterEpic(
      root,
      'CTX-1',
      'AIDLC monorepo workspace for agent-driven SDLC with human approve gates.',
    );

    const passVerdict = await runner({
      workspaceRoot: root,
      pipeline: { steps: [{ name: 'define-charter' }] },
      state: { currentStepIdx: 0, runId: 'CTX-1' },
      step: { stepIdx: 0 },
      paths: { produces: ['docs/epics/CTX-1/artifacts/CHARTER-DISCOVERY.md'] },
    });
    expect(passVerdict.decision).toBe('pass');

    fs.appendFileSync(
      path.join(root, 'docs', 'project', 'charter', 'NORTH-STAR.md'),
      '\n<!-- mutated -->\n',
      'utf8',
    );
    const rejectVerdict = await runner({
      workspaceRoot: root,
      pipeline: { steps: [{ name: 'define-charter' }] },
      state: { currentStepIdx: 0, runId: 'CTX-1' },
      step: { stepIdx: 0 },
      paths: { produces: ['docs/epics/CTX-1/artifacts/CHARTER-DISCOVERY.md'] },
    });
    expect(rejectVerdict.decision).toBe('reject');
    expect(rejectVerdict.reason).toMatch(/hash mismatch/i);
  });

  it('rejects define-charter without idea or CHARTER-DISCOVERY interview', async () => {
    const runner = await loadRunner(CHARTER_VALIDATOR);
    const root = tmp();
    seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    const epic = path.join(root, 'docs', 'epics', 'CTX-EMPTY');
    fs.mkdirSync(path.join(epic, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(epic, 'inputs.json'), '{}\n', 'utf8');

    const verdict = await runner({
      workspaceRoot: root,
      pipeline: { steps: [{ name: 'define-charter' }] },
      state: { currentStepIdx: 0, runId: 'CTX-EMPTY' },
      step: { stepIdx: 0 },
      paths: { produces: ['docs/epics/CTX-EMPTY/artifacts/CHARTER-DISCOVERY.md'] },
    });
    expect(verdict.decision).toBe('reject');
    expect(verdict.reason).toMatch(/idea/i);
    expect(verdict.reason).toMatch(/CHARTER-DISCOVERY/i);
  });

  it('requires DRIFT-REPORT coverage for each INV-x on check-drift', async () => {
    const runner = await loadRunner(CHARTER_VALIDATOR);
    const root = tmp();
    seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    fs.writeFileSync(
      path.join(root, DRIFT_REPORT_REL),
      '# Drift Report\n\n## Summary\n\nNo invariants listed.\n',
      'utf8',
    );

    const rejectVerdict = await runner({
      workspaceRoot: root,
      pipeline: { steps: [{ name: 'check-drift' }] },
      state: { currentStepIdx: 0 },
      step: { stepIdx: 0 },
      paths: { produces: [path.join(root, DRIFT_REPORT_REL)] },
    });
    expect(rejectVerdict.decision).toBe('reject');
    expect(rejectVerdict.reason).toMatch(/INV-1/);

    fs.writeFileSync(
      path.join(root, DRIFT_REPORT_REL),
      '# Drift Report\n\n## Invariants\n\n### INV-1 — Intent stays at project tier\n\n- **Status:** UNKNOWN\n',
      'utf8',
    );
    const passVerdict = await runner({
      workspaceRoot: root,
      pipeline: { steps: [{ name: 'check-drift' }] },
      state: { currentStepIdx: 0 },
      step: { stepIdx: 0 },
      paths: { produces: [path.join(root, DRIFT_REPORT_REL)] },
    });
    expect(passVerdict.decision).toBe('pass');
  });

  it('rejects missing CONVENTIONS.md and duplicate ids', async () => {
    const runner = await loadRunner(CHARTER_VALIDATOR);
    const root = tmp();
    seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    fs.rmSync(path.join(root, CONVENTIONS_REL));
    writeDefineCharterEpic(
      root,
      'CTX-DUP',
      'AIDLC monorepo workspace for agent-driven SDLC with human approve gates.',
    );

    const doc = readCharterJson(root);
    doc.goals.push({ ...doc.goals[0]!, id: 'G-1' });
    fs.writeFileSync(
      path.join(root, CHARTER_JSON_REL),
      `${JSON.stringify(doc, null, 2)}\n`,
      'utf8',
    );

    const verdict = await runner({
      workspaceRoot: root,
      pipeline: { steps: [{ name: 'define-charter' }] },
      state: { currentStepIdx: 0, runId: 'CTX-DUP' },
      step: { stepIdx: 0 },
      paths: { produces: ['docs/epics/CTX-DUP/artifacts/CHARTER-DISCOVERY.md'] },
    });
    expect(verdict.decision).toBe('reject');
    expect(verdict.reason).toMatch(/CONVENTIONS\.md/);
    expect(verdict.reason).toMatch(/duplicate goal id/);
  });
});

describe('rules-sync.mjs validator', () => {
  it('passes when markers match and rejects stale revision', async () => {
    const runner = await loadRunner(RULES_VALIDATOR);
    const root = tmp();
    seedCharterArtifacts(root, { templatesRoot: defaultCharterTemplatesDir() });
    syncProjectRules(root);

    const passVerdict = await runner({ workspaceRoot: root });
    expect(passVerdict.decision).toBe('pass');

    const doc = readCharterJson(root);
    doc.revision = 99;
    fs.writeFileSync(
      path.join(root, CHARTER_JSON_REL),
      `${JSON.stringify(doc, null, 2)}\n`,
      'utf8',
    );
    const rejectVerdict = await runner({ workspaceRoot: root });
    expect(rejectVerdict.decision).toBe('reject');
    expect(rejectVerdict.reason).toMatch(/stale/i);
  });
});
