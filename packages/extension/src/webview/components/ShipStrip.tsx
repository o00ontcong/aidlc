import { GitPullRequest, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EpicShipInfo } from '@/lib/types';

interface Props {
  ship?: EpicShipInfo | null;
  /** Only render for feature pipelines — never package cards. */
  isFeatureEpic: boolean;
}

const STATUS: Record<NonNullable<EpicShipInfo['status']>, string> = {
  open: 'border-primary/40 bg-primary/10 text-primary',
  approved: 'border-success/40 bg-success/10 text-success',
  merged: 'border-success/50 bg-success/15 text-success',
};

/**
 * Feature-level ship strip (PR link + status). Package epics must not show this.
 */
export function ShipStrip({ ship, isFeatureEpic }: Props) {
  if (!isFeatureEpic) return null;
  if (!ship?.prUrl && !ship?.status) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 pb-2 text-[11px]">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <GitPullRequest className="h-3.5 w-3.5" />
        Ship
      </span>
      {ship.status && (
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase',
            STATUS[ship.status],
          )}
        >
          {ship.status}
        </span>
      )}
      {ship.prUrl && (
        <a
          href={ship.prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {ship.head && ship.base ? `${ship.head} → ${ship.base}` : 'Open PR'}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
