import type { ReactNode } from 'react';

/**
 * Marks a control/section with no backend data or command wired up yet.
 * Renders a red dashed outline + 🚧 badge (`.needs-logic` in styles.css,
 * shared across every webview bundle) so stubbed UI stays visible instead of
 * silently looking finished. Mirrors `webview/v3/shell/NeedsLogic.tsx` —
 * duplicated locally rather than imported cross-bundle since this sidebar
 * and the v3 panel are separate Vite entries.
 */
export function NeedsLogic({ children, note, block }: { children: ReactNode; note?: string; block?: boolean }) {
  return (
    <span className={`needs-logic ${block ? 'flex w-full' : 'inline-flex'}`} title={note ?? 'No backend wired yet — placeholder from the redesign'}>
      {children}
    </span>
  );
}
