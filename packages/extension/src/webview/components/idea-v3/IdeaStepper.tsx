/* Idea lifecycle stepper — the "where am I" flow indicator for the v3 Ideas
 * screen, clickable like Epic's `FlowCanvas`: clicking a station focuses it
 * and the parent (`IdeaDetail`) swaps the card below to that station's
 * detail, regardless of whether it's the current, a past, or a future one.
 *
 * Deliberately NOT built on `epic-v3/FlowCanvas.tsx` + `flow-layout.ts`:
 * those solve a 5-column wraparound grid with L-shaped corridor routing and
 * an optional loop/back-edge, because an Epic pipeline run can retry/loop. An
 * Idea's lifecycle is a strictly linear sequence of 5 fixed stations with no
 * branches, so a straight flex row with plain `<div>` connectors is simpler
 * and cheaper than an SVG viewBox — no geometry engine needed.
 */

import type { IdeaSummary } from '@/lib/types';
import type { IdeasLanguage } from '@/lib/ideasI18n';
import { ideaStepperNodes, STEP_ICON, STEP_STYLE, type IdeaStepNode, type StationKey } from './idea-adapt';
import { V3Callout } from '../epic-v3/V3Modal';

export function IdeaStepper({
  idea, language, focusedKey, onNodeClick,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  focusedKey: StationKey;
  onNodeClick: (key: StationKey) => void;
}) {
  const nodes = ideaStepperNodes(idea, language);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', padding: '2px 2px 0' }}>
        {nodes.flatMap((node, idx) => {
          const elements = [
            <StepNode key={node.key} node={node} focused={node.key === focusedKey} onClick={() => onNodeClick(node.key)} />,
          ];
          if (idx < nodes.length - 1) {
            elements.push(
              <Connector key={`${node.key}-c`} done={node.kind === 'done' && nodes[idx + 1]!.kind !== 'todo'} />,
            );
          }
          return elements;
        })}
      </div>
      {idea.blockedReason && (
        <V3Callout tone="err">{idea.blockedReason}</V3Callout>
      )}
    </div>
  );
}

function StepNode(props: { node: IdeaStepNode; focused: boolean; onClick: () => void }) {
  const node = props.node;
  const focused = props.focused;
  const style = STEP_STYLE[node.kind];
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={node.label || undefined}
      style={{
        flex: '1 1 0', minWidth: 84, maxWidth: 150, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        border: 'none', background: 'transparent', font: 'inherit', padding: 2,
      }}
    >
      <div
        style={{
          width: 26, height: 26, borderRadius: '50%', flex: 'none',
          border: style.border, background: style.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: style.iconColor,
          boxShadow: focused ? 'inset 0 0 0 2px var(--acc)' : undefined,
        }}
      >
        {STEP_ICON[node.kind]}
      </div>
      <div
        style={{
          fontSize: 10.5, color: style.labelColor, textAlign: 'center',
          fontWeight: node.kind === 'active' || node.kind === 'failed' || focused ? 600 : 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
          textDecoration: focused ? 'underline' : undefined, textUnderlineOffset: 3,
        }}
      >
        {node.label || ' '}
      </div>
    </button>
  );
}

function Connector({ done }: { done: boolean }) {
  return (
    <div
      style={{
        flex: '0 1 40px', minWidth: 16, height: 2,
        marginTop: 12, background: done ? 'var(--acc)' : 'var(--track)',
      }}
    />
  );
}
