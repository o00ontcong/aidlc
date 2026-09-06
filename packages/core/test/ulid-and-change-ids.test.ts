import { describe, it, expect } from 'vitest';

import {
  ULID_PATTERN,
  generateUlid,
  isUlid,
  toUlid,
  ulidTimeMs,
  CHANGE_ID_PATTERN,
  isChangeId,
  toChangeId,
  ChangeIdSchema,
  generateChangeId,
  CONTEXT_REVISION_ID_PATTERN,
  isContextRevisionId,
  ContextRevisionIdSchema,
  generateContextRevisionId,
  CONTEXT_PROPOSAL_ID_PATTERN,
  isContextProposalId,
  ContextProposalIdSchema,
  generateContextProposalId,
  SCOPE_ANALYSIS_ID_PATTERN,
  isScopeAnalysisId,
  ScopeAnalysisIdSchema,
  generateScopeAnalysisId,
  EXTERNAL_REF_ID_PATTERN,
  isExternalRefId,
  ExternalRefIdSchema,
  generateExternalRefId,
  CONTEXT_GROUP_ID_PATTERN,
  isContextGroupId,
  generateContextGroupId,
  CONTEXT_OPERATION_ID_PATTERN,
  isContextOperationId,
  generateContextOperationId,
  APPROVAL_ID_PATTERN,
  isApprovalId,
  generateApprovalId,
  TRANSACTION_ID_PATTERN,
  isTransactionId,
  generateTransactionId,
  DOMAIN_EVENT_ID_PATTERN,
  isDomainEventId,
  generateDomainEventId,
  PROJECT_ID_PATTERN,
  isProjectId,
  generateProjectId,
  LIFECYCLE_RUN_ID_PATTERN,
  isLifecycleRunId,
  generateLifecycleRunId,
  EPIC_ID_PATTERN,
  epicIdFromChangeId,
} from '../src/contracts/ids';

describe('ULID', () => {
  it('generates a 26-char Crockford-base32 string matching the exported pattern', () => {
    const ulid = generateUlid();
    expect(ulid).toHaveLength(26);
    expect(ULID_PATTERN.test(ulid)).toBe(true);
    expect(isUlid(ulid)).toBe(true);
  });

  it('rejects malformed values, including the excluded Crockford letters I/L/O/U', () => {
    expect(isUlid('not-a-ulid')).toBe(false);
    expect(isUlid('0'.repeat(25))).toBe(false); // too short
    expect(isUlid('0'.repeat(27))).toBe(false); // too long
    expect(isUlid(`I${'0'.repeat(25)}`)).toBe(false);
    expect(isUlid(`L${'0'.repeat(25)}`)).toBe(false);
    expect(isUlid(`O${'0'.repeat(25)}`)).toBe(false);
    expect(isUlid(`U${'0'.repeat(25)}`)).toBe(false);
    expect(isUlid(`8${'0'.repeat(25)}`)).toBe(false); // first char must be 0-7 (48-bit timestamp bound)
    expect(() => toUlid('bogus')).toThrow(/Invalid ULID/);
  });

  it('is monotonic within the same millisecond instead of colliding', () => {
    const now = 1_700_000_000_000;
    const first = generateUlid(now);
    const second = generateUlid(now);
    const third = generateUlid(now);
    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
    // Same timestamp prefix (first 10 chars) for all three, since only the random tail advanced.
    expect(second.slice(0, 10)).toBe(first.slice(0, 10));
    expect(third.slice(0, 10)).toBe(first.slice(0, 10));
  });

  it('sorts lexicographically by generation time across different milliseconds', () => {
    const earlier = generateUlid(1_700_000_000_000);
    const later = generateUlid(1_700_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it('round-trips the encoded timestamp (diagnostics only — never for business ordering, §18.2)', () => {
    const now = 1_700_000_012_345;
    const ulid = generateUlid(now);
    expect(ulidTimeMs(ulid)).toBe(now);
  });

  it('never collides across a large batch generated in a tight loop', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i += 1) {
      const ulid = generateUlid();
      expect(seen.has(ulid)).toBe(false);
      seen.add(ulid);
    }
  });
});

describe('ChangeId', () => {
  it('matches CHG-<ULID> and round-trips through the schema', () => {
    const id = generateChangeId();
    expect(CHANGE_ID_PATTERN.test(id)).toBe(true);
    expect(isChangeId(id)).toBe(true);
    expect(ChangeIdSchema.parse(id)).toBe(id);
  });

  it('rejects a legacy WORK-* id and a malformed ULID body', () => {
    expect(isChangeId('WORK-ADD-ALERTS')).toBe(false);
    expect(isChangeId('CHG-not-a-ulid')).toBe(false);
    expect(ChangeIdSchema.safeParse('CHG-short').success).toBe(false);
    expect(() => toChangeId('bogus')).toThrow(/Invalid ChangeId/);
  });

  it('generateChangeId never collides across a large batch (§D16 — no max+1 counter)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) {
      const id = generateChangeId();
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});

describe('Context/Analysis/ExternalRef ids', () => {
  it('ContextRevisionId matches CTX-<ULID>', () => {
    const id = generateContextRevisionId();
    expect(CONTEXT_REVISION_ID_PATTERN.test(id)).toBe(true);
    expect(isContextRevisionId(id)).toBe(true);
    expect(ContextRevisionIdSchema.parse(id)).toBe(id);
    expect(ContextRevisionIdSchema.safeParse('CTX-bogus').success).toBe(false);
  });

  it('ContextProposalId matches CP-<ULID>', () => {
    const id = generateContextProposalId();
    expect(CONTEXT_PROPOSAL_ID_PATTERN.test(id)).toBe(true);
    expect(isContextProposalId(id)).toBe(true);
    expect(ContextProposalIdSchema.parse(id)).toBe(id);
    expect(ContextProposalIdSchema.safeParse('CP-bogus').success).toBe(false);
  });

  it('ScopeAnalysisId matches ANL-<ULID>', () => {
    const id = generateScopeAnalysisId();
    expect(SCOPE_ANALYSIS_ID_PATTERN.test(id)).toBe(true);
    expect(isScopeAnalysisId(id)).toBe(true);
    expect(ScopeAnalysisIdSchema.parse(id)).toBe(id);
    expect(ScopeAnalysisIdSchema.safeParse('ANL-bogus').success).toBe(false);
  });

  it('ExternalRefId matches XREF-<ULID>', () => {
    const id = generateExternalRefId();
    expect(EXTERNAL_REF_ID_PATTERN.test(id)).toBe(true);
    expect(isExternalRefId(id)).toBe(true);
    expect(ExternalRefIdSchema.parse(id)).toBe(id);
    expect(ExternalRefIdSchema.safeParse('XREF-bogus').success).toBe(false);
  });

  it('ContextGroupId matches GRP-<ULID>', () => {
    const id = generateContextGroupId();
    expect(CONTEXT_GROUP_ID_PATTERN.test(id)).toBe(true);
    expect(isContextGroupId(id)).toBe(true);
  });

  it('ContextOperationId matches OP-<ULID>', () => {
    const id = generateContextOperationId();
    expect(CONTEXT_OPERATION_ID_PATTERN.test(id)).toBe(true);
    expect(isContextOperationId(id)).toBe(true);
  });

  it('ApprovalId matches APR-<ULID>', () => {
    const id = generateApprovalId();
    expect(APPROVAL_ID_PATTERN.test(id)).toBe(true);
    expect(isApprovalId(id)).toBe(true);
  });

  it('TransactionId matches TXN-<ULID>', () => {
    const id = generateTransactionId();
    expect(TRANSACTION_ID_PATTERN.test(id)).toBe(true);
    expect(isTransactionId(id)).toBe(true);
  });

  it('DomainEventId matches EVT-<ULID> and is a distinct brand from the legacy pipeline EventId', () => {
    const id = generateDomainEventId();
    expect(DOMAIN_EVENT_ID_PATTERN.test(id)).toBe(true);
    expect(isDomainEventId(id)).toBe(true);
    // Legacy EventId is `<EpicId>--run-<seq>--evt-<seq>`; the two formats never collide.
    expect(id).not.toMatch(/--evt-/);
  });

  it('ProjectId matches PRJ-<ULID>', () => {
    const id = generateProjectId();
    expect(PROJECT_ID_PATTERN.test(id)).toBe(true);
    expect(isProjectId(id)).toBe(true);
  });
});

describe('Epic/Run ids for the new lifecycle (§18.3)', () => {
  it('epicIdFromChangeId reuses the Change ULID suffix and still satisfies the legacy EpicId pattern', () => {
    const changeId = generateChangeId();
    const epicId = epicIdFromChangeId(changeId);
    expect(epicId).toBe(`EPIC-${changeId.slice('CHG-'.length)}`);
    expect(EPIC_ID_PATTERN.test(epicId)).toBe(true);
  });

  it('epicIdFromChangeId never collides across a large batch of distinct Changes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) {
      const epicId = epicIdFromChangeId(generateChangeId());
      expect(seen.has(epicId)).toBe(false);
      seen.add(epicId);
    }
  });

  it('legacy numeric and slug EpicId forms still parse under the unchanged legacy pattern', () => {
    expect(EPIC_ID_PATTERN.test('EPIC-001')).toBe(true);
    expect(EPIC_ID_PATTERN.test('EPIC-2100')).toBe(true);
    expect(EPIC_ID_PATTERN.test('EPIC-ADD-PORTFOLIO-ALERTS')).toBe(true);
  });

  it('LifecycleRunId matches RUN-<ULID> and is a distinct brand from the legacy pipeline RunId', () => {
    const id = generateLifecycleRunId();
    expect(LIFECYCLE_RUN_ID_PATTERN.test(id)).toBe(true);
    expect(isLifecycleRunId(id)).toBe(true);
    // Legacy RunId is `<EpicId>--run-<seq>`; the two formats never collide.
    expect(id).not.toMatch(/--run-/);
  });
});
