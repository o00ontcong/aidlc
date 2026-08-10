/**
 * `validate()` for the Skill/Agent/Pipeline registry (IMPLEMENT.md §2 step 2):
 * exactly the 4 error types the Builder form surfaces —
 *   1. duplicate id
 *   2. a pipeline step (or agent) references a skill that doesn't exist
 *   3. a pipeline step references an agent that doesn't exist
 *   4. a pipeline has no step with `humanReview: true`
 */

import type { Pipeline, RegistryIssue } from '../contracts';
import type { AgentStore } from './AgentStore';
import type { SkillStore } from './SkillStore';
import type { PipelineStore } from './PipelineStore';

export class RegistryValidator {
  constructor(
    private readonly agents: AgentStore,
    private readonly skills: SkillStore,
    private readonly pipelines: PipelineStore,
  ) {}

  /** Error type 1 — call before writing a new (not-yet-existing) entity under `id`. */
  checkDuplicateId(kind: 'agent' | 'skill' | 'pipeline', id: string): RegistryIssue | null {
    const store = kind === 'agent' ? this.agents : kind === 'skill' ? this.skills : this.pipelines;
    if (!store.exists(id)) return null;
    return { kind: 'duplicate-id', entity: `${kind}:${id}`, ref: id, message: `${kind} id "${id}" already exists.` };
  }

  /** Error types 2–4 — checked against everything a pipeline references. */
  validatePipeline(pipeline: Pipeline): RegistryIssue[] {
    const issues: RegistryIssue[] = [];
    const entity = `pipeline:${pipeline.id}`;

    for (const step of pipeline.steps) {
      if (step.agent && !this.agents.exists(step.agent)) {
        issues.push({
          kind: 'missing-agent',
          entity,
          stepId: step.id,
          ref: step.agent,
          message: `Step "${step.id}" references agent "${step.agent}", which doesn't exist.`,
        });
      }
      for (const skillId of step.skills) {
        if (!this.skills.exists(skillId)) {
          issues.push({
            kind: 'missing-skill',
            entity,
            stepId: step.id,
            ref: skillId,
            message: `Step "${step.id}" references skill "${skillId}", which doesn't exist.`,
          });
        }
      }
    }

    if (!pipeline.steps.some((step) => step.humanReview)) {
      issues.push({
        kind: 'no-human-review-step',
        entity,
        message: `Pipeline "${pipeline.id}" has no step with humanReview: true.`,
      });
    }

    return issues;
  }

  /** Runs {@link validatePipeline} over every pipeline currently in the store. */
  validateAll(): RegistryIssue[] {
    return this.pipelines.list().flatMap((pipeline) => this.validatePipeline(pipeline));
  }
}
