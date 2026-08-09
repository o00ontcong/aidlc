import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  IsoTimestampSchema,
  isIsoTimestamp,
  nowIso,
  ActorRefSchema,
  formatActorRef,
  parseActorRefString,
  EvidenceRefSchema,
  formatEvidenceRef,
  ContractValidationError,
  parseContract,
} from '../src/contracts/common';

describe('IsoTimestamp', () => {
  it('accepts Z and +HH:MM offsets', () => {
    expect(isIsoTimestamp('2026-08-09T10:30:00Z')).toBe(true);
    expect(isIsoTimestamp('2026-08-09T10:30:00.123Z')).toBe(true);
    expect(isIsoTimestamp('2026-08-09T10:30:00+07:00')).toBe(true);
  });

  it('rejects a timestamp with no offset', () => {
    expect(isIsoTimestamp('2026-08-09T10:30:00')).toBe(false);
  });

  it('nowIso() always produces a value the schema accepts', () => {
    expect(IsoTimestampSchema.safeParse(nowIso()).success).toBe(true);
  });
});

describe('ActorRef — design doc §11 compact form ("actor: agent:senior-ios-developer")', () => {
  it('formatActorRef produces the documented compact form', () => {
    expect(formatActorRef({ kind: 'agent', id: 'senior-ios-developer' })).toBe('agent:senior-ios-developer');
  });

  it('parseActorRefString is the inverse of formatActorRef for the id portion', () => {
    const parsed = parseActorRefString('agent:senior-ios-developer');
    expect(parsed).toEqual({ kind: 'agent', id: 'senior-ios-developer' });
  });

  it('parseActorRefString throws on a malformed value', () => {
    expect(() => parseActorRefString('bogus')).toThrow(/Invalid actor reference/);
  });

  it('ActorRefSchema round-trips through JSON unchanged', () => {
    const original = { kind: 'user' as const, id: 'cong@silvertiger.ae', label: 'Cong' };
    expect(ActorRefSchema.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});

describe('EvidenceRef — design doc §11 compact form ("test:xcodebuild-test:passed")', () => {
  it('formatEvidenceRef includes status when present', () => {
    expect(formatEvidenceRef({ kind: 'test', ref: 'xcodebuild-test', status: 'passed' })).toBe(
      'test:xcodebuild-test:passed',
    );
  });

  it('formatEvidenceRef omits the trailing segment when status is absent', () => {
    expect(formatEvidenceRef({ kind: 'git-diff', ref: 'sha256:abc123' })).toBe('git-diff:sha256:abc123');
  });

  it('EvidenceRefSchema round-trips through JSON unchanged', () => {
    const original = { kind: 'file', ref: 'docs/epics/EPIC-001/plan.md', label: 'Execution plan' };
    expect(EvidenceRefSchema.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});

describe('parseContract / ContractValidationError — shared parse helper (mirrors WorkspaceValidationError)', () => {
  const TestSchema = z.object({ name: z.string().min(1) });

  it('returns the parsed value on success', () => {
    expect(parseContract(TestSchema, { name: 'ok' }, 'Test')).toEqual({ name: 'ok' });
  });

  it('throws a ContractValidationError carrying the contract name and zod issues on failure', () => {
    try {
      parseContract(TestSchema, { name: '' }, 'Test');
      expect.unreachable('parseContract should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContractValidationError);
      const cve = err as ContractValidationError;
      expect(cve.contract).toBe('Test');
      expect(cve.issues.length).toBeGreaterThan(0);
      expect(cve.message).toContain('[contract Test]');
    }
  });
});
