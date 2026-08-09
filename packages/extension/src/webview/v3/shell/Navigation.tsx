import type { V3ViewId } from '../contracts';

const labels: Record<V3ViewId, string> = { home: 'Home', epics: 'Epics', studio: 'Studio', guide: 'Guide' };
const views = Object.keys(labels) as V3ViewId[];

export function V3Navigation({ view, onChange }: { view: V3ViewId; onChange: (view: V3ViewId) => void }) {
  return (
    <nav className="flex gap-1 border-b border-border px-4 py-2" aria-label="AIDLC v3 navigation">
      {views.map((item) => (
        <button
          type="button"
          key={item}
          onClick={() => onChange(item)}
          aria-current={view === item ? 'page' : undefined}
          className={`rounded px-3 py-1.5 text-xs font-medium ${view === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
        >
          {labels[item]}
        </button>
      ))}
    </nav>
  );
}
