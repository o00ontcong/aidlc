import type { ReactNode } from 'react';
import { useI18n } from '../../lib/i18n';

/**
 * Wraps a redesign control that has no backend command wired yet (see
 * `AIDLC_REDESIGN_TODO` / plan `immutable-scribbling-castle`). Renders a red
 * dashed outline + 🚧 badge so stubbed controls stay visible instead of
 * silently looking finished. `grep -rn NeedsLogic` gives the full inventory.
 */
export function NeedsLogic({ children, note, block }: { children: ReactNode; note?: string; block?: boolean }) {
  const t = useI18n();
  return (
    <span className={`needs-logic ${block ? 'flex w-full' : 'inline-flex'}`} title={note ?? t.needsLogic.defaultNote}>
      {children}
    </span>
  );
}
