import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  archiveLegacyCohesiveAssets,
  isLegacyCohesiveAssetId,
  stripLegacyCohesiveEntries,
  summarizeLegacyCohesive,
} from '../src/v2/legacyWorkspaceCleanup';

describe('legacy Cohesive workspace cleanup', () => {
  it('removes retired entries while preserving current Project Workspace pipelines', () => {
    const doc: Record<string, unknown> = {
      agents: [
        { id: 'aidlc-cohesive-work-package-agent' },
        { id: 'aidlc-feature-implement-agent' },
      ],
      skills: [
        { id: 'aidlc-cohesive-work-package-workflow' },
        { id: 'aidlc-feature-implement-workflow' },
      ],
      pipelines: [
        { id: 'cohesive-work-package' },
        { id: 'project-context' },
        { id: 'feature-spike' },
        { id: 'feature-implement' },
      ],
      slash_commands: [
        { name: '/cohesive-work-package-load-package', agent: 'aidlc-cohesive-work-package-agent' },
        { name: '/feature-implement-implement', agent: 'aidlc-feature-implement-agent' },
      ],
      recipes: [
        { id: 'old', from: 'cohesive-feature' },
        { id: 'current', from: 'feature-implement' },
      ],
      cohesive_delivery: { execution_profiles: {} },
    };

    const removed = stripLegacyCohesiveEntries(doc);

    expect(removed).toMatchObject({ present: true, agents: 1, skills: 1, pipelines: 1, commands: 1, recipes: 1 });
    expect(summarizeLegacyCohesive(doc).present).toBe(false);
    expect((doc.pipelines as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'project-context', 'feature-spike', 'feature-implement',
    ]);
    expect(doc).not.toHaveProperty('cohesive_delivery');
  });

  it('recognizes legacy discovered assets so they never appear in the UI', () => {
    expect(isLegacyCohesiveAssetId('aidlc-cohesive-reviewer-agent')).toBe(true);
    expect(isLegacyCohesiveAssetId('cohesive-feature-agent')).toBe(true);
    expect(isLegacyCohesiveAssetId('cohesive-work-package')).toBe(true);
    expect(isLegacyCohesiveAssetId('aidlc-feature-implement-agent')).toBe(false);
  });

  it('archives retired project and global files under the workspace backup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-legacy-root-'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-legacy-home-'));
    const projectLock = path.join(root, '.aidlc', 'locks', 'cohesive-delivery.json');
    const providerCommand = path.join(root, '.claude', 'commands', 'aidlc-autonomous-delivery.md');
    const globalAgent = path.join(home, '.claude', 'agents', 'aidlc-cohesive-reviewer-agent.md');
    fs.mkdirSync(path.dirname(projectLock), { recursive: true });
    fs.mkdirSync(path.dirname(providerCommand), { recursive: true });
    fs.mkdirSync(path.dirname(globalAgent), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), 'version: "1.0"\n');
    fs.writeFileSync(projectLock, '{}\n');
    fs.writeFileSync(providerCommand, '# Retired\n');
    fs.writeFileSync(globalAgent, '# Retired\n');

    const report = archiveLegacyCohesiveAssets(root, home);

    expect(report.archivedPaths).toEqual(expect.arrayContaining([projectLock, providerCommand, globalAgent]));
    expect(fs.existsSync(projectLock)).toBe(false);
    expect(fs.existsSync(providerCommand)).toBe(false);
    expect(fs.existsSync(globalAgent)).toBe(false);
    expect(fs.existsSync(path.join(report.backupDir!, 'project', '.aidlc', 'locks', 'cohesive-delivery.json'))).toBe(true);
    expect(fs.existsSync(path.join(report.backupDir!, 'project', '.claude', 'commands', 'aidlc-autonomous-delivery.md'))).toBe(true);
    expect(fs.existsSync(path.join(report.backupDir!, 'global', '.claude', 'agents', 'aidlc-cohesive-reviewer-agent.md'))).toBe(true);
    expect(fs.existsSync(path.join(report.backupDir!, 'workspace.yaml.before-cleanup'))).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
});
