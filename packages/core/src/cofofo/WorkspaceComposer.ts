import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import {
  collectWorkspaceRefIssues,
  normalizeStep,
  validateWorkspace,
} from '../schema/WorkspaceSchema';
import type { BundleBinding, InstalledAssetsManifest } from './contracts';
import { hashFile } from './hash';
import { resolveInside } from './paths';

export interface ComposeWorkspaceFromBundleArgs {
  workspaceRoot: string;
  skeleton: WorkspaceConfig;
  binding: BundleBinding;
  installed: InstalledAssetsManifest;
}

export class CofofoWorkspaceComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CofofoWorkspaceComposeError';
  }
}

function isCofofoId(id: string): boolean {
  return id.startsWith('cofofo-');
}

function isEccId(id: string): boolean {
  return id.startsWith('ecc-');
}

function validateBindingSkillHashes(workspaceRoot: string, binding: BundleBinding): void {
  for (const skill of binding.skills) {
    const absolute = resolveInside(workspaceRoot, skill.path, true);
    const onDisk = hashFile(absolute);
    if (onDisk !== skill.sha256) {
      throw new CofofoWorkspaceComposeError(
        `Skill "${skill.id}" hash mismatch: binding has ${skill.sha256}, disk has ${onDisk}.`,
      );
    }
  }
}

function mergeSkills(skeleton: WorkspaceConfig, binding: BundleBinding): WorkspaceConfig['skills'] {
  const byId = new Map<string, WorkspaceConfig['skills'][number]>();
  for (const skill of skeleton.skills) {
    if (!isEccId(skill.id)) byId.set(skill.id, skill);
  }
  for (const entry of binding.skills) {
    byId.set(entry.id, { id: entry.id, path: entry.path });
  }
  return [...byId.values()];
}

function mergeAgents(skeleton: WorkspaceConfig, binding: BundleBinding): WorkspaceConfig['agents'] {
  const preserved = skeleton.agents.filter((agent) => !isCofofoId(agent.id));
  const composed = skeleton.agents
    .filter((agent) => isCofofoId(agent.id))
    .map((agent) => {
      const role = agent.id.slice('cofofo-'.length);
      const phaseSkills = agent.skills.filter((skillId) => isCofofoId(skillId));
      const bound = binding.roles[role] ?? [];
      return { ...agent, skills: [...phaseSkills, ...bound] };
    });
  return [...preserved, ...composed];
}

function mergePipelines(skeleton: WorkspaceConfig, binding: BundleBinding): WorkspaceConfig['pipelines'] {
  return skeleton.pipelines.map((pipeline) => {
    if (pipeline.id !== 'cofofo-delivery') return pipeline;
    return {
      ...pipeline,
      steps: pipeline.steps.map((step) => {
        const norm = normalizeStep(step);
        const phase = norm.name;
        if (!phase) return step;
        const bound = binding.phases[phase] ?? [];
        return { ...norm, skills: [`cofofo-${phase}`, ...bound] };
      }),
    };
  });
}

/**
 * Overlay bundle binding onto a CoFoFo workspace skeleton: merge ECC skill
 * registry entries, agent extras, and delivery step skills from the binding
 * artifact produced at publish time.
 */
export function composeWorkspaceFromBundle(args: ComposeWorkspaceFromBundleArgs): WorkspaceConfig {
  const { workspaceRoot, skeleton, binding } = args;
  validateBindingSkillHashes(workspaceRoot, binding);

  const merged: WorkspaceConfig = {
    ...skeleton,
    skills: mergeSkills(skeleton, binding),
    agents: mergeAgents(skeleton, binding),
    pipelines: mergePipelines(skeleton, binding),
  };

  const validated = validateWorkspace(merged, '.aidlc/workspace.yaml');
  const refIssues = collectWorkspaceRefIssues(validated);
  if (refIssues.length) {
    throw new CofofoWorkspaceComposeError(
      `Composed workspace has unresolved references:\n${refIssues.map((issue) => issue.message).join('\n')}`,
    );
  }
  return validated;
}
