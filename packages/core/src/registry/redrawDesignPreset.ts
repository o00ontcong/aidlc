/** Built-in project preset from IMPLEMENT.md §2 step 7. */

import type { Agent, Pipeline, Skill } from '../contracts';
import { AgentStore } from './AgentStore';
import { PipelineStore } from './PipelineStore';
import { SkillStore } from './SkillStore';

export const REDRAW_DESIGN_SKILLS: readonly Skill[] = [
  { id: 'figma-to-ui', source: 'design', description: 'Translate Figma frames into implementation-ready UI.', body: 'Inspect the supplied Figma context, identify reusable components, and map tokens and constraints to the project UI.' },
  { id: 'image-to-ui', source: 'design', description: 'Derive UI structure from reference images.', body: 'Analyze visual hierarchy, spacing, typography, colors, and responsive behavior before implementing the reference.' },
  { id: 'design-system', source: 'design', description: 'Apply the project design system consistently.', body: 'Reuse established tokens and components. Document any necessary extension before introducing one-off styling.' },
  { id: 'responsive-layout', source: 'design', description: 'Build responsive layouts that preserve design intent.', body: 'Implement responsive behavior across the project breakpoints and verify dense, narrow, and wide layouts.' },
  { id: 'visual-review', source: 'design', description: 'Review rendered UI against its visual reference.', body: 'Compare the implementation with the reference, record visible differences, and propose focused corrections.' },
];

export const REDRAW_DESIGN_AGENT: Agent = {
  id: 'design-recreator',
  name: 'Design Recreator',
  description: 'Dựng lại UI từ Figma/ảnh tham chiếu',
  model: 'claude-opus-4',
  tier: 'deep',
  skills: ['figma-to-ui', 'design-system', 'responsive-layout'],
  capabilities: ['figma', 'files', 'github', 'web'],
};

export const REDRAW_DESIGN_PIPELINE: Pipeline = {
  id: 'redraw-design',
  source: 'project',
  version: '1.0.0',
  steps: [
    { id: 'design-analyzer', agent: 'design-recreator', skills: ['figma-to-ui', 'image-to-ui'], outputs: ['DESIGN-ANALYSIS.md'], autoReview: true, humanReview: false },
    { id: 'design-recreator', agent: 'design-recreator', skills: ['design-system', 'responsive-layout'], outputs: ['src/ui/**'], autoReview: false, humanReview: false },
    { id: 'visual-reviewer', agent: 'design-recreator', skills: ['visual-review'], outputs: ['VISUAL-DIFF.md'], autoReview: true, humanReview: false },
    { id: 'human-review', skills: [], outputs: [], autoReview: false, humanReview: true, onReject: { rerun: 'design-recreator', withFeedback: true } },
  ],
};

export interface ApplyRedrawDesignPresetResult {
  readonly skillsWritten: readonly string[];
  readonly agentWritten: boolean;
  /** Always project-scoped; PipelineStore never mutates a bundled source. */
  readonly pipelineWritten: boolean;
}

/**
 * Idempotently install the Redraw Design assets. Existing project/global
 * skills and agent are respected; the pipeline is written only on first
 * application, preserving a user's project-scoped edits on later applies.
 */
export function applyRedrawDesignPreset(workspaceRoot: string): ApplyRedrawDesignPresetResult {
  const skills = new SkillStore(workspaceRoot);
  const agents = new AgentStore(workspaceRoot);
  const pipelines = new PipelineStore(workspaceRoot);
  const skillsWritten: string[] = [];
  for (const skill of REDRAW_DESIGN_SKILLS) {
    if (!skills.exists(skill.id)) {
      skills.write(skill);
      skillsWritten.push(skill.id);
    }
  }
  let agentWritten = false;
  if (!agents.exists(REDRAW_DESIGN_AGENT.id)) {
    agents.write(REDRAW_DESIGN_AGENT);
    agentWritten = true;
  }
  let pipelineWritten = false;
  if (!pipelines.exists(REDRAW_DESIGN_PIPELINE.id)) {
    pipelines.write(REDRAW_DESIGN_PIPELINE);
    pipelineWritten = true;
  }
  return { skillsWritten, agentWritten, pipelineWritten };
}
