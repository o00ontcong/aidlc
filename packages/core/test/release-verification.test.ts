import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { createDefaultAutonomyPolicy } from '../src/contracts';
import {
  RunCancellationRegistry,
  benchmarkNonBlocking,
  redactSecrets,
  isolateProviderEnvironment,
  verifyCoreReleasePolicy,
  verifyExternalCommunicationMatrix,
  verifyParallelArtifactIsolation,
  verifyWorkspacePath,
} from '../src/release/ReleaseVerification';

describe('release verification', () => {
  it('keeps every external communication type behind an unattended hard gate', () => {
    const matrix = verifyExternalCommunicationMatrix();
    expect(matrix.map((entry) => entry.kind)).toEqual(['pull-request', 'issue', 'comment', 'email-chat', 'release-announcement', 'publish-package']);
    expect(matrix.every((entry) => entry.requiresApproval && entry.hard)).toBe(true);
    expect(verifyCoreReleasePolicy(createDefaultAutonomyPolicy()).every((check) => check.ok)).toBe(true);
  });

  it('redacts secrets before a durable payload can be written', () => {
    expect(redactSecrets({ apiToken: 'top-secret', nested: 'Bearer abcdefghijklmnop', safe: 'hello' })).toEqual({ apiToken: '[REDACTED]', nested: '[REDACTED]', safe: 'hello' });
  });

  it('does not leak unrelated host credentials to a model provider subprocess', () => {
    expect(isolateProviderEnvironment({ ANTHROPIC_AUTH_TOKEN: 'allowed', AWS_SECRET_ACCESS_KEY: 'not-allowed', EMPTY: undefined }, ['ANTHROPIC_AUTH_TOKEN'])).toEqual({ ANTHROPIC_AUTH_TOKEN: 'allowed' });
  });

  it('rejects traversal and escaping symlinks', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-release-path-'));
    expect(verifyWorkspacePath(root, '../outside').ok).toBe(false);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-release-outside-'));
    fs.symlinkSync(outside, path.join(root, 'escape'));
    expect(verifyWorkspacePath(root, 'escape/file.txt').ok).toBe(false);
    expect(verifyWorkspacePath(root, '.aidlc/new/file.json').ok).toBe(true);
  });

  it('rejects parallel subruns targeting the same artifact', () => {
    expect(verifyParallelArtifactIsolation([{ subrunId: 'a', path: 'docs/EPIC-1/REPORT.md' }, { subrunId: 'b', path: 'docs/EPIC-1/REPORT.md' }]).ok).toBe(false);
    expect(verifyParallelArtifactIsolation([{ subrunId: 'a', path: 'docs/EPIC-1/A.md' }, { subrunId: 'b', path: 'docs/EPIC-1/B.md' }]).ok).toBe(true);
  });

  it('cleans up cancelled runs and measures non-blocking analysis', async () => {
    const registry = new RunCancellationRegistry();
    const signal = registry.begin('RUN-1');
    expect(registry.cancel('RUN-1')).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(registry.activeIds()).toEqual([]);
    const result = await benchmarkNonBlocking(() => 'facts', 100);
    expect(result.value).toBe('facts');
    expect(result.withinBudget).toBe(true);
  });
});
