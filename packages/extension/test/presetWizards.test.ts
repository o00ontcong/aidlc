import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `mergePresetIntoYaml` is pure (no vscode API), but it lives in a module
// that also has command-wizard functions which import `vscode` at the top
// level — stub it so this file can import the module under plain Node.
vi.mock('vscode', () => ({}));

import { mergePresetIntoYaml } from '../src/v2/presetWizards';
import { readYaml } from '../src/v2/yamlIO';
import type { WorkspacePreset } from '../src/v2/presetStore';

/**
 * `mergePresetIntoYaml` copies a preset's pipeline `produces`/`requires`
 * verbatim into workspace.yaml — including whatever epics-root prefix the
 * preset happens to bake in (built-in presets bake the conventional
 * `docs/epics`, see core's presets/builtinWorkflows.ts). It must never try to
 * "fix up" that literal against the workspace's current `state.root`: the
 * literal is resolved dynamically wherever it's read (gate-check, artifact
 * listing — see `resolveArtifactPath` in `@aidlc/core`), and baking a
 * resolved path here would just create a second, competing source of truth
 * that goes stale the next time `state.root` changes.
 */
describe('mergePresetIntoYaml with a non-default state.root', () => {
  let root: string;

  const preset: WorkspacePreset = {
    formatVersion: 1,
    id: 'test-preset',
    name: 'Test preset',
    description: '',
    savedAt: '2026-08-01T00:00:00.000Z',
    workspace: {
      version: '1.0',
      agents: [{ id: 'aidlc-spike', name: 'Spike' }],
      skills: [],
      environment: {},
      slash_commands: [{ name: '/feature-spike-package-mission', agent: 'aidlc-spike' }],
      pipelines: [
        {
          id: 'feature-spike',
          steps: [
            {
              agent: 'aidlc-spike',
              name: 'package-mission',
              produces: ['docs/epics/{epic}/artifacts/MISSION.md'],
              requires: [],
            },
          ],
        },
      ],
    },
    skillContents: {},
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-preset-merge-'));
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'workspace.yaml'),
      JSON.stringify({
        version: '1.0',
        name: 'W',
        // Already switched away from the default before applying the preset.
        state: { root: '.aidlc/epics' },
        agents: [],
        skills: [],
        environment: {},
        slash_commands: [],
        pipelines: [],
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('leaves state.root untouched and copies produces/requires as-is (unresolved templates)', () => {
    const doc = readYaml(root)!;
    const report = mergePresetIntoYaml(root, doc, preset);

    expect(report.addedPipelines).toEqual(['feature-spike']);
    expect(doc.state?.root).toBe('.aidlc/epics');
    const mergedStep = (doc.pipelines[0] as { steps: Array<Record<string, unknown>> }).steps[0];
    expect(mergedStep.produces).toEqual(['docs/epics/{epic}/artifacts/MISSION.md']);

    // Persisted correctly too — a fresh read sees the same thing.
    const reloaded = readYaml(root)!;
    expect(reloaded.state?.root).toBe('.aidlc/epics');
    expect((reloaded.pipelines[0] as { steps: Array<Record<string, unknown>> }).steps[0].produces).toEqual([
      'docs/epics/{epic}/artifacts/MISSION.md',
    ]);
  });
});
