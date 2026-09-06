import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectPolicyStore } from '../src/context/ProjectPolicyStore';
import { DEFAULT_PROJECT_POLICY } from '../src/contracts/projectPolicy';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-project-policy-store-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('ProjectPolicyStore.load', () => {
  it('falls back to DEFAULT_PROJECT_POLICY, unchanged, when .aidlc/project-policy.yaml is missing', () => {
    const store = new ProjectPolicyStore(newRoot());
    expect(store.load()).toEqual(DEFAULT_PROJECT_POLICY);
  });

  it('parses an existing project-policy.yaml, overriding the defaults', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'project-policy.yaml'),
      ['schemaVersion: 1', 'contextReview:', '  approvalsRequired: 2', '  allowSelfApproval: true', '  conflictResolutionRole: lead', 'localFallback:', '  ownerIds:', '    - cong', ''].join('\n'),
      'utf8',
    );
    const store = new ProjectPolicyStore(root);
    expect(store.load()).toEqual({
      schemaVersion: 1,
      contextReview: { approvalsRequired: 2, allowSelfApproval: true, conflictResolutionRole: 'lead' },
      localFallback: { ownerIds: ['cong'] },
    });
  });

  it('throws on a malformed project-policy.yaml rather than silently falling back to defaults', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc', 'project-policy.yaml'), ['schemaVersion: 1', 'contextReview:', '  approvalsRequired: "not-a-number"', ''].join('\n'), 'utf8');
    const store = new ProjectPolicyStore(root);
    expect(() => store.load()).toThrow(/Invalid \.aidlc\/project-policy\.yaml/);
  });
});
