import type { V3StageSummary } from '../contracts';

const statusTone: Record<V3StageSummary['status'], string> = {
  pending: 'border-border text-muted-foreground',
  running: 'border-primary bg-primary/10 text-primary',
  'waiting-for-user': 'border-amber-500 text-amber-700 dark:text-amber-300',
  blocked: 'border-destructive text-destructive',
  review: 'border-violet-500 text-violet-700 dark:text-violet-300',
  completed: 'border-emerald-500 text-emerald-700 dark:text-emerald-300',
};

export function StageTimeline({ stages, onStageClick }: { stages: readonly V3StageSummary[]; onStageClick?: (stage: V3StageSummary) => void }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="Epic stages">
      {stages.map((stage, index) => (
        <li key={stage.id}>
          <button
            type="button"
            onClick={() => onStageClick?.(stage)}
            className={`w-full rounded border px-2 py-2 text-left text-xs ${statusTone[stage.status]} ${onStageClick ? 'hover:bg-accent/50' : ''}`}
          >
            <span className="block text-[10px] uppercase opacity-70">{index + 1}</span>
            <span className="mt-0.5 block font-medium capitalize">{stage.id}</span>
            <span className="mt-0.5 block truncate text-[10px] opacity-80">{stage.status.replaceAll('-', ' ')}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
