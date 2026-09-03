import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  SCAN_PASSES,
  collectScanInventory,
  deriveScanSeedSentence,
  formatDiscoverScanArgs,
  nextScanPass,
  parseDiscoverScanArgs,
  renderDiscoverScanBrief,
  scanPassDocPaths,
  type DiscoverScope,
} from '../src';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-scan-'));
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

const parentScope = (root: string): DiscoverScope => ({
  layout: 'parent',
  repos: [
    { path: 'app', kind: 'mobile', name: 'app' },
    { path: 'api', kind: 'backend', name: 'api' },
  ],
  excludes: [],
  declaredAt: '2026-01-01T00:00:00.000Z',
});

describe('scan passes', () => {
  it('splits the twelve steps into product → architecture → plan', () => {
    expect(SCAN_PASSES.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(scanPassDocPaths(1)).toContain('product/IDEA.md');
    expect(scanPassDocPaths(1)).toContain('product/FEATURES.md');
    expect(scanPassDocPaths(1)).not.toContain('architecture/TECH_STACK.md');
    expect(scanPassDocPaths(2)).toContain('architecture/TECH_STACK.md');
    expect(scanPassDocPaths(3)).toContain('plans/SKELETON.md');
    expect(nextScanPass(1)).toBe(2);
    expect(nextScanPass(2)).toBe(3);
    expect(nextScanPass(3)).toBeUndefined();
  });
});

describe('scan slash args', () => {
  it('round-trips pass, layout, repos and brief path', () => {
    const scope = parentScope('/tmp');
    const raw = formatDiscoverScanArgs({ pass: 2, scope, note: 'focus on auth' });
    expect(raw).toContain('pass=2');
    expect(raw).toContain('layout=parent');
    expect(raw).toContain('repos=app:mobile,api:backend');
    expect(raw).toContain('brief=.aidlc/discover/scan-brief.md');
    const parsed = parseDiscoverScanArgs(raw);
    expect(parsed.pass).toBe(2);
    expect(parsed.layout).toBe('parent');
    expect(parsed.repos).toEqual([
      { path: 'app', kind: 'mobile' },
      { path: 'api', kind: 'backend' },
    ]);
    expect(parsed.note).toBe('focus on auth');
  });
});

describe('scan inventory', () => {
  it('lists source inside declared repos and skips AI scaffolding and docs', () => {
    const root = newRoot();
    write(root, 'README.md', '# AIDLC parent\n');
    write(root, '.claude/commands/aidlc-discover-scan.md', '# tooling\n');
    write(root, 'docs/product/IDEA.md', '# Idea\n');
    write(root, 'app/README.md', '# Weather\n');
    write(root, 'app/Sources/App.swift', 'struct App {}\n');
    write(root, 'app/.claude/skill.md', '# not product\n');
    write(root, 'api/go.mod', 'module weather\n');
    write(root, 'api/cmd/server.go', 'package main\n');

    const inventory = collectScanInventory(root, parentScope(root));
    const files = inventory.repos.flatMap((r) => r.files);
    expect(files.some((f) => f.endsWith('App.swift'))).toBe(true);
    expect(files.some((f) => f.endsWith('server.go'))).toBe(true);
    expect(files.some((f) => f.includes('.claude'))).toBe(false);
    expect(files.some((f) => f.startsWith('docs/'))).toBe(false);
    expect(inventory.repos.find((r) => r.path === 'app')?.readmeTitle).toBe('Weather');

    const brief = renderDiscoverScanBrief({ inventory, pass: 1, docsRoot: 'docs' });
    expect(brief).toContain('pass');
    expect(brief).toContain('product/IDEA.md');
    expect(brief).not.toContain('architecture/TECH_STACK.md');
    expect(brief).toContain('`app/Sources/App.swift`');
  });

  it('embeds key file content (manifest, entry-point, model) into the brief', () => {
    const root = newRoot();
    write(root, 'app/package.json', JSON.stringify({ name: 'weather', version: '1.0.0' }));
    write(root, 'app/src/index.ts', 'export const hello = "world";');
    write(root, 'app/src/models/weather.ts', 'export interface Weather { temp: number; }');
    write(root, 'app/src/utils/format.ts', 'export function fmt(n: number) { return n.toString(); }');

    const scope: DiscoverScope = {
      layout: 'single',
      repos: [{ path: 'app', kind: 'app', name: 'app' }],
      excludes: [],
      declaredAt: '2026-01-01T00:00:00.000Z',
    };
    const inventory = collectScanInventory(root, scope);
    const appRepo = inventory.repos[0]!;
    const keyRels = appRepo.keyFiles.map((kf) => kf.rel);
    expect(keyRels.some((r) => r.includes('package.json'))).toBe(true);
    expect(keyRels.some((r) => r.includes('index.ts'))).toBe(true);
    expect(keyRels.some((r) => r.includes('weather.ts'))).toBe(true);
    expect(keyRels.some((r) => r.includes('format.ts'))).toBe(false);

    const brief = renderDiscoverScanBrief({ inventory, pass: 1, docsRoot: 'docs' });
    expect(brief).toContain('### Key file contents');
    expect(brief).toContain('weather');
    expect(brief).toContain('hello = "world"');
    expect(brief).toContain('Weather { temp');
  });

  it('truncates large files and tracks remaining budget across repos', () => {
    const root = newRoot();
    // repo-a has a massive file (> MAX_FILE_CHARS = 12 000)
    const bigContent = 'y'.repeat(15_000);
    write(root, 'repo-a/package.json', bigContent);
    // repo-b has a small file
    write(root, 'repo-b/package.json', JSON.stringify({ name: 'b' }));

    const scope: DiscoverScope = {
      layout: 'parent',
      repos: [
        { path: 'repo-a', kind: 'app', name: 'a' },
        { path: 'repo-b', kind: 'app', name: 'b' },
      ],
      excludes: [],
      declaredAt: '2026-01-01T00:00:00.000Z',
    };
    const inventory = collectScanInventory(root, scope);
    const repoA = inventory.repos.find((r) => r.path === 'repo-a')!;
    const repoB = inventory.repos.find((r) => r.path === 'repo-b')!;
    // repo-a: file is embedded but truncated to MAX_FILE_CHARS
    expect(repoA.keyFiles.length).toBeGreaterThan(0);
    expect(repoA.keyFiles[0]!.truncated).toBe(true);
    // repo-b: budget still has room, so its manifest is embedded too
    expect(repoB.keyFiles.length).toBeGreaterThan(0);
    expect(repoB.keyFiles[0]!.truncated).toBe(false);
  });
});

describe('deriveScanSeedSentence', () => {
  it('uses a child README on a parent layout, not the workspace-root README', () => {
    const root = newRoot();
    write(root, 'README.md', '# AIDLC checkout\n');
    write(root, 'app/README.md', '# Weather\n');
    write(root, 'app/Sources/App.swift', '');
    expect(deriveScanSeedSentence(root, parentScope(root))).toBe('Weather');
  });

  it('uses the root README on a single-repo layout', () => {
    const root = newRoot();
    write(root, 'README.md', '# Video Player\n');
    write(root, 'src/main.ts', '');
    expect(deriveScanSeedSentence(root, {
      layout: 'single',
      repos: [{ path: '.', kind: 'app', name: 'player' }],
      excludes: [],
      declaredAt: '2026-01-01T00:00:00.000Z',
    })).toBe('Video Player');
  });
});
