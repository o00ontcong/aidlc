import * as fs from 'fs';
import * as yaml from 'js-yaml';

import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import { normalizeStep } from '../schema/WorkspaceSchema';
import {
  BundleBindingSchema,
  InstalledAssetsManifestSchema,
  ContextManifestSchema,
  type BundleBinding,
  type InstalledAssetsManifest,
} from './contracts';
import { COFOFO_BUNDLE_BINDING_PATH } from './BundleBinding';
import { hashFile } from './hash';
import { resolveInside } from './paths';

export type CofofoDoctorIssueKind =
  | 'workspace-not-composed'
  | 'skill-not-installed'
  | 'workspace-skill-unbound'
  | 'binding-hash-stale'
  | 'binding-missing'
  | 'agent-skill-unbound'
  | 'step-skill-unbound';

export interface CofofoDoctorIssue {
  kind: CofofoDoctorIssueKind;
  skillId?: string;
  detail: string;
  userMessageVi: string;
}

function readJsonFile<T>(root: string, relative: string, parser: (value: unknown) => T): T | null {
  try {
    const absolute = resolveInside(root, relative, true);
    return parser(JSON.parse(fs.readFileSync(absolute, 'utf8')));
  } catch {
    return null;
  }
}

function loadWorkspace(root: string): WorkspaceConfig | null {
  try {
    const absolute = resolveInside(root, '.aidlc/workspace.yaml', true);
    return yaml.load(fs.readFileSync(absolute, 'utf8')) as WorkspaceConfig;
  } catch {
    return null;
  }
}

function skillNotInstalledIssue(skillId: string): CofofoDoctorIssue {
  return {
    kind: 'skill-not-installed',
    skillId,
    detail: `workspace skill "${skillId}" is not listed in INSTALLED-ASSETS.json`,
    userMessageVi: `Skill \`${skillId}\` trong workspace không có trong INSTALLED-ASSETS — republish hoặc repin.`,
  };
}

function workspaceNotComposedIssue(): CofofoDoctorIssue {
  return {
    kind: 'workspace-not-composed',
    detail: 'ECC assets are installed but workspace.yaml was not composed from BUNDLE-BINDING.json',
    userMessageVi: 'Workspace chưa được soạn từ bundle — chạy publish-context sau install.',
  };
}

function collectEccSkillIssues(
  workspace: WorkspaceConfig,
  binding: BundleBinding,
  installedIds: Set<string>,
): CofofoDoctorIssue[] {
  const boundIds = new Set(binding.skills.map((skill) => skill.id));
  const issues: CofofoDoctorIssue[] = [];

  for (const skill of workspace.skills) {
    if (!skill.id.startsWith('ecc-')) continue;
    if (!installedIds.has(skill.id)) issues.push(skillNotInstalledIssue(skill.id));
    else if (!boundIds.has(skill.id)) {
      issues.push({
        kind: 'workspace-skill-unbound',
        skillId: skill.id,
        detail: `workspace skill "${skill.id}" is not in BUNDLE-BINDING.json`,
        userMessageVi: `Skill \`${skill.id}\` trong workspace không khớp bundle binding — republish hoặc repin.`,
      });
    }
  }

  for (const agent of workspace.agents) {
    if (!agent.id.startsWith('cofofo-')) continue;
    const role = agent.id.slice('cofofo-'.length);
    const expected = new Set(binding.roles[role] ?? []);
    for (const skillId of agent.skills) {
      if (!skillId.startsWith('ecc-')) continue;
      if (!installedIds.has(skillId)) issues.push(skillNotInstalledIssue(skillId));
      else if (!expected.has(skillId)) {
        issues.push({
          kind: 'agent-skill-unbound',
          skillId,
          detail: `agent "${agent.id}" references unbound skill "${skillId}"`,
          userMessageVi: `Agent \`${agent.id}\` tham chiếu skill \`${skillId}\` không có trong bundle binding — republish hoặc repin.`,
        });
      }
    }
  }

  const delivery = workspace.pipelines.find((pipeline) => pipeline.id === 'cofofo-delivery');
  if (delivery) {
    for (const step of delivery.steps) {
      const norm = normalizeStep(step);
      const phase = norm.name;
      if (!phase) continue;
      const expected = new Set([`cofofo-${phase}`, ...(binding.phases[phase] ?? [])]);
      for (const skillId of norm.skills ?? []) {
        if (!skillId.startsWith('ecc-')) continue;
        if (!installedIds.has(skillId)) issues.push(skillNotInstalledIssue(skillId));
        else if (!expected.has(skillId)) {
          issues.push({
            kind: 'step-skill-unbound',
            skillId,
            detail: `cofofo-delivery step "${phase}" references unbound skill "${skillId}"`,
            userMessageVi: `Bước \`${phase}\` tham chiếu skill \`${skillId}\` không có trong bundle binding — republish hoặc repin.`,
          });
        }
      }
    }
  }

  return issues;
}

function workspaceMissingBindingSkills(workspace: WorkspaceConfig, binding: BundleBinding): boolean {
  const workspaceEcc = new Set<string>();
  for (const skill of workspace.skills) {
    if (skill.id.startsWith('ecc-')) workspaceEcc.add(skill.id);
  }
  for (const agent of workspace.agents) {
    if (!agent.id.startsWith('cofofo-')) continue;
    for (const skillId of agent.skills) {
      if (skillId.startsWith('ecc-')) workspaceEcc.add(skillId);
    }
  }
  return binding.skills.some((skill) => !workspaceEcc.has(skill.id));
}

/**
 * Diagnose workspace ↔ bundle binding drift. Used by `inspect()` and `aidlc cofofo doctor`.
 */
export function diagnoseCofofoBinding(workspaceRoot: string): CofofoDoctorIssue[] {
  const installed = readJsonFile(
    workspaceRoot,
    'docs/project/foundation/INSTALLED-ASSETS.json',
    (value) => InstalledAssetsManifestSchema.parse(value),
  );
  if (!installed) return [];

  const manifest = readJsonFile(
    workspaceRoot,
    'docs/project/foundation/CONTEXT-MANIFEST.json',
    (value) => ContextManifestSchema.parse(value),
  );
  const bindingPath = manifest?.schemaVersion === 2
    ? manifest.bindingPath
    : COFOFO_BUNDLE_BINDING_PATH;
  const binding = readJsonFile(workspaceRoot, bindingPath, (value) => BundleBindingSchema.parse(value));
  const workspace = loadWorkspace(workspaceRoot);
  if (!workspace) return [];

  const installedIds = new Set(installed.assets.map((asset) => asset.id));
  const issues: CofofoDoctorIssue[] = [];

  if (!binding) {
    const hasEcc = workspace.skills.some((skill) => skill.id.startsWith('ecc-'))
      || workspace.agents.some((agent) => agent.id.startsWith('cofofo-') && agent.skills.some((id) => id.startsWith('ecc-')));
    if (!hasEcc) issues.push(workspaceNotComposedIssue());
    return issues;
  }

  if (manifest?.schemaVersion === 2) {
    try {
      const absolute = resolveInside(workspaceRoot, manifest.bindingPath, true);
      if (hashFile(absolute) !== manifest.bindingHash) {
        issues.push({
          kind: 'binding-hash-stale',
          detail: `${manifest.bindingPath}: binding hash mismatch`,
          userMessageVi: 'BUNDLE-BINDING.json đã đổi sau khi publish — chạy lại publish-context và activate.',
        });
      }
    } catch {
      issues.push({
        kind: 'binding-missing',
        detail: `${manifest.bindingPath}: missing or invalid`,
        userMessageVi: 'Thiếu BUNDLE-BINDING.json — chạy publish-context sau install.',
      });
    }
  }

  if (workspaceMissingBindingSkills(workspace, binding)) {
    issues.push(workspaceNotComposedIssue());
  }

  issues.push(...collectEccSkillIssues(workspace, binding, installedIds));

  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}:${issue.skillId ?? issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Map doctor issues to inspect() issue strings (English, machine-friendly). */
export function doctorIssueDetails(issues: CofofoDoctorIssue[]): string[] {
  return issues.map((issue) => issue.detail);
}
