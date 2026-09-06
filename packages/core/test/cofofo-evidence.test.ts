import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CofofoEvidenceError,
  captureEvidence,
  detectStack,
  hashObject,
  readEvidenceLedger,
  requireAcceptedEvidence,
  sha256,
  verifyEvidenceLedger,
} from '../src';

const revisions = (changes: Partial<Record<'verify', number>> = {}) => ({
  verify: 1, ...changes,
});

let root: string;
let oldPath: string | undefined;

function write(relative: string, content: string, mode?: number): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
  if (mode) fs.chmodSync(absolute, mode);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-evidence-'));
  write('src/Package.swift', '// swift-tools-version: 5.9\n');
  write('bin/swift', `#!/bin/sh
if [ "$FAKE_SWIFT_MODE" = "fail" ]; then
  echo "XCTAssertTrue failed - heat alert missing; token=super-secret-value-123456789"
  exit 1
fi
echo "all tests passed; token=super-secret-value-123456789"
exit 0
`, 0o755);
  oldPath = process.env.PATH;
  process.env.PATH = `${path.join(root, 'bin')}:${oldPath ?? ''}`;
});

afterEach(() => {
  process.env.PATH = oldPath;
  delete process.env.FAKE_SWIFT_MODE;
});

describe('CoFoFo evidence ledger', () => {
  it('accepts VERIFY, redacts secrets, and detects tampered logs', () => {
    const profile = detectStack(root);
    const verify = captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-1', profile, stage: 'verify',
      commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions(),
    });
    expect(verify.accepted).toBe(true);
    expect(verify.outputPreview).not.toContain('super-secret-value');
    requireAcceptedEvidence(root, 'FEATURE-1', 'verify', 1);
    expect(readEvidenceLedger(root, 'FEATURE-1')).toHaveLength(1);
    expect(verifyEvidenceLedger(root, 'FEATURE-1')).toEqual([]);

    fs.appendFileSync(path.join(root, verify.logPath), 'tampered\n');
    expect(verifyEvidenceLedger(root, 'FEATURE-1')).toContain('record 1: log hash mismatch');
  });

  it('rejects a failing test command as VERIFY evidence', () => {
    const profile = detectStack(root);
    process.env.FAKE_SWIFT_MODE = 'fail';
    const record = captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-2', profile, stage: 'verify',
      commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions(),
    });
    expect(record.accepted).toBe(false);
    expect(() => requireAcceptedEvidence(root, 'FEATURE-2', 'verify', 1)).toThrow();
  });

  it('replays evidence only for a reopened revision and invalidates old records', () => {
    const profile = detectStack(root);
    captureEvidence({ workspaceRoot: root, runId: 'FEATURE-REPLAY', profile, stage: 'verify', commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions() });
    captureEvidence({ workspaceRoot: root, runId: 'FEATURE-REPLAY', profile, stage: 'verify', commandId: 'swift.test', stepRevision: 2, stageRevisions: revisions({ verify: 2 }) });
    requireAcceptedEvidence(root, 'FEATURE-REPLAY', 'verify', 2);
    expect(() => requireAcceptedEvidence(root, 'FEATURE-REPLAY', 'verify', 3)).toThrow(/revision 3/);
  });

  it('keeps a long alphabetic test name intact while screening actual blobs', () => {
    const profile = detectStack(root);
    const name = 'thisisalonghumanreadableassertionnamewithoutbase64symbols';
    write('bin/swift', `#!/bin/sh\necho "${name}"\necho " blob ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn+/=="\nexit 0\n`, 0o755);
    const record = captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-ORACLE', profile, stage: 'verify',
      commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions(),
    });
    expect(record.accepted).toBe(true);
    expect(record.outputPreview).toContain(name);
    expect(record.outputPreview).toContain('[REDACTED_BLOB]');
  });

  it('refuses a non-verify stage', () => {
    const profile = detectStack(root);
    expect(() => captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-STAGE', profile, stage: 'red' as never,
      commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions(),
    })).toThrow(CofofoEvidenceError);
  });

  it('reads a legacy RED-waiver ledger and still accepts a new VERIFY record', () => {
    const profile = detectStack(root);
    const log = 'Production trace: race only on device.\n';
    const logPath = '.aidlc/evidence/FEATURE-LEGACY/0001-red-waiver.log';
    write(logPath, log);
    const at = '2026-09-06T12:00:00.000Z';
    const draft = {
      schemaVersion: 2 as const,
      id: 'FEATURE-LEGACY-1-red-waiver',
      runId: 'FEATURE-LEGACY',
      sequence: 1,
      stage: 'red-waiver' as const,
      stepRevision: 1,
      args: [] as string[],
      startedAt: at,
      finishedAt: at,
      exitStatus: null,
      timedOut: false,
      accepted: true,
      waiver: {
        reviewer: 'On-call',
        reason: 'Hardware-only race',
        alternativeEvidence: 'device trace',
      },
      outputPreview: log,
      logPath,
      logHash: sha256(log),
    };
    write('.aidlc/evidence/FEATURE-LEGACY/ledger.jsonl', `${JSON.stringify({ ...draft, recordHash: hashObject(draft) })}\n`);

    expect(readEvidenceLedger(root, 'FEATURE-LEGACY')).toHaveLength(1);
    expect(() => requireAcceptedEvidence(root, 'FEATURE-LEGACY', 'verify', 1)).toThrow(/verify/);

    const verify = captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-LEGACY', profile, stage: 'verify',
      commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions(),
    });
    expect(verify.accepted).toBe(true);
    requireAcceptedEvidence(root, 'FEATURE-LEGACY', 'verify', 1);
    expect(readEvidenceLedger(root, 'FEATURE-LEGACY')).toHaveLength(2);
    expect(verifyEvidenceLedger(root, 'FEATURE-LEGACY')).toEqual([]);
  });
});
