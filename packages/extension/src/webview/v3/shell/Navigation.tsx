import type { V3ViewId } from '../contracts';
import { useI18n } from '../../lib/i18n';

/** Order matches `re-design/AIDLC Workspace v3.dc.html:1383` (Guide before Studio). */
const views: V3ViewId[] = ['home', 'epics', 'builder', 'analyze', 'tests', 'guide', 'studio'];

export function V3Navigation({ view, onChange }: { view: V3ViewId; onChange: (view: V3ViewId) => void }) {
  const t = useI18n();
  const labels: Record<V3ViewId, string> = t.nav;
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
