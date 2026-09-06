import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DiscoverService, DOC_IDEA, type ActorRef } from '../src';

const USER: ActorRef = { kind: 'user', id: 'test' };

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-discover-scan-proposal-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function seeded(): DiscoverService {
  const service = new DiscoverService(newRoot());
  service.init({ seedSentence: 'App xem video ho tro 2 subtitle cung luc.', actor: USER });
  return service;
}

function initGit(root: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@aidlc.dev'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'AIDLC Test'], { cwd: root });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export const version = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: root });
}

describe('DiscoverService — Context-Proposal-based scan (M5)', () => {
  it('seeds the staging dir from the canonical context and pins a HEAD source snapshot, without touching canonical docs', () => {
    const service = seeded();
    initGit(service.workspaceRoot);
    const before = fs.readFileSync(service.docFile(DOC_IDEA), 'utf8');

    const started = service.startScanProposalRun({ actor: USER, scanPass: 1 });

    expect(started.documentPaths).toContain(DOC_IDEA);
    expect(started.sourceSnapshot.mode).toBe('head');
    expect(started.warnings).toEqual([]);
    const stagedIdea = fs.readFileSync(path.join(started.stagingRoot, DOC_IDEA), 'utf8');
    expect(stagedIdea).toBe(before);
    // Canonical docs are untouched by starting a scan.
    expect(fs.readFileSync(service.docFile(DOC_IDEA), 'utf8')).toBe(before);
  });

  it('turns a real staged edit into an applicable Context Proposal, leaving canonical docs untouched until apply', () => {
    const service = seeded();
    initGit(service.workspaceRoot);
    const started = service.startScanProposalRun({ actor: USER, scanPass: 1 });

    const stagedFile = path.join(started.stagingRoot, DOC_IDEA);
    const staged = fs.readFileSync(stagedFile, 'utf8').replace('Original sentence', 'Original sentence');
    // Add a brand-new user entry — a real, detectable structural change.
    const withNewUser = staged.replace(/(## Users\n\n)/, '$1- **U-99** — A new user found during the scan.\n');
    fs.writeFileSync(stagedFile, withNewUser, 'utf8');

    const canonicalBefore = fs.readFileSync(service.docFile(DOC_IDEA), 'utf8');
    const result = service.finishScanProposalRun(started.runId);

    expect(result.outcome).toBe('proposal-created');
    if (result.outcome !== 'proposal-created') throw new Error('unreachable');
    expect(result.proposal.origin).toBe('scan');
    expect(result.proposal.status).toBe('review');
    expect(result.proposal.requestedBy).toEqual(USER);
    expect(result.rejectedDocuments).toEqual([]);
    expect(result.proposal.groups.some((g) => g.affectedDocumentPaths.includes(DOC_IDEA))).toBe(true);

    // Canonical context is untouched — this is exactly what M5 replaces the old "agent writes docs live" behavior with.
    expect(fs.readFileSync(service.docFile(DOC_IDEA), 'utf8')).toBe(canonicalBefore);
    expect(canonicalBefore).not.toContain('U-99');

    // The staging area is cleaned up once ingested.
    expect(fs.existsSync(service.scanProposalRunDir(started.runId))).toBe(false);
  });

  it('reports "no-changes" and cleans up staging when the agent left the staged docs untouched', () => {
    const service = seeded();
    initGit(service.workspaceRoot);
    const started = service.startScanProposalRun({ actor: USER, scanPass: 1 });

    const result = service.finishScanProposalRun(started.runId);
    expect(result.outcome).toBe('no-changes');
    expect(fs.existsSync(service.scanProposalRunDir(started.runId))).toBe(false);
  });

  it('never blocks on a dirty source tree — dirty state is informational only, and canonical docs stay untouched regardless', () => {
    const service = seeded();
    initGit(service.workspaceRoot);
    fs.writeFileSync(path.join(service.workspaceRoot, 'src', 'app.ts'), 'export const version = 999; // dirty\n');

    const started = service.startScanProposalRun({ actor: USER, scanPass: 1 });
    expect(started.sourceSnapshot.git!.dirty).toBe(true);
    expect(started.sourceSnapshot.mode).toBe('head'); // still HEAD content, not the dirty edit
  });

  it('includeLocalWip switches to the working-tree reader', () => {
    const service = seeded();
    initGit(service.workspaceRoot);
    fs.writeFileSync(path.join(service.workspaceRoot, 'src', 'app.ts'), 'export const version = 2; // wip\n');

    const started = service.startScanProposalRun({ actor: USER, scanPass: 1, includeLocalWip: true });
    expect(started.sourceSnapshot.mode).toBe('working-tree');
    expect(started.sourceSnapshot.files.some((f) => f.path === 'src/app.ts' && f.status === 'modified')).toBe(true);
  });

  it('falls back to the filesystem reader (with a warning) when the workspace is not a Git repository', () => {
    const service = seeded();
    const started = service.startScanProposalRun({ actor: USER, scanPass: 1 });
    expect(started.sourceSnapshot.mode).toBe('filesystem');
    expect(started.warnings.some((w) => w.includes('not under Git version control'))).toBe(true);
  });

  it('discardScanProposalRun removes the staging copy without creating a proposal', () => {
    const service = seeded();
    initGit(service.workspaceRoot);
    const started = service.startScanProposalRun({ actor: USER, scanPass: 1 });
    expect(fs.existsSync(started.stagingRoot)).toBe(true);

    service.discardScanProposalRun(started.runId);
    expect(fs.existsSync(service.scanProposalRunDir(started.runId))).toBe(false);
  });

  it('leaves every legacy Keep/Revert scan method fully functional and untouched (no cross-talk between the two flows)', () => {
    const service = seeded();
    initGit(service.workspaceRoot);
    const { run } = service.startRun('idea', { kind: 'scan', scanPass: 1 });
    const finished = service.finishRun(run.id);
    expect(finished.run.status).toBe('review');
    service.keepRun(run.id);
    expect(service.require().runs.find((r) => r.id === run.id)?.status).toBe('kept');
  });
});
