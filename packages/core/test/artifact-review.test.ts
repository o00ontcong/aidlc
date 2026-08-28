/**
 * Content-addressed review bundles (M1, Task 3).
 *
 * A Canvas gate presents an exact set of files to a human. The verdict that
 * closes the gate is bound to those files' content hashes, so the bundle has
 * two jobs: resolve the declared artifacts safely, and make "has this changed
 * since it was reviewed?" answerable without keeping the file bodies around.
 *
 * The path handling is the security-sensitive half. Declared templates come
 * from `workspace.yaml`, but the resolved paths are handed to a browser-based
 * review tool, so the bundle is the last place to establish that every path is
 * a regular file inside the workspace — not a symlink, not a directory, not a
 * traversal out of the tree.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ArtifactReviewError,
  buildReviewBundle,
  checkBundleCurrent,
  MAX_REVIEW_ARTIFACTS,
  MAX_REVIEW_ARTIFACT_BYTES,
} from '../src/runs/ArtifactReview';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** Throwaway workspace with an epic artifacts folder. */
function makeWorkspace(files: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-review-'));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  return root;
}

const PRD_TEMPLATE = 'docs/epics/{epic}/artifacts/PRD.md';
const PRD_REL = 'docs/epics/EPIC-1/artifacts/PRD.md';
const PLAN_TEMPLATE = 'docs/epics/{epic}/artifacts/TEST-PLAN.md';
const PLAN_REL = 'docs/epics/EPIC-1/artifacts/TEST-PLAN.md';

const BOUND = {
  runId: 'run-1',
  stepIdx: 0,
  stepRevision: 1,
  reviewRevision: 1,
  context: { epic: 'EPIC-1' },
  builtAt: '2026-01-01T00:00:00.000Z',
};

function build(
  workspaceRoot: string,
  artifacts: string[],
  over: Partial<typeof BOUND> & { epicsDir?: string } = {},
) {
  return buildReviewBundle({ workspaceRoot, artifacts, ...BOUND, ...over });
}

function sha256(body: string): string {
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

describe('buildReviewBundle — resolution and hashing', () => {
  it('resolves placeholders and hashes each file', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    const bundle = build(root, [PRD_TEMPLATE]);

    expect(bundle.artifacts).toHaveLength(1);
    expect(bundle.artifacts[0].template).toBe(PRD_TEMPLATE);
    expect(bundle.artifacts[0].path).toBe(PRD_REL);
    expect(bundle.artifacts[0].hash).toBe(sha256('# PRD\n'));
    expect(bundle.artifacts[0].bytes).toBe(Buffer.byteLength('# PRD\n'));
  });

  it('binds the bundle to run, step, step revision and review revision', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    const bundle = build(root, [PRD_TEMPLATE], { stepIdx: 3, stepRevision: 2, reviewRevision: 4 });

    expect(bundle).toMatchObject({
      runId: 'run-1',
      stepIdx: 3,
      stepRevision: 2,
      reviewRevision: 4,
      builtAt: '2026-01-01T00:00:00.000Z',
    });
    expect(bundle.bundleHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('never stores file bodies', () => {
    const root = makeWorkspace({ [PRD_REL]: 'SECRET MARKER\n' });
    const bundle = build(root, [PRD_TEMPLATE]);
    expect(JSON.stringify(bundle)).not.toContain('SECRET MARKER');
  });

  it('honours a custom epics directory', () => {
    const root = makeWorkspace({ 'custom/epics/EPIC-1/artifacts/PRD.md': '# PRD\n' });
    const bundle = build(root, [PRD_TEMPLATE], { epicsDir: 'custom/epics' });
    expect(bundle.artifacts[0].path).toBe('custom/epics/EPIC-1/artifacts/PRD.md');
  });
});

describe('buildReviewBundle — bundleHash', () => {
  it('is stable across rebuilds of unchanged content', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n', [PLAN_REL]: '# Plan\n' });
    const a = build(root, [PRD_TEMPLATE, PLAN_TEMPLATE]);
    const b = build(root, [PRD_TEMPLATE, PLAN_TEMPLATE], { builtAt: '2026-06-30T12:00:00.000Z' });
    // Same content, same declared order → same digest, even at a later time.
    expect(b.bundleHash).toBe(a.bundleHash);
  });

  it('changes when any file changes', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n', [PLAN_REL]: '# Plan\n' });
    const before = build(root, [PRD_TEMPLATE, PLAN_TEMPLATE]).bundleHash;

    fs.writeFileSync(path.join(root, PLAN_REL), '# Plan v2\n', 'utf8');
    expect(build(root, [PRD_TEMPLATE, PLAN_TEMPLATE]).bundleHash).not.toBe(before);
  });

  it('distinguishes two files whose contents were swapped', () => {
    const root = makeWorkspace({ [PRD_REL]: 'A\n', [PLAN_REL]: 'B\n' });
    const before = build(root, [PRD_TEMPLATE, PLAN_TEMPLATE]).bundleHash;

    fs.writeFileSync(path.join(root, PRD_REL), 'B\n', 'utf8');
    fs.writeFileSync(path.join(root, PLAN_REL), 'A\n', 'utf8');
    // A digest over the unordered set of hashes would collide here.
    expect(build(root, [PRD_TEMPLATE, PLAN_TEMPLATE]).bundleHash).not.toBe(before);
  });
});

describe('buildReviewBundle — refuses unsafe paths', () => {
  it('refuses a traversal out of the workspace', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    expect(() => build(root, ['docs/epics/{epic}/../../../../etc/passwd.md'])).toThrow(
      ArtifactReviewError,
    );
  });

  it('refuses a traversal smuggled in through the context', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    // The placeholder value is run context, not a declared path — it must not
    // be able to widen the reviewable surface.
    expect(() => build(root, [PRD_TEMPLATE], { context: { epic: '../../../../etc' } })).toThrow(
      ArtifactReviewError,
    );
  });

  it('refuses an absolute path', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    expect(() => build(root, ['/etc/passwd.md'])).toThrow(ArtifactReviewError);
  });

  it('refuses a symlink instead of following it', () => {
    const root = makeWorkspace({ 'secret.md': 'TOP SECRET\n' });
    const link = path.join(root, PRD_REL);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(path.join(root, 'secret.md'), link);

    expect(() => build(root, [PRD_TEMPLATE])).toThrow(ArtifactReviewError);
  });

  it('refuses a directory', () => {
    const root = makeWorkspace();
    fs.mkdirSync(path.join(root, PRD_REL), { recursive: true });
    expect(() => build(root, [PRD_TEMPLATE])).toThrow(ArtifactReviewError);
  });

  it('refuses a missing file and names it', () => {
    const root = makeWorkspace();
    try {
      build(root, [PRD_TEMPLATE]);
      throw new Error('expected buildReviewBundle to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ArtifactReviewError);
      expect((err as ArtifactReviewError).code).toBe('missing');
      expect((err as ArtifactReviewError).paths).toEqual([PRD_REL]);
    }
  });
});

describe('buildReviewBundle — bounded', () => {
  it('refuses more artifacts than the cap', () => {
    const files: Record<string, string> = {};
    const templates: string[] = [];
    for (let i = 0; i <= MAX_REVIEW_ARTIFACTS; i += 1) {
      files[`docs/epics/EPIC-1/artifacts/DOC-${i}.md`] = `# ${i}\n`;
      templates.push(`docs/epics/{epic}/artifacts/DOC-${i}.md`);
    }
    const root = makeWorkspace(files);
    expect(() => build(root, templates)).toThrow(ArtifactReviewError);
  });

  it('refuses a file over the per-file byte cap', () => {
    const root = makeWorkspace({ [PRD_REL]: 'x'.repeat(MAX_REVIEW_ARTIFACT_BYTES + 1) });
    expect(() => build(root, [PRD_TEMPLATE])).toThrow(ArtifactReviewError);
  });
});

describe('checkBundleCurrent', () => {
  it('reports nothing stale when content is untouched', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    expect(checkBundleCurrent(root, build(root, [PRD_TEMPLATE]))).toEqual([]);
  });

  it('reports a changed file with both hashes', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    const bundle = build(root, [PRD_TEMPLATE]);

    fs.writeFileSync(path.join(root, PRD_REL), '# PRD edited after approval\n', 'utf8');
    const stale = checkBundleCurrent(root, bundle);

    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ path: PRD_REL, reason: 'changed' });
    expect(stale[0].expectedHash).toBe(sha256('# PRD\n'));
    expect(stale[0].actualHash).toBe(sha256('# PRD edited after approval\n'));
  });

  it('reports a file deleted after bundling', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n' });
    const bundle = build(root, [PRD_TEMPLATE]);

    fs.rmSync(path.join(root, PRD_REL));
    expect(checkBundleCurrent(root, bundle)).toEqual([
      { path: PRD_REL, reason: 'missing', expectedHash: sha256('# PRD\n') },
    ]);
  });

  it('reports a file swapped for a symlink after bundling', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n', 'secret.md': 'TOP SECRET\n' });
    const bundle = build(root, [PRD_TEMPLATE]);

    fs.rmSync(path.join(root, PRD_REL));
    fs.symlinkSync(path.join(root, 'secret.md'), path.join(root, PRD_REL));

    const stale = checkBundleCurrent(root, bundle);
    expect(stale).toHaveLength(1);
    expect(stale[0].reason).toBe('unreadable');
  });

  it('lists every stale file, not just the first', () => {
    const root = makeWorkspace({ [PRD_REL]: '# PRD\n', [PLAN_REL]: '# Plan\n' });
    const bundle = build(root, [PRD_TEMPLATE, PLAN_TEMPLATE]);

    fs.writeFileSync(path.join(root, PRD_REL), 'edited\n', 'utf8');
    fs.rmSync(path.join(root, PLAN_REL));

    expect(checkBundleCurrent(root, bundle).map((s) => s.reason)).toEqual(['changed', 'missing']);
  });
});
