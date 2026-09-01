/* Idea list column — adapted from `epic-v3/EpicListPanel.tsx`'s shell.
 *
 * Same resizable/collapsible presentation pattern (search, filter chips, rail
 * mode), minus Epic's follow/no-follow drag-and-drop sections — Ideas has no
 * "follow" concept, just the existing 5-bucket filter already computed by
 * `inboxBucket`. Presentation only: filter/search/resize/collapse state stays
 * in the parent `IdeasView`, passed down as props.
 */

import type { CSSProperties } from 'react';
import { BookOpen } from 'lucide-react';
import type { IdeaSummary } from '@/lib/types';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { useHorizontalPanelResize } from '@/hooks/useHorizontalPanelResize';
import { FILTER_TONE, formatUpdated, inboxBucket, stageLabel, type Filter } from './idea-adapt';

export const IDEA_LIST_DEFAULT_WIDTH = 316;
export const IDEA_LIST_RAIL_WIDTH = 46;
export const IDEA_LIST_MIN_WIDTH = 220;
export const IDEA_LIST_MAX_WIDTH = 560;

const FILTER_ORDER: Filter[] = ['all', 'writing', 'ready', 'done', 'shelved', 'blocked'];

export interface IdeaListPanelProps {
  ideas: IdeaSummary[];
  visible: IdeaSummary[];
  counts: Record<Filter, number>;
  filter: Filter;
  search: string;
  selectedId: string | null;
  listCollapsed: boolean;
  listWidth: number;
  toolsOpen: boolean;
  language: IdeasLanguage;
  onFilter: (f: Filter) => void;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  onToggleCollapsed: () => void;
  onListWidthChange: (width: number) => void;
  onListWidthCommit: (width: number) => void;
  onToggleTools: () => void;
  onResetFilters: () => void;
  onOpenGuide: () => void;
  onNewIdea: () => void;
}

export function IdeaListPanel(p: IdeaListPanelProps) {
  const width = p.listCollapsed ? IDEA_LIST_RAIL_WIDTH : p.listWidth;
  const { dragging, onPointerDown } = useHorizontalPanelResize({
    min: IDEA_LIST_MIN_WIDTH,
    max: IDEA_LIST_MAX_WIDTH,
    disabled: p.listCollapsed,
    onResize: p.onListWidthChange,
    onCommit: p.onListWidthCommit,
  });

  return (
    <div
      style={{
        width,
        flex: 'none',
        position: 'relative',
        borderRight: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--panel)',
      }}
    >
      {p.listCollapsed ? <Rail {...p} /> : <OpenList {...p} />}
      {!p.listCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={p.listWidth}
          aria-valuemin={IDEA_LIST_MIN_WIDTH}
          aria-valuemax={IDEA_LIST_MAX_WIDTH}
          title="Drag to resize idea list"
          onPointerDown={(event) => onPointerDown(event, p.listWidth)}
          style={{
            position: 'absolute',
            top: 0,
            right: -3,
            width: 6,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 2,
            touchAction: 'none',
            background: dragging ? 'var(--acc-bd)' : 'transparent',
          }}
        />
      )}
    </div>
  );
}

function Rail(p: IdeaListPanelProps) {
  const copy = ideasCopy(p.language);
  return (
    <div
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, padding: '10px 0', minHeight: 0, overflow: 'auto',
      }}
    >
      <button
        type="button"
        onClick={p.onToggleCollapsed}
        aria-expanded={false}
        title="Mở rộng danh sách"
        style={{
          cursor: 'pointer', width: 32, minHeight: 52, borderRadius: 6, border: '1px solid var(--bd)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 2, fontSize: 10, color: 'var(--txt2)', background: 'transparent', flex: 'none',
          fontFamily: 'inherit', lineHeight: 1.15, padding: '6px 2px',
        }}
      >
        <span aria-hidden>▸</span>
        <span>Mở</span>
      </button>
      <div style={{ width: 1, height: 6, flex: 'none' }} />
      {p.visible.map((idea) => {
        const selected = idea.id === p.selectedId;
        const dot = FILTER_TONE[inboxBucket(idea)].dot;
        return (
          <button
            key={idea.id}
            type="button"
            onClick={() => p.onSelect(idea.id)}
            title={`${idea.id} · ${idea.title}`}
            style={{
              cursor: 'pointer', width: 26, height: 26, borderRadius: 6,
              border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--bd)'}`,
              background: selected ? 'var(--acc-bg)' : 'var(--panel2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={p.onNewIdea}
        title={copy.newIdea}
        style={{
          cursor: 'pointer', width: 32, height: 32, borderRadius: 6, border: 'none',
          background: 'var(--acc)', color: 'var(--on-acc)', fontSize: 15, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        }}
      >
        +
      </button>
    </div>
  );
}

function OpenList(p: IdeaListPanelProps) {
  const copy = ideasCopy(p.language);
  const q = p.search.trim();
  const activeFilterLabel = FILTER_LABEL(copy)[p.filter];
  const chipLabel = q ? `"${q}"` : activeFilterLabel;
  const isEmpty = p.visible.length === 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          flex: 'none', padding: '7px 10px', display: 'flex', flexDirection: 'column',
          gap: 7, borderBottom: '1px solid var(--bd)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase',
                color: 'var(--txt3)', fontWeight: 600,
              }}
            >
              {copy.header.eyebrow}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{p.ideas.length}</div>
            <div
              style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 999,
                background: 'var(--acc-bg)', color: 'var(--acc-txt)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {chipLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={p.onOpenGuide}
            aria-label={copy.header.openGuide}
            title={copy.header.openGuide}
            style={iconBtn}
          >
            <BookOpen size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={p.onToggleTools}
            aria-expanded={p.toolsOpen}
            title={p.toolsOpen ? 'Ẩn ô tìm và bộ lọc' : 'Mở ô tìm và bộ lọc'}
            style={iconBtn}
          >
            ⌕
          </button>
          <button
            type="button"
            onClick={p.onToggleCollapsed}
            aria-expanded
            title="Thu hẹp danh sách thành thanh icon"
            style={iconBtn}
          >
            ‹
          </button>
        </div>

        {p.toolsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 7, background: 'var(--panel2)',
                border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 9px',
              }}
            >
              <div style={{ color: 'var(--txt3)', fontSize: 11 }}>⌕</div>
              <input
                value={p.search}
                onChange={(e) => p.onSearch(e.target.value)}
                placeholder="Search ideas…"
                spellCheck={false}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--txt)', fontSize: 11.5, fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {FILTER_ORDER.map((f) => {
                const active = p.filter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => p.onFilter(f)}
                    style={{
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 7px', borderRadius: 999, fontSize: 10.5,
                      border: `1px solid ${active ? 'var(--acc-bd)' : 'var(--bd)'}`,
                      background: active ? 'var(--acc-bg)' : 'transparent',
                      color: active ? 'var(--acc-txt)' : 'var(--txt2)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div>{FILTER_LABEL(copy)[f]}</div>
                    <div style={{ opacity: 0.65 }}>{p.counts[f]}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1, overflow: 'auto', padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: 9,
        }}
      >
        {isEmpty ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '34px 12px', textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 38, height: 38, borderRadius: 8, border: '1px dashed var(--bd)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--txt3)', fontSize: 15,
              }}
            >
              💡
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 600 }}>
              {copy.list.emptyTitle}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5 }}>
              {copy.list.emptyBody}
            </div>
            {p.ideas.length > 0 && (
              <button
                type="button"
                onClick={p.onResetFilters}
                style={{
                  cursor: 'pointer', marginTop: 2, fontSize: 11.5, padding: '6px 12px',
                  borderRadius: 6, border: '1px solid var(--bd)', color: 'var(--txt)',
                  background: 'transparent', fontFamily: 'inherit',
                }}
              >
                Xoá bộ lọc
              </button>
            )}
          </div>
        ) : (
          p.visible.map((idea) => <Row key={idea.id} idea={idea} p={p} />)
        )}
        <div style={{ display: 'flex', gap: 6, paddingTop: 1 }}>
          <button
            type="button"
            onClick={p.onNewIdea}
            style={{
              cursor: 'pointer', flex: 1, textAlign: 'center', padding: 7, borderRadius: 6,
              background: 'var(--acc)', color: 'var(--on-acc)', fontSize: 11.5, fontWeight: 600,
              border: 'none', fontFamily: 'inherit',
            }}
          >
            + {copy.newIdea}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ idea, p }: { idea: IdeaSummary; p: IdeaListPanelProps }) {
  const copy = ideasCopy(p.language);
  const selected = idea.id === p.selectedId;
  const bucket = inboxBucket(idea);
  const tone = FILTER_TONE[bucket];
  const inWorkspace = !['in_delivery', 'completed', 'closed'].includes(idea.checkpoint);
  const stageText = stageLabel(idea.stage, p.language);
  const missing = idea.stageStatus.requirements.filter((r) => r.level === 'required' && !r.passed).length;
  return (
    <button
      type="button"
      onClick={() => p.onSelect(idea.id)}
      title={`${idea.id} · ${idea.title}`}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '6px 8px',
        borderRadius: 5,
        textAlign: 'left',
        border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--bd)'}`,
        background: selected ? 'var(--acc-bg)' : 'var(--panel2)',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: tone.dot, flex: 'none' }} />
        <div className="v3-mono" style={{ fontSize: 10, color: 'var(--txt3)', flex: 'none', whiteSpace: 'nowrap' }}>
          {idea.id}
        </div>
        <div
          style={{
            flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--txt)', fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {idea.title}
        </div>
        <div className="v3-mono" style={{ fontSize: 9.5, color: 'var(--txt3)', flex: 'none' }}>
          {formatUpdated(idea.updatedAt, p.language)}
        </div>
      </div>
      {idea.blockedReason && (
        <div style={{ fontSize: 10, color: 'var(--err)', display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 14 }}>
          {idea.blockedReason}
        </div>
      )}
      {inWorkspace && !idea.blockedReason && (
        <div style={{ fontSize: 10, color: 'var(--txt3)', paddingLeft: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{stageText}</span>
          <span>· {Math.round(idea.stageStatus.completion * 100)}%</span>
          {missing > 0 && <span style={{ color: 'var(--warn)' }}>· {copy.list.missingCount(missing)}</span>}
          {idea.needsReview && <span style={{ color: 'var(--warn)' }}>· {copy.list.needsReview}</span>}
        </div>
      )}
    </button>
  );
}

function FILTER_LABEL(copy: ReturnType<typeof ideasCopy>): Record<Filter, string> {
  return {
    all: copy.filters.all,
    writing: copy.filters.writing,
    ready: copy.filters.ready,
    blocked: copy.filters.blocked,
    done: copy.filters.done,
    shelved: copy.filters.shelved,
  };
}

const iconBtn: CSSProperties = {
  cursor: 'pointer', width: 24, height: 24, flex: 'none', borderRadius: 6,
  border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, color: 'var(--txt2)', background: 'transparent', padding: 0, fontFamily: 'inherit',
};
