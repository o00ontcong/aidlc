export interface AutonomousPipelineLike {
  id: string;
  steps: unknown[];
}

export const REQUIRED_AUTONOMOUS_PIPELINES = [
  { id: 'project-context', steps: 7 },
  { id: 'cohesive-feature', steps: 14 },
  { id: 'cohesive-work-package', steps: 7 },
] as const;

export function autonomousDeliveryReadiness(pipelines: AutonomousPipelineLike[]): {
  ready: boolean;
  missingOrOutdated: string[];
} {
  const missingOrOutdated = REQUIRED_AUTONOMOUS_PIPELINES.flatMap((required) => {
    const pipeline = pipelines.find((item) => item.id === required.id);
    if (!pipeline) return [`${required.id} (missing)`];
    if (pipeline.steps.length < required.steps) {
      return [`${required.id} (${pipeline.steps.length}/${required.steps} steps)`];
    }
    return [];
  });
  return { ready: missingOrOutdated.length === 0, missingOrOutdated };
}
