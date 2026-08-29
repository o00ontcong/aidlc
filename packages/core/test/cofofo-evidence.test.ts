import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CofofoEvidenceError,
  captureEvidence,
  detectStack,
  readEvidenceLedger,
  recordRedWaiver,
  requireAcceptedEvidence,
  verifyEvidenceLedger,
} from '../src';

const revisions = (changes: Partial<Record<'red' | 'green' | 'refactor' | 'verify', number>> = {}) => ({
  red: 1, green: 1, refactor: 1, verify: 1, ...changes,
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
if [ "$FAKE_SWIFT_MODE" = "red" ]; then
  echo "XCTAssertTrue failed - heat alert missing; token=super-secret-value-123456789"
  exit 1
fi
if [ "$FAKE_SWIFT_MODE" = "compile" ]; then
  echo "compile error: heat alert missing"
  exit 1
fi
echo "all tests passed"
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
  it('enforces RED oracle, order, redaction, hash chain, and tamper detection', () => {
    const profile = detectStack(root);
    process.env.FAKE_SWIFT_MODE = 'red';
    const red = captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-1', profile, stage: 'red',
      commandId: 'swift.test-targeted', target: 'testHeatAlert', expectedFailure: 'heat alert missing', stepRevision: 1, stageRevisions: revisions(),
    });
    expect(red.accepted).toBe(true);
    expect(red.outputPreview).not.toContain('super-secret-value');
    requireAcceptedEvidence(root, 'FEATURE-1', 'red', 1);
    expect(() => captureEvidence({ workspaceRoot: root, runId: 'FEATURE-1', profile, stage: 'verify', commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions() })).toThrow(CofofoEvidenceError);

    process.env.FAKE_SWIFT_MODE = 'green';
    const green = captureEvidence({ workspaceRoot: root, runId: 'FEATURE-1', profile, stage: 'green', commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions() });
    const refactor = captureEvidence({ workspaceRoot: root, runId: 'FEATURE-1', profile, stage: 'refactor', commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions() });
    const verify = captureEvidence({ workspaceRoot: root, runId: 'FEATURE-1', profile, stage: 'verify', commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions() });
    expect([green, refactor, verify].every((record) => record.accepted)).toBe(true);
    expect(readEvidenceLedger(root, 'FEATURE-1')).toHaveLength(4);
    expect(verifyEvidenceLedger(root, 'FEATURE-1')).toEqual([]);

    fs.appendFileSync(path.join(root, verify.logPath), 'tampered\n');
    expect(verifyEvidenceLedger(root, 'FEATURE-1')).toContain('record 4: log hash mismatch');
  });

  it('rejects a non-zero result caused by compilation instead of the expected assertion', () => {
    const profile = detectStack(root);
    process.env.FAKE_SWIFT_MODE = 'compile';
    const red = captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-2', profile, stage: 'red',
      commandId: 'swift.test-targeted', target: 'testHeatAlert', expectedFailure: 'heat alert missing', stepRevision: 1, stageRevisions: revisions(),
    });
    expect(red.accepted).toBe(false);
    expect(red.failureOracleMatched).toBe(false);
    expect(() => requireAcceptedEvidence(root, 'FEATURE-2', 'red', 1)).toThrow();
  });

  it('redacts secrets from both the waiver log and durable ledger record', () => {
    const record = recordRedWaiver({
      workspaceRoot: root,
      runId: 'FEATURE-WAIVER',
      reviewer: 'Human Reviewer',
      reason: 'Hardware-only failure',
      alternativeEvidence: 'device trace token=super-secret-value-123456789',
      stepRevision: 1,
      stageRevisions: revisions(),
    });
    expect(record.waiver?.alternativeEvidence).toContain('[REDACTED]');
    expect(JSON.stringify(readEvidenceLedger(root, 'FEATURE-WAIVER'))).not.toContain('super-secret-value');
  });

  it('replays evidence only for a reopened revision and invalidates old records', () => {
    const profile = detectStack(root);
    process.env.FAKE_SWIFT_MODE = 'red';
    captureEvidence({ workspaceRoot: root, runId: 'FEATURE-REPLAY', profile, stage: 'red', commandId: 'swift.test-targeted', target: 'testHeatAlert', expectedFailure: 'heat alert missing', stepRevision: 1, stageRevisions: revisions() });
    process.env.FAKE_SWIFT_MODE = 'green';
    captureEvidence({ workspaceRoot: root, runId: 'FEATURE-REPLAY', profile, stage: 'green', commandId: 'swift.test', stepRevision: 1, stageRevisions: revisions() });
    captureEvidence({ workspaceRoot: root, runId: 'FEATURE-REPLAY', profile, stage: 'green', commandId: 'swift.test', stepRevision: 2, stageRevisions: revisions({ green: 2 }) });
    requireAcceptedEvidence(root, 'FEATURE-REPLAY', 'green', 2);
    expect(() => requireAcceptedEvidence(root, 'FEATURE-REPLAY', 'green', 3)).toThrow(/revision 3/);
  });

  it('keeps a long alphabetic RED oracle intact while screening actual blobs', () => {
    const profile = detectStack(root);
    const oracle = 'thisisalonghumanreadableassertionnamewithoutbase64symbols';
    write('bin/swift', `#!/bin/sh\necho "${oracle}"\nexit 1\n`, 0o755);
    const record = captureEvidence({
      workspaceRoot: root, runId: 'FEATURE-ORACLE', profile, stage: 'red',
      commandId: 'swift.test-targeted', target: 'testHeatAlert', expectedFailure: oracle,
      stepRevision: 1, stageRevisions: revisions(),
    });
    expect(record.failureOracleMatched).toBe(true);
  });
});
