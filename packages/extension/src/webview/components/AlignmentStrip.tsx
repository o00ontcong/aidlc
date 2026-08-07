import { cn } from '@/lib/utils';
import type { EpicAlignment } from '@/lib/types';

interface Props {
  alignment?: EpicAlignment | null;
}

const BADGE: Record<NonNullable<EpicAlignment['status']>, { label: string; className: string }> = {
  aligned: {
    label: 'aligned',
    className: 'border-success/40 bg-success/10 text-success',
  },
  variance: {
    label: 'variance pending',
    className: 'border-warning/40 bg-warning/10 text-warning',
  },
  stale: {
    label: 'stale charter',
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
};

export function AlignmentStrip({ alignment }: Props) {
  if (!alignment || (!alignment.goals.length && !alignment.status)) {
    return null;
  }

  const badge = alignment.status ? BADGE[alignment.status] : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-5 pb-2">
      {alignment.goals.map((g) => (
        <span
          key={g}
          className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary"
        >
          {g}
        </span>
      ))}
      {badge && (
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            badge.className,
          )}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
