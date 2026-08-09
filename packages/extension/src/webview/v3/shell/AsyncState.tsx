import type { ReactNode } from 'react';

export function V3LoadingState({ label = 'Loading AIDLC…' }: { label?: string }) {
  return <div className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">{label}</div>;
}

export function V3ErrorState({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <section className="rounded-md border border-destructive/50 bg-destructive/5 p-4" role="alert">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}

export function V3EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
