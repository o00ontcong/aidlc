import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveDiscoverCommitRoot } from '../src/v2/discoverCommitRoot';
import type { DiscoverScope } from '@aidlc/core';

const root = '/workspace/parent';

function scope(partial: Partial<DiscoverScope> & Pick<DiscoverScope, 'layout' | 'repos'>): DiscoverScope {
  return {
    excludes: [],
    declaredAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('resolveDiscoverCommitRoot', () => {
  it('uses the workspace root for a parent layout', () => {
    expect(resolveDiscoverCommitRoot(root, scope({
      layout: 'parent',
      repos: [{ path: 'app', kind: 'mobile', name: 'app' }, { path: 'api', kind: 'backend', name: 'api' }],
    }))).toBe(root);
  });

  it('uses the workspace root for parent layout even with one child', () => {
    expect(resolveDiscoverCommitRoot(root, scope({
      layout: 'parent',
      repos: [{ path: 'app mobile', kind: 'mobile', name: 'app mobile' }],
    }))).toBe(root);
  });

  it('uses the sole declared repo when there is only one', () => {
    expect(resolveDiscoverCommitRoot(root, scope({
      layout: 'single',
      repos: [{ path: '.', kind: 'app', name: 'parent' }],
    }))).toBe(root);
  });

  it('uses a nested path when single repo is not the workspace root', () => {
    expect(resolveDiscoverCommitRoot(root, scope({
      layout: 'single',
      repos: [{ path: 'packages/app', kind: 'frontend', name: 'app' }],
    }))).toBe(path.join(root, 'packages/app'));
  });

  it('falls back to the workspace root when scope is undeclared', () => {
    expect(resolveDiscoverCommitRoot(root, undefined)).toBe(root);
  });
});
