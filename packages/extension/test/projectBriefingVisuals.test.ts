import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PROJECT_BRIEFING_PATHS,
  readProjectContextBriefing,
} from '../src/v2/projectBriefingVisuals';

describe('readProjectContextBriefing', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates missing .mmd at docs/project/context/visualization and reads only that path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-project-briefing-'));
    roots.push(root);
    const context = path.join(root, 'docs', 'project', 'context');
    const viz = path.join(context, 'visualization');
    fs.mkdirSync(viz, { recursive: true });
    fs.writeFileSync(path.join(context, 'CONTEXT-REVIEW.md'), [
      '## Summary',
      'OXUPass is an enterprise auth platform.',
      '',
      '**Verdict:** GO',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(viz, 'PROJECT-ARCHITECTURE.json'), JSON.stringify({
      schemaVersion: 1,
      layers: [{ name: 'mobile' }, { name: 'backend' }],
      edges: [{ source: 'mobile', target: 'backend' }],
    }));
    fs.writeFileSync(path.join(viz, 'FEATURE-CATALOG.json'), JSON.stringify({
      schemaVersion: 1,
      features: [{ id: 'signin', name: 'Sign in' }],
    }));

    const briefing = readProjectContextBriefing(root);
    expect(briefing.summary).toContain('OXUPass is an enterprise auth platform');
    expect(briefing.flowMermaid).toContain('mobile');
    expect(briefing.impactMermaid).toContain('Sign in');
    expect(briefing.created).toEqual(expect.arrayContaining([
      PROJECT_BRIEFING_PATHS.architectureMmd,
      PROJECT_BRIEFING_PATHS.catalogMmd,
      PROJECT_BRIEFING_PATHS.screensMmd,
    ]));
    expect(fs.existsSync(path.join(root, PROJECT_BRIEFING_PATHS.architectureMmd))).toBe(true);
    expect(fs.existsSync(path.join(root, PROJECT_BRIEFING_PATHS.catalogMmd))).toBe(true);
    expect(fs.existsSync(path.join(root, PROJECT_BRIEFING_PATHS.screensMmd))).toBe(true);
  });
});
