/** Pure form guards used by the Builder UI before it sends a typed command. */
export const REGISTRY_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isRegistryId(value: string): boolean {
  return REGISTRY_ID_PATTERN.test(value);
}

export function pipelineFormChecks(steps: readonly { humanReview: boolean }[]): { hasSteps: boolean; hasHumanReview: boolean } {
  return { hasSteps: steps.length > 0, hasHumanReview: steps.some((step) => step.humanReview) };
}
