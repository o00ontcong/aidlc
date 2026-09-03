/* The 12-step rail. Selecting a step is how the user moves around — there is
 * no separate "next step" action. Steps are not shown with pipeline status;
 * has-content vs empty only changes the action on the selected step.
 *
 * Width: resizable column (default 220px, min 160 / max 560), same drag
 * handle as the Epics list.
 */

import { BookOpen } from 'lucide-react';
import type { DiscoverStep, DiscoverSummary } from '@/lib/types';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { useHorizontalPanelResize } from '@/hooks/useHorizontalPanelResize';
import { postMessage } from '@/lib/bridge';

export const DISCOVER_RAIL_DEFAULT_WIDTH = 220;
export const DISCOVER_RAIL_MIN_WIDTH = 160;
export const DISCOVER_RAIL_MAX_WIDTH = 560;

export function StepRail({
  discover, viewing, copy, width, onWidthChange, onWidthCommit, onSelect,
}: {
  discover: DiscoverSummary;
  viewing: string;
  copy: DiscoverCopy;
  width: number;
  onWidthChange: (width: number) => void;
  onWidthCommit: (width: number) => void;
  onSelect: (stepId: DiscoverStep['id']) => void;
}) {
  const { dragging, onPointerDown } = useHorizontalPanelResize({
    min: DISCOVER_RAIL_MIN_WIDTH,
    max: DISCOVER_RAIL_MAX_WIDTH,
    onResize: onWidthChange,
    onCommit: onWidthCommit,
  });

  return (
    <div
      className="relative flex min-h-0 flex-none flex-col self-stretch overflow-hidden border-r border-border"
      style={{ width }}
    >
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-1.5 pb-2">
          <p className="text-[9.5px] font-bold tracking-[0.09em] text-muted-foreground">{copy.steps}</p>
          <button
            type="button"
            onClick={() => postMessage({ type: 'openDiscoverGuide' })}
            title={copy.hints.openGuide}
            className="shrink-0 rounded text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3 w-3" />
          </button>
        </div>
        <ol className="space-y-px">
          {discover.steps.map((step) => {
            const isViewing = step.id === viewing;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  title={copy.hints.selectStep(`${step.order} · ${copy.stepTitle(step)}`)}
                  className={`flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition ${
                    isViewing ? 'bg-primary/10 outline outline-1 outline-primary/40' : 'hover:bg-accent/50'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] text-foreground">{step.order} · {copy.stepTitle(step)}</span>
                    <span className="block truncate font-mono text-[9.5px] text-muted-foreground">{step.files[0]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={DISCOVER_RAIL_MIN_WIDTH}
        aria-valuemax={DISCOVER_RAIL_MAX_WIDTH}
        title={copy.hints.resizeRail}
        onPointerDown={(event) => onPointerDown(event, width)}
        className="absolute top-0 z-[2] h-full touch-none"
        style={{
          right: -3,
          width: 6,
          cursor: 'col-resize',
          background: dragging ? 'var(--primary)' : 'transparent',
        }}
      />
    </div>
  );
}
