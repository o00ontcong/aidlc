import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeProjectWorkspace, readProjectWorkspace } from '../src/v2/projectWorkspace';

const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-project-workspace-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('project workspace shared context', () => {
  it('creates the four shared documents and reports a ready workspace', () => {
    const root = tempRoot();

    const created = initializeProjectWorkspace(root, 'Payments');
    const summary = readProjectWorkspace(root);

    expect(created).toHaveLength(4);
    expect(summary.initialized).toBe(true);
    expect(summary.readyCount).toBe(4);
    expect(fs.readFileSync(path.join(root, 'PROJECT.md'), 'utf8')).toContain('# Payments');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('Read `PROJECT.md`');
  });

  it('never overwrites existing project instructions', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Existing rules\n', 'utf8');

    const created = initializeProjectWorkspace(root, 'Payments');

    expect(created).toHaveLength(3);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('# Existing rules\n');
  });

  it('surfaces a short document excerpt for the overview', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, 'STATUS.md'), '# Status\n\n- Authentication is complete.\n', 'utf8');

    const status = readProjectWorkspace(root).documents.find((document) => document.id === 'status');

    expect(status?.exists).toBe(true);
    expect(status?.excerpt).toBe('- Authentication is complete.');
  });
});
