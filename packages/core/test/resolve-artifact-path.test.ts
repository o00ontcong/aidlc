import { describe, expect, it } from 'vitest';

import { DEFAULT_EPICS_DIR, resolveArtifactPath, rewriteEpicsRootPrefix } from '../src/runs/RunState';

describe('rewriteEpicsRootPrefix', () => {
  it('leaves the template untouched when the active dir is the default', () => {
    expect(rewriteEpicsRootPrefix('docs/epics/{epic}/artifacts/X.md', DEFAULT_EPICS_DIR)).toBe(
      'docs/epics/{epic}/artifacts/X.md',
    );
  });

  it('rewrites the conventional prefix to the active epics directory', () => {
    expect(rewriteEpicsRootPrefix('docs/epics/{epic}/artifacts/X.md', '.aidlc/epics')).toBe(
      '.aidlc/epics/{epic}/artifacts/X.md',
    );
  });

  it('rewrites an exact match with no trailing path', () => {
    expect(rewriteEpicsRootPrefix('docs/epics', '.aidlc/epics')).toBe('.aidlc/epics');
  });

  it('leaves a template that does not use the conventional prefix untouched', () => {
    expect(rewriteEpicsRootPrefix('docs/project/context/PRD.md', '.aidlc/epics')).toBe(
      'docs/project/context/PRD.md',
    );
  });

  it('does not rewrite a path that merely starts with the same characters (docs/epics-legacy)', () => {
    expect(rewriteEpicsRootPrefix('docs/epics-legacy/{epic}/X.md', '.aidlc/epics')).toBe(
      'docs/epics-legacy/{epic}/X.md',
    );
  });
});

describe('resolveArtifactPath', () => {
  it('rewrites the epics root then substitutes {key} placeholders', () => {
    const resolved = resolveArtifactPath(
      'docs/epics/{epic}/artifacts/MISSION.md',
      { epic: 'SPIKE-01' },
      '.aidlc/epics',
    );
    expect(resolved).toBe('.aidlc/epics/SPIKE-01/artifacts/MISSION.md');
  });

  it('defaults to the conventional root when epicsDir is omitted', () => {
    const resolved = resolveArtifactPath('docs/epics/{epic}/artifacts/MISSION.md', { epic: 'SPIKE-01' });
    expect(resolved).toBe('docs/epics/SPIKE-01/artifacts/MISSION.md');
  });
});
