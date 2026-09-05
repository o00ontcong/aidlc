import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscoverService,
  EXCLUDED_DIRS,
  checkSourceRepoWrites,
  guessRepoKind,
  probeRepoLayout,
  singleRepoScope,
  sourceExcludes,
  snapshotSourceRevisions,
  sourceRevisionDrift,
  sourceRoots,
  listProductSourceFiles,
  walkProductSourceFiles,
  syncDiscoverCommandsForProvider,
  type ActorRef,
} from '../src';

const USER: ActorRef = { kind: 'user', id: 'test' };

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-scope-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }); }
});

function write(root: string, relative: string, body = ''): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function initGit(root: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@aidlc.dev'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'AIDLC Test'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: root });
}

/** A folder that looks like its own git repo, without shelling out to git. */
function fakeRepo(root: string, relative: string): void {
  write(root, `${relative}/.git/HEAD`, 'ref: refs/heads/main\n');
}

describe('guessRepoKind', () => {
  it('reads a native iOS project as mobile', () => {
    const root = newRoot();
    write(root, 'OtenPass.xcodeproj/project.pbxproj');
    expect(guessRepoKind(root).kind).toBe('mobile');
  });

  it('separates a frontend package.json from a backend one', () => {
    const web = newRoot();
    write(web, 'package.json', JSON.stringify({ dependencies: { react: '18' } }));
    expect(guessRepoKind(web).kind).toBe('frontend');

    const api = newRoot();
    write(api, 'package.json', JSON.stringify({ dependencies: { fastify: '4' } }));
    expect(guessRepoKind(api).kind).toBe('backend');
  });

  it('prefers React Native over the frontend reading of the same manifest', () => {
    const root = newRoot();
    write(root, 'package.json', JSON.stringify({ dependencies: { react: '18', 'react-native': '0.74' } }));
    expect(guessRepoKind(root).kind).toBe('mobile');
  });

  it('says nothing when there is no manifest to go on', () => {
    expect(guessRepoKind(newRoot())).toEqual({ kind: '', manifests: [] });
  });
});

describe('probeRepoLayout', () => {
  it('suggests `parent` for a docs-only repo whose code lives in child repos', () => {
    const root = newRoot();
    write(root, 'docs/product/IDEA.md', '# Idea\n');
    write(root, 'README.md', '# OtenPass\n');
    fakeRepo(root, 'app');
    write(root, 'app/OtenPass.xcodeproj/project.pbxproj');
    fakeRepo(root, 'backend');
    write(root, 'backend/go.mod', 'module oten\n');

    const probe = probeRepoLayout(root);
    expect(probe.suggested).toBe('parent');
    expect(probe.children.map((c) => `${c.path}:${c.kind}`).sort()).toEqual(['app:mobile', 'backend:backend']);
    expect(probe.children.every((c) => c.isRepo)).toBe(true);
  });

  it('suggests `single` when the root holds its own source', () => {
    const root = newRoot();
    write(root, 'package.json', JSON.stringify({ name: 'thing', dependencies: { express: '4' } }));
    const probe = probeRepoLayout(root);
    expect(probe.suggested).toBe('single');
    expect(probe.self.kind).toBe('backend');
  });

  /**
   * The bug this whole module exists for: a scan that reads `.aidlc/`,
   * `.claude/` or `.cursor/` describes the AI tooling's stack ("Markdown as
   * the prompt language") instead of the product's.
   */
  it('never offers AI scaffolding or vendored trees as source', () => {
    const root = newRoot();
    write(root, 'docs/product/IDEA.md', '# Idea\n');
    fakeRepo(root, 'app');
    write(root, 'app/Package.swift', '');
    // Scaffolding that carries its own manifest and even its own git dir.
    write(root, '.opencode/package.json', JSON.stringify({ dependencies: { react: '18' } }));
    write(root, '.claude/commands/x.md', '# x\n');
    fakeRepo(root, '.aidlc/aidlc-templates');
    write(root, 'node_modules/left-pad/package.json', JSON.stringify({ name: 'left-pad' }));
    write(root, '.aidlc/discover/snapshots/run-001/product/IDEA.md', '# Idea\n');

    const paths = probeRepoLayout(root).children.map((c) => c.path);
    expect(paths).toEqual(['app']);
    for (const excluded of ['.aidlc', '.claude', '.opencode', 'node_modules']) {
      expect(EXCLUDED_DIRS).toContain(excluded);
      expect(paths.some((p) => p.startsWith(excluded))).toBe(false);
    }
  });

  it('stops at a child rather than walking into its subprojects', () => {
    const root = newRoot();
    write(root, 'docs/README.md', '# docs\n');
    fakeRepo(root, 'app');
    write(root, 'app/package.json', JSON.stringify({ dependencies: { react: '18' } }));
    write(root, 'app/packages/ui/package.json', JSON.stringify({ dependencies: { react: '18' } }));

    expect(probeRepoLayout(root).children.map((c) => c.path)).toEqual(['app']);
  });
});

describe('a declared scope', () => {
  it('is persisted and reused, and resolves to real directories', () => {
    const root = newRoot();
    fakeRepo(root, 'app');
    write(root, 'app/Package.swift', '');
    fakeRepo(root, 'backend');
    write(root, 'backend/go.mod', 'module oten\n');

    const service = new DiscoverService(root);
    service.init({ seedSentence: 'OtenPass — passwordless login.', actor: USER });
    expect(service.scope()).toBeUndefined();

    service.setScope({
      layout: 'parent',
      repos: [{ path: 'app', kind: 'mobile' }, { path: 'backend', kind: 'backend' }, { path: 'gone', kind: 'infra' }],
      excludes: ['fixtures'],
    });

    const scope = service.scope();
    expect(scope?.layout).toBe('parent');
    expect(scope?.declaredAt).toBeTruthy();
    // A repo that has moved away is skipped rather than handed to the agent.
    expect(sourceRoots(root, scope)).toEqual([path.join(root, 'app'), path.join(root, 'backend')]);
    expect(sourceExcludes(scope)).toContain('fixtures');
    expect(sourceExcludes(scope)).toContain('.aidlc');
  });

  it('falls back to this-repo-only for a blueprint that never declared one', () => {
    const root = newRoot();
    write(root, 'go.mod', 'module thing\n');
    const service = new DiscoverService(root);
    service.init({ seedSentence: 'A thing.', actor: USER });

    const effective = service.effectiveScope();
    expect(effective.layout).toBe('single');
    expect(effective.repos).toEqual([{ path: '.', kind: 'backend', name: path.basename(root) }]);
    // …without writing that assumption to disk, so the wizard still asks.
    expect(service.scope()).toBeUndefined();
    expect(service.declaredScope()).toBeUndefined();
  });

  it('persists scope.json before a blueprint exists and reuses it on init', () => {
    const root = newRoot();
    fakeRepo(root, 'app');
    write(root, 'app/Package.swift', '');

    const service = new DiscoverService(root);
    expect(service.exists()).toBe(false);

    const saved = service.persistDeclaredScope({
      layout: 'parent',
      repos: [{ path: 'app', kind: 'mobile', name: 'app' }],
      excludes: [],
    });
    expect(saved.declaredAt).toBeTruthy();
    expect(service.declaredScope()?.layout).toBe('parent');
    expect(service.scope()).toBeUndefined();

    service.init({ seedSentence: 'OtenPass.', actor: USER });
    expect(service.scope()?.repos).toEqual([{ path: 'app', kind: 'mobile', name: 'app' }]);
  });

  it('labels a source-less repo `app` rather than leaving the kind empty', () => {
    const root = newRoot();
    expect(singleRepoScope(root, '2026-01-01T00:00:00.000Z').repos[0]!.kind).toBe('app');
  });
});

describe('checkSourceRepoWrites', () => {
  it('reports a source repo the run dirtied', () => {
    const issues = checkSourceRepoWrites(
      { app: 'head-a\n', backend: 'head-b\n' },
      { app: 'head-a\n M Sources/Auth.swift\n', backend: 'head-b\n' },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('source-repo-written');
    expect(issues[0]!.file).toBe('app');
  });

  it('ignores docs and .aidlc edits in the blueprint repo, but flags source edits', () => {
    expect(checkSourceRepoWrites(
      { '.': 'head-a\n' },
      { '.': 'head-a\n M docs/product/IDEA.md\n?? .aidlc/discover/scan-brief.md\n' },
    )).toEqual([]);
    const issues = checkSourceRepoWrites(
      { '.': 'head-a\n' },
      { '.': 'head-a\n M src/auth.ts\n' },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('source-repo-written');
    expect(issues[0]!.file).toBe('.');
  });

  it('stays quiet when git could not be asked, or a repo vanished mid-run', () => {
    expect(checkSourceRepoWrites({ app: '' }, { app: '' })).toEqual([]);
    expect(checkSourceRepoWrites({ app: 'head-a\n' }, {})).toEqual([]);
  });
});

describe('source revision snapshots', () => {
  it('treats a moved checkout as stale input, not as an agent-owned write', () => {
    const before = {
      capturedAt: '2026-09-05T00:00:00.000Z',
      repos: [{ path: '.', head: 'abc123', ref: 'main', worktree: '' }],
    };
    const after = {
      capturedAt: '2026-09-05T00:01:00.000Z',
      repos: [{ path: '.', head: 'def456', ref: 'main', worktree: '' }],
    };
    const issues = sourceRevisionDrift(before, after);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'source-revision-changed', file: '.' });
  });

  it('permits blueprint docs changes but makes source working-tree changes stale', () => {
    const root = newRoot();
    write(root, 'package.json', '{"name":"thing"}\n');
    initGit(root);
    const scope = singleRepoScope(root, '2026-09-05T00:00:00.000Z');
    const before = snapshotSourceRevisions(root, scope, { docsRoot: 'docs', capturedAt: '2026-09-05T00:00:00.000Z' });

    write(root, 'docs/product/IDEA.md', '# Idea\n');
    expect(sourceRevisionDrift(before, snapshotSourceRevisions(root, scope, { docsRoot: 'docs' }))).toEqual([]);

    write(root, 'src/index.ts', 'export const changed = true;\n');
    expect(sourceRevisionDrift(before, snapshotSourceRevisions(root, scope, { docsRoot: 'docs' }))[0])
      .toMatchObject({ code: 'source-worktree-changed', file: '.' });
  });
});

/**
 * The prompt fix only reaches a real workspace if the generated command file
 * on disk is allowed to change. Command sync is `overwrite: false` everywhere,
 * which used to pin a workspace to whatever scan prompt shipped the day it was
 * set up — including one that had never heard of source scoping.
 */
describe('generated Discover command files', () => {
  it('are refreshed when the generated body changes, and left alone when marked keep', () => {
    const root = newRoot();
    const file = path.join(root, '.claude', 'commands', 'aidlc-discover-scan.md');

    syncDiscoverCommandsForProvider(root, 'claude');
    const fresh = fs.readFileSync(file, 'utf8');
    expect(fresh).toContain('aidlc:generated aidlc-discover-scan');
    expect(fresh).toContain('pass=<1|2|3>');
    expect(fresh).toContain('.aidlc/discover/scan-brief.md');

    // A stale body from an older extension version.
    fs.writeFileSync(file, '# AIDLC Discover Agent — Scan existing project\n\nExplore the real codebase.\n');
    syncDiscoverCommandsForProvider(root, 'claude');
    expect(fs.readFileSync(file, 'utf8')).toEqual(fresh);

    // Re-running changes nothing once the stamp matches.
    const before = fs.statSync(file).mtimeMs;
    syncDiscoverCommandsForProvider(root, 'claude');
    expect(fs.statSync(file).mtimeMs).toBe(before);

    // The escape hatch for someone who hand-tuned the prompt.
    fs.writeFileSync(file, '# My own scan prompt\n\n<!-- aidlc:keep -->\n');
    syncDiscoverCommandsForProvider(root, 'claude');
    expect(fs.readFileSync(file, 'utf8')).toContain('My own scan prompt');
  });
});

describe('listProductSourceFiles', () => {
  it('falls back to the workspace root when declared child repos are gone', () => {
    const root = newRoot();
    write(root, 'App/Features/Login/LoginView.swift', 'struct LoginView {}');
    const files = listProductSourceFiles(root, {
      layout: 'parent',
      repos: [{ path: 'ios', kind: 'mobile', name: 'ios' }],
      excludes: [],
      declaredAt: '2026-01-01T00:00:00.000Z',
    });
    expect(files.some((f) => f.endsWith('LoginView.swift'))).toBe(true);
  });

  it('does not let SourcePackages crowd out product source', () => {
    const root = newRoot();
    write(root, 'App/Login/LoginView.swift', 'struct LoginView {}');
    write(root, 'SourcePackages/checkouts/foo/Sources/Foo.swift', 'struct Foo {}');
    const files = walkProductSourceFiles(root, { limit: 8000 });
    expect(files.some((f) => f.endsWith('LoginView.swift'))).toBe(true);
    expect(files.some((f) => f.includes('SourcePackages'))).toBe(false);
  });
});
