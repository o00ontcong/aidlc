import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

const VALIDATOR = path.join(__dirname, '..', 'templates', 'cohesive', 'validators', 'diff-review.mjs');

type Verdict = { decision: 'pass' | 'reject'; reason: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runner: (ctx: any) => Promise<Verdict>;

beforeEach(async () => {
  const mod = await import(pathToFileURL(VALIDATOR).href + `?t=${Date.now()}`);
  runner = mod.default;
});

describe('diff-review validator', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-diff-review-'));
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: root, stdio: 'ignore' });

    const featureArt = path.join(root, 'docs', 'epics', 'EPIC-1', 'artifacts');
    const pkgArt = path.join(root, 'docs', 'epics', 'EPIC-1-WP-01', 'artifacts');
    const pkgEpic = path.join(root, 'docs', 'epics', 'EPIC-1-WP-01');
    fs.mkdirSync(featureArt, { recursive: true });
    fs.mkdirSync(pkgArt, { recursive: true });
    fs.mkdirSync(pkgEpic, { recursive: true });

    fs.writeFileSync(path.join(pkgEpic, 'inputs.json'), JSON.stringify({
      feature_id: 'EPIC-1',
      package_id: 'WP-01',
    }));
    fs.writeFileSync(path.join(featureArt, 'WORK-PACKAGES.json'), JSON.stringify({
      packages: [{
        id: 'WP-01',
        ownedPaths: ['packages/core/src/foo/**'],
        writeScope: ['packages/core/src/foo/**'],
      }],
    }));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const ctx = () => ({
    workspaceRoot: root,
    state: { runId: 'EPIC-1-WP-01' },
  });

  it('rejects changed files outside ownedPaths', async () => {
    const art = path.join(root, 'docs', 'epics', 'EPIC-1-WP-01', 'artifacts');
    fs.writeFileSync(path.join(art, 'REVIEW-DIFF.md'), [
      '# Review Diff',
      '',
      '- `packages/core/src/foo/a.ts`',
      '- `packages/other/secret.ts`',
      '',
    ].join('\n'));

    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toContain('packages/other/secret.ts');
  });

  it('passes when all changed files are inside ownedPaths', async () => {
    const art = path.join(root, 'docs', 'epics', 'EPIC-1-WP-01', 'artifacts');
    fs.writeFileSync(path.join(art, 'REVIEW-DIFF.md'), [
      '# Review Diff',
      '',
      '- `packages/core/src/foo/a.ts`',
      '- `packages/core/src/foo/b.ts`',
      '',
    ].join('\n'));

    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });

  it('accepts legacy writeScope when ownedPaths is absent', async () => {
    const featureArt = path.join(root, 'docs', 'epics', 'EPIC-1', 'artifacts');
    fs.writeFileSync(path.join(featureArt, 'WORK-PACKAGES.json'), JSON.stringify({
      packages: [{
        id: 'WP-01',
        writeScope: ['src/**'],
      }],
    }));
    const art = path.join(root, 'docs', 'epics', 'EPIC-1-WP-01', 'artifacts');
    fs.writeFileSync(path.join(art, 'REVIEW-DIFF.md'), '- `src/x.ts`\n');

    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });
});
