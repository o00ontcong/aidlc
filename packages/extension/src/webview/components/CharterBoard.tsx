import type { ReactNode } from 'react';
import { BookOpen, Shield, Cpu, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CharterSnapshot } from '@/lib/types';
import { postMessage } from '@/lib/bridge';

interface Props {
  charter: CharterSnapshot | null | undefined;
}

function Column({
  title,
  icon,
  children,
  empty,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  empty?: string;
}) {
  const hasContent = children != null && children !== false;
  return (
    <div className="min-w-0 flex-1 rounded-md border border-border/70 bg-surface/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {hasContent ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <p className="text-[11px] text-muted-foreground/80">{empty ?? '—'}</p>
      )}
    </div>
  );
}

export function CharterBoard({ charter }: Props) {
  if (!charter?.present) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-foreground">Charter Board</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              No <code className="text-[10px]">docs/project/charter/CHARTER.json</code> yet.
              Run <strong>project-context</strong> (define-charter) before starting feature epics.
            </p>
          </div>
          <button
            type="button"
            onClick={() => postMessage({ type: 'openPath', path: 'docs/project/charter' })}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Open charter dir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">
          Charter Board
          {typeof charter.revision === 'number' && (
            <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">
              rev {charter.revision}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {charter.conventionsPath && (
            <button
              type="button"
              onClick={() => postMessage({ type: 'openPath', path: charter.conventionsPath! })}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <BookOpen className="h-3 w-3" />
              CONVENTIONS
            </button>
          )}
          {charter.rulesSyncStatus && (
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase',
                charter.rulesSyncStatus === 'fresh'
                  ? 'border-success/40 text-success'
                  : 'border-warning/40 text-warning',
              )}
            >
              rules {charter.rulesSyncStatus}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <Column title="Goals" icon={<BookOpen className="h-3 w-3" />} empty="No goals">
          {charter.goals.map((g) => (
            <div key={g.id} className="text-[11px] text-foreground">
              <span className="font-mono font-semibold text-primary">{g.id}</span>{' '}
              <span className="text-muted-foreground">{g.title}</span>
            </div>
          ))}
        </Column>
        <Column title="Principles" icon={<Shield className="h-3 w-3" />} empty="No invariants">
          {charter.invariants.map((inv) => (
            <div key={inv.id} className="text-[11px] text-foreground">
              <span className="font-mono font-semibold text-primary">{inv.id}</span>{' '}
              <span className="text-muted-foreground">{inv.rule}</span>
            </div>
          ))}
        </Column>
        <Column title="Tech Policy" icon={<Cpu className="h-3 w-3" />} empty="No tech rules">
          {charter.techRules.map((t) => (
            <div key={t.id} className="text-[11px] text-foreground">
              <span className="font-mono font-semibold text-primary">{t.id}</span>{' '}
              <span className="uppercase text-[10px] text-muted-foreground">{t.kind}</span>{' '}
              <span className="text-muted-foreground">{t.value}</span>
            </div>
          ))}
        </Column>
        <Column title="Drift" icon={<AlertTriangle className="h-3 w-3" />} empty="No drift report">
          {charter.driftSummary ? (
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{charter.driftSummary}</p>
          ) : null}
        </Column>
      </div>
    </div>
  );
}
