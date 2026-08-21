/* Mock-data boundary for the v3 Epic screen. Adapted from
 * v3-handoff/MockBoundary.tsx.
 *
 * Every control bound to data the extension host does NOT yet provide carries
 * `data-mock="true" data-mock-id="<id>"`. Turning the overlay on paints those
 * controls with a red dashed outline (see styles/v3-tokens.css), so an
 * unwired control can never be mistaken for a working one.
 *
 * Difference from the handoff: the handoff defaults the overlay ON in DEV
 * (§12.4); the brief for this change specifies "mặc định tắt", so `initial`
 * defaults to false. Nothing else about the marking convention changed —
 * `data-mock-id` values still match MOCK_IDS below.
 *
 * Find every mock again with:
 *   rg 'data-mock-id="' packages/extension/src/webview/components/epic-v3
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Level = 'inline' | 'block';

const MockCtx = createContext<{ visible: boolean; setVisible: (v: boolean) => void }>({
  visible: false, setVisible: () => {},
});

/**
 * Default is OFF (the brief specifies "mặc định tắt"). When `initial` is not
 * passed, an already-present `.mock-visible` class on <html> wins — that lets
 * the dev harness (and, later, a host-injected `aidlc.showMockData` flag per
 * V3_HANDOFF §12.4) turn the overlay on without this component clobbering it.
 */
export function MockProvider({ children, initial }: { children: React.ReactNode; initial?: boolean }) {
  const [visible, setVisible] = useState(
    () => initial ?? (
      typeof document !== 'undefined'
      && document.documentElement.classList.contains('mock-visible')
    ),
  );
  useEffect(() => {
    document.documentElement.classList.toggle('mock-visible', visible);
  }, [visible]);
  const value = useMemo(() => ({ visible, setVisible }), [visible]);
  return <MockCtx.Provider value={value}>{children}</MockCtx.Provider>;
}

export const useMockVisible = () => useContext(MockCtx);

/** Spread onto any element to mark it as bound to mock data. */
export function mock(id: string, level: Level = 'inline') {
  return { 'data-mock': 'true', 'data-mock-id': id, 'data-mock-level': level } as const;
}

export function MockBoundary({
  id, level = 'inline', as: As = 'div', className, style, children,
}: {
  id: string; level?: Level; as?: React.ElementType;
  className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  return (
    <As {...mock(id, level)} className={className} style={style}>
      {children}
    </As>
  );
}

/**
 * The mock ids used by the Epic screen, with the host field that will replace
 * each one. Keep this table honest — it is the checklist for un-mocking.
 *
 * id                        replaceWith
 * ─────────────────────────────────────────────────────────────────────────
 * epic.projectContext       published Project Context revision + step states
 * epic.parallelEpics        per-epic branch / PR / worker state
 * epic.flow.atLabel         run-state cursor label for the flow badge
 * epic.flow.loop            pipeline reject-edge metadata
 * epic.gate.consequence     gate consequence text + diff stat from the run
 * epic.ship.policy          artifact-policy counters
 * epic.independence         Project Workspace independence checklist
 */
export const MOCK_IDS = {
  projectContext: 'epic.projectContext',
  parallelEpics: 'epic.parallelEpics',
  flowAtLabel: 'epic.flow.atLabel',
  flowLoop: 'epic.flow.loop',
  gateConsequence: 'epic.gate.consequence',
  shipPolicy: 'epic.ship.policy',
  independence: 'epic.independence',
} as const;
