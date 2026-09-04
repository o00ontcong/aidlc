/**
 * Extension-wide workflow defaults.
 *
 * CoFoFo is generated project-locally, so it does not live in the static
 * `BUILTIN_WORKFLOWS` preset array. Keep the product default explicit instead
 * of relying on array order (`BUILTIN_WORKFLOWS[0]`).
 */
export const DEFAULT_WORKFLOW_ID = 'cofofo-workflow';
export const DEFAULT_PIPELINE_ID = 'cofofo-feature';

export const DEFAULT_PIPELINE_ORDER = [
  'cofofo-feature',
  'cofofo-bugfix',
] as const;

/** Put the two CoFoFo delivery pipelines first without disturbing other rows. */
export function orderDefaultPipelines<T extends { id: string }>(pipelines: readonly T[]): T[] {
  const rank = new Map<string, number>(DEFAULT_PIPELINE_ORDER.map((id, index) => [id, index]));
  return pipelines
    .map((pipeline, index) => ({ pipeline, index }))
    .sort((a, b) => {
      const aRank = rank.get(a.pipeline.id) ?? DEFAULT_PIPELINE_ORDER.length;
      const bRank = rank.get(b.pipeline.id) ?? DEFAULT_PIPELINE_ORDER.length;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ pipeline }) => pipeline);
}

export function pickDefaultPipelineId(pipelines: readonly { id: string }[]): string {
  if (pipelines.some((pipeline) => pipeline.id === DEFAULT_PIPELINE_ID)) {
    return DEFAULT_PIPELINE_ID;
  }
  return orderDefaultPipelines(pipelines)[0]?.id ?? '';
}
