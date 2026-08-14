/* Epic list column — dc.html:551-656 / V3_HANDOFF §6.1.
 *
 * Presentation only. Filter / search / follow / collapse / drag state all stay
 * in EpicsView, which already persists them to the host via `persistEpicsUi`.
 * This component receives them as props and calls back — no new state shape.
 *
 * Three width states (§6.1): open 316px · rail 46px · open+search 316px.
 */

import type { DragEvent } from 'react';
import type { EpicFilter, EpicSummary } from '@/lib/types';
import { EPIC_DND_MIME } from '../EpicCard';
import { FILTER_LABEL, ROW_DOT } from './adapt';

const FILTER_ORDER: EpicFilter[] = ['all', 'in_progress', 'pending', 'done', 'failed'];

export interface EpicListPanelProps {
  epics: EpicSummary[];
  visible: EpicSummary[];
  followed: EpicSummary[];
  unfollowed: EpicSummary[];
  counts: Record<EpicFilter, number>;
  filter: EpicFilter;
  search: string;
  selectedId: string | null;
  followedIds: Set<string>;
  followOpen: boolean;
  noFollowOpen: boolean;
  listCollapsed: boolean;
  toolsOpen: boolean;
  dragEpicId: string | null;
  dropTarget: 'follow' | 'no-follow' | null;
  onFilter: (f: EpicFilter) => void;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  onToggleFollow: (id: string) => void;
  onToggleFollowOpen: () => void;
  onToggleNoFollowOpen: () => void;
  onToggleCollapsed: () => void;
  onToggleTools: () => void;
  onResetFilters: () => void;
  onNewEpic: () => void;
  onAutonomousDelivery: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onSectionDragOver: (s: 'follow' | 'no-follow') => (e: DragEvent) => void;
  onSectionDragLeave: (s: 'follow' | 'no-follow') => (e: DragEvent) => void;
  onSectionDrop: (s: 'follow' | 'no-follow') => (e: DragEvent) => void;
}

export function EpicListPanel(p: EpicListPanelProps) {
  const width = p.listCollapsed ? 46 : 316;

  return (
    <div
      style={{
        width,
        flex: 'none',
        borderRight: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--panel)',
      }}
    >
      {p.listCollapsed ? <Rail {...p} /> : <OpenList {...p} />}
    </div>
  );
}

/* dc.html:554-563 */
function Rail(p: EpicListPanelProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '10px 0',
        minHeight: 0,
        overflow: 'auto',
      }}
    >
      <button
        type="button"
        onClick={p.onToggleCollapsed}
        title="Mở danh sách epic"
        style={{
          cursor: 'pointer', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
          color: 'var(--txt2)', background: 'transparent', flex: 'none',
        }}
      >
        ›
      </button>
      <div style={{ width: 1, height: 6, flex: 'none' }} />
      {p.visible.map((e) => {
        const selected = e.id === p.selectedId;
        const isFollowed = p.followedIds.has(e.id);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => p.onSelect(e.id)}
            title={`${e.id} · ${e.title}`}
            style={{
              cursor: 'pointer', width: 26, height: 26, borderRadius: 6,
              border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--bd)'}`,
              background: selected ? 'var(--acc-bg)' : 'var(--panel2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', flex: 'none',
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ROW_DOT[e.status] }} />
            <div
              style={{
                position: 'absolute', top: -1, right: -1, fontSize: 8,
                color: isFollowed ? 'var(--acc-txt)' : 'var(--track)',
              }}
            >
              ★
            </div>
          </button>
        );
      })}
    </div>
  );
}

function OpenList(p: EpicListPanelProps) {
  const q = p.search.trim();
  const chipLabel = q ? `"${q}"` : FILTER_LABEL[p.filter];
  const chipActive = !!q || p.filter !== 'all';
  const isEmpty = p.visible.length === 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* header — dc.html:568 */}
      <div
        style={{
          flex: 'none', padding: '7px 10px', display: 'flex', flexDirection: 'column',
          gap: 7, borderBottom: '1px solid var(--bd)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            onClick={p.onToggleTools}
            style={{ cursor: 'pointer', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{p.toolsOpen ? '▾' : '▸'}</div>
            <div
              style={{
                fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase',
                color: 'var(--txt3)', fontWeight: 600,
              }}
            >
              Epics
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{p.epics.length}</div>
            <div
              style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 999,
                background: chipActive ? 'var(--acc-bg)' : 'var(--hover)',
                color: chipActive ? 'var(--acc-txt)' : 'var(--txt3)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {chipLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={p.onToggleTools}
            title="Tìm & lọc epic"
            style={iconBtn}
          >
            ⌕
          </button>
          <button
            type="button"
            onClick={p.onToggleCollapsed}
            title="Thu gọn danh sách"
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
                placeholder="Search epics…"
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
                    <div>{FILTER_LABEL[f]}</div>
                    <div style={{ opacity: 0.65 }}>{p.counts[f]}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* list — dc.html:597 */}
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
              ⌕
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 600 }}>
              {p.epics.length === 0 ? 'No epics yet' : 'No epics match'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5 }}>
              {p.epics.length === 0
                ? 'Tạo epic đầu tiên bằng + New Epic.'
                : 'Thử xoá từ khoá hoặc chọn filter All.'}
            </div>
            {p.epics.length > 0 && (
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
          <>
            {p.followed.length > 0 && (
              <Section
                label="★ Following"
                count={p.followed.length}
                open={p.followOpen}
                onToggle={p.onToggleFollowOpen}
                isDropTarget={p.dropTarget === 'follow'}
                onDragOver={p.onSectionDragOver('follow')}
                onDragLeave={p.onSectionDragLeave('follow')}
                onDrop={p.onSectionDrop('follow')}
              >
                {p.followed.map((e) => <Row key={e.id} epic={e} p={p} />)}
              </Section>
            )}
            <Section
              label="Not following"
              count={p.unfollowed.length}
              open={p.noFollowOpen}
              onToggle={p.onToggleNoFollowOpen}
              isDropTarget={p.dropTarget === 'no-follow'}
              onDragOver={p.onSectionDragOver('no-follow')}
              onDragLeave={p.onSectionDragLeave('no-follow')}
              onDrop={p.onSectionDrop('no-follow')}
            >
              {p.unfollowed.map((e) => <Row key={e.id} epic={e} p={p} />)}
            </Section>
          </>
        )}
        {/* Actions follow the epic rows instead of remaining pinned to the panel bottom. */}
        <div style={{ display: 'flex', gap: 6, paddingTop: 1 }}>
          <button
            type="button"
            onClick={p.onNewEpic}
            style={{
              cursor: 'pointer', flex: 1, textAlign: 'center', padding: 7, borderRadius: 6,
              background: 'var(--acc)', color: 'var(--on-acc)', fontSize: 11.5, fontWeight: 600,
              border: 'none', fontFamily: 'inherit',
            }}
          >
            + New Epic
          </button>
          <button
            type="button"
            onClick={p.onAutonomousDelivery}
            title="Start Autonomous Delivery"
            style={{
              cursor: 'pointer', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--bd)',
              color: 'var(--txt2)', fontSize: 11.5, background: 'transparent', fontFamily: 'inherit',
            }}
          >
            ⚡
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  cursor: 'pointer', width: 24, height: 24, flex: 'none', borderRadius: 6,
  border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, color: 'var(--txt2)', background: 'transparent', padding: 0, fontFamily: 'inherit',
};

/* dc.html:608-627 */
function Section({
  label, count, open, onToggle, isDropTarget, onDragOver, onDragLeave, onDrop, children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  isDropTarget: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        // Drop affordance for the existing drag-to-follow capability. The
        // design has no drop state; a 1px inset ring keeps layout identical.
        boxShadow: isDropTarget ? 'inset 0 0 0 1px var(--acc-bd)' : undefined,
        borderRadius: isDropTarget ? 6 : undefined,
      }}
    >
      <div
        onClick={onToggle}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}
      >
        <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{open ? '▾' : '▸'}</div>
        <div
          style={{
            fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase',
            color: 'var(--txt3)', fontWeight: 600,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{count}</div>
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>}
    </div>
  );
}

/* dc.html:617-623 / :639-645 */
function Row({ epic, p }: { epic: EpicSummary; p: EpicListPanelProps }) {
  const selected = epic.id === p.selectedId;
  const isFollowed = p.followedIds.has(epic.id);
  const dot = ROW_DOT[epic.status];
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(EPIC_DND_MIME, epic.id);
        e.dataTransfer.setData('text/plain', epic.id);
        p.onDragStart(epic.id);
      }}
      onDragEnd={p.onDragEnd}
      onClick={() => p.onSelect(epic.id)}
      title={`${epic.id} · ${epic.title}`}
      style={{
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px',
        borderRadius: 5,
        border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--bd)'}`,
        background: selected ? 'var(--acc-bg)' : 'var(--panel2)',
        opacity: p.dragEpicId === epic.id ? 0.5 : 1,
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: 'none' }} />
      <div
        style={{
          flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--txt)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {epic.title}
      </div>
      <div
        style={{
          width: 26, height: 2, borderRadius: 1, background: 'var(--track)',
          overflow: 'hidden', flex: 'none',
        }}
      >
        <div style={{ height: 2, background: dot, width: `${epic.progress}%` }} />
      </div>
      <div
        className="v3-mono"
        style={{ fontSize: 10, color: 'var(--txt3)', width: 30, textAlign: 'right', flex: 'none' }}
      >
        {epic.progress}%
      </div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          p.onToggleFollow(epic.id);
        }}
        title={isFollowed ? 'Unfollow epic' : 'Follow epic'}
        style={{
          cursor: 'pointer', fontSize: 11, flex: 'none',
          color: isFollowed ? 'var(--acc-txt)' : 'var(--track)',
        }}
      >
        ★
      </div>
    </div>
  );
}
