import { describe, expect, it } from 'vitest';

import { checkMissionCompleteness } from '../src/mission/checkMissionCompleteness';
import { synthesizeMissionMarkdown } from '../src/mission/synthesizeMission';
import { syncFlowMermaidFromMission } from '../src/mission/assertImplementPackReady';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const COMPLETE = `# MISSION

## Summary
Checkout refunds.

## Problem / Goal
Users cannot refund.

## In scope
Partial refunds.

## Out of scope
Chargebacks.

## Functional requirements
- PAY-FR01 Serves: G-1

## Acceptance criteria
- Given a capture, when refund, then wallet updates.

## Constraints
INV-1: no shared contract rewrite.

## Tasks
- PAY-T01 Implements: PAY-FR01 AC: refund API \`src/refund.ts\`

## UI spec
N/A — no UI change

## Flow
\`\`\`mermaid
flowchart LR
  A[API] --> B[Refund]
\`\`\`

## Definition of done
AC pass on device.
`;

describe('checkMissionCompleteness', () => {
  it('accepts a full pack', () => {
    expect(checkMissionCompleteness(COMPLETE)).toEqual({ ok: true, missing: [] });
  });

  it('rejects Draft / missing headings', () => {
    const check = checkMissionCompleteness('## Summary\nHi\n\n**Status:** Draft\n');
    expect(check.ok).toBe(false);
    expect(check.missing.length).toBeGreaterThan(0);
  });

  it('rejects mermaid outside ## Flow and thin AC', () => {
    const noFlowHeading = COMPLETE.replace('## Flow\n', '## Notes\n');
    expect(checkMissionCompleteness(noFlowHeading).missing).toContain('Flow');

    const thinAc = COMPLETE.replace(
      '- Given a capture, when refund, then wallet updates.',
      '- Done.',
    );
    expect(checkMissionCompleteness(thinAc).missing.some((item) => item.includes('Acceptance criteria'))).toBe(true);
  });
});

describe('synthesizeMissionMarkdown', () => {
  it('folds SPEC into MISSION headings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-mission-'));
    fs.writeFileSync(path.join(dir, 'SPEC.md'), '## Summary\nHello\n\n## Acceptance criteria\nDone\n');
    const md = synthesizeMissionMarkdown(dir);
    expect(md).toContain('## Summary');
    expect(md).toContain('Hello');
    expect(md).toContain('## Tasks');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('syncFlowMermaidFromMission', () => {
  it('projects FEATURE-FLOW.mmd from MISSION ## Flow when missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-flow-sync-'));
    fs.writeFileSync(path.join(dir, 'MISSION.md'), COMPLETE);
    expect(syncFlowMermaidFromMission(dir)).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'FEATURE-FLOW.mmd'), 'utf8')).toContain('flowchart LR');
    expect(syncFlowMermaidFromMission(dir)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
