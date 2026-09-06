/* Epic list column — dc.html:551-656 / V3_HANDOFF §6.1.
 *
 * Presentation only. Filter / search / follow / collapse / drag state all stay
 * in EpicsView, which already persists them to the host via `persistEpicsUi`.
 * This component receives them as props and calls back — no new state shape.
 *
 * Width: resizable open column (default 316px, min 220 / max 560) · rail 46px.
 */

import type { CSSProperties, DragEvent } from 'react';
import type { EpicFilter, EpicSummary } from '@/lib/types';
import { useHorizontalPanelResize } from '@/hooks/useHorizontalPanelResize';
import { useHostAction } from '@/hooks/useHostAction';
import { EPIC_DND_MIME } from '../EpicCard';
import { FILTER_LABEL, ROW_DOT } from './adapt';
import { DisclosureBtn } from './primitives';

const FILTER_ORDER: EpicFilter[] = ['all', 'in_progress', 'pending', 'done', 'failed'];
export const EPIC_LIST_DEFAULT_WIDTH = 316;
export const EPIC_LIST_RAIL_WIDTH = 46;
export const EPIC_LIST_MIN_WIDTH = 220;
export const EPIC_LIST_MAX_WIDTH = 560;

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
  listWidth: number;
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
  onListWidthChange: (width: number) => void;
  onListWidthCommit: (width: number) => void;
  onToggleTools: () => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  onMigrate: () => void;
  onNewEpic: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onSectionDragOver: (s: 'follow' | 'no-follow') => (e: DragEvent) => void;
  onSectionDragLeave: (s: 'follow' | 'no-follow') => (e: DragEvent) => void;
  onSectionDrop: (s: 'follow' | 'no-follow') => (e: DragEvent) => void;
}

export function EpicListPanel(p: EpicListPanelProps) {
  const width = p.listCollapsed ? EPIC_LIST_RAIL_WIDTH : p.listWidth;
  const { dragging, onPointerDown } = useHorizontalPanelResize({
    min: EPIC_LIST_MIN_WIDTH,
    max: EPIC_LIST_MAX_WIDTH,
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
          aria-valuemin={EPIC_LIST_MIN_WIDTH}
          aria-valuemax={EPIC_LIST_MAX_WIDTH}
          title="Drag to resize epic list"
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
        aria-expanded={false}
        title="Mở rộng danh sách task"
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
  const { pending, run, isPending } = useHostAction();

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
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase',
                color: 'var(--txt3)', fontWeight: 600,
              }}
            >
              Tasks
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
            onClick={() => run(() => p.onMigrate(), 'migrate')}
            disabled={pending}
            title="Đồng bộ task cũ với cấu trúc workspace mới nhất"
            style={{
              cursor: pending ? 'wait' : 'pointer', height: 26, padding: '0 9px', borderRadius: 6,
              border: '1px solid var(--acc-bd)', background: 'var(--acc-bg)',
              color: 'var(--acc-txt)', fontSize: 10.5, fontWeight: 600,
              whiteSpace: 'nowrap', flex: 'none',
              opacity: pending ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {isPending('migrate') && (
              <span
                aria-hidden
                style={{
                  width: 9, height: 9, borderRadius: '50%',
                  border: '1.5px solid currentColor', borderRightColor: 'transparent',
                  animation: 'aidlcSpin 0.7s linear infinite',
                }}
              />
            )}
            {isPending('migrate') ? 'Migrating…' : 'Migrate'}
          </button>
          <button
            type="button"
            onClick={() => run(() => p.onRefresh(), 'refresh')}
            disabled={pending}
            title="Đọc lại danh sách task từ disk; không chạy agent và không thay đổi dữ liệu"
            style={{
              ...iconBtn,
              cursor: pending ? 'wait' : iconBtn.cursor,
              opacity: pending ? 0.7 : 1,
              animation: isPending('refresh') ? 'aidlcSpin 0.7s linear infinite' : undefined,
            }}
          >
            ↻
          </button>
          <button
            type="button"
            onClick={p.onToggleTools}
            aria-expanded={p.toolsOpen}
            title={p.toolsOpen ? 'Ẩn ô tìm và bộ lọc' : 'Mở ô tìm và bộ lọc task'}
            style={iconBtn}
          >
            ⌕
          </button>
          <button
            type="button"
            onClick={p.onToggleCollapsed}
            aria-expanded
            title="Thu hẹp danh sách task thành thanh icon"
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
                placeholder="Search tasks…"
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
              {p.epics.length === 0 ? 'No tasks yet' : 'No tasks match'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5 }}>
              {p.epics.length === 0
                ? 'Tạo task đầu tiên bằng + New Task.'
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
        {/* Actions follow the task rows instead of remaining pinned to the panel bottom. */}
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
            + New Task
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
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}
      >
        <div
          style={{
            fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase',
            color: 'var(--txt3)', fontWeight: 600,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{count}</div>
        <DisclosureBtn
          open={open}
          compact
          expandLabel="Mở rộng"
          collapseLabel="Thu gọn"
          title={open ? `Thu gọn ${label}` : `Mở rộng ${label}`}
          onClick={onToggle}
        />
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
        className="v3-mono"
        style={{ fontSize: 10.5, color: 'var(--txt3)', flex: 'none', whiteSpace: 'nowrap' }}
      >
        {epic.id}
      </div>
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
        title={isFollowed ? 'Bỏ theo dõi — task này sẽ xuống nhóm Không theo dõi' : 'Theo dõi task — ghim lên nhóm Đang theo dõi'}
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
