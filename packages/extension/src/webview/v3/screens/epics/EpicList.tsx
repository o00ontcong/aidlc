// v3/screens/epics/EpicList.tsx — left column, "open" state (316px), incl.
// search/filter tools block. Rail (46px collapsed) lives in EpicRail.tsx.
import React from 'react';
import type { EpicRowVM } from '../../data/types';
import { MOCK_EPICS } from '../../data/mock-data';
import { visibleEpics, splitFollow, filterCounts } from '../../state/selectors';
import { useUiStore } from '../../state/store';
import { Button, IconDot, ProgressBar, mock } from '../../components';

function SectionCaret({
  label, count, open, onToggle,
}: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-[6px] text-left">
      <span className="flex-none text-[10px] text-txt3">{open ? '▾' : '▸'}</span>
      <span className="flex-none text-[10px] uppercase tracking-[.08em] font-semibold text-txt3">{label}</span>
      <span className="flex-none text-[10px] text-txt3">{count}</span>
    </button>
  );
}

function EpicRow({ epic }: { epic: EpicRowVM }) {
  const { state, update, toggleFollow } = useUiStore();
  const selected = epic.id === state.selectedEpicId;
  const followed = Boolean(state.follow[epic.id]);
  const pctNum = parseInt(epic.pct, 10) || 0;
  return (
    <div
      onClick={() => update({ selectedEpicId: epic.id })}
      className={`flex items-center gap-[8px] p-[5px_8px] rounded-[5px] cursor-grab border ${
        selected ? 'border-acc-bd bg-acc-bg' : 'border-bd bg-panel2'
      }`}
    >
      <IconDot tone={epic.tone} size={7} />
      <span className="flex-1 min-w-0 text-[11.5px] text-txt whitespace-nowrap overflow-hidden text-ellipsis">{epic.title}</span>
      <ProgressBar height={2} tone={epic.tone} pct={pctNum} className="w-[26px]" />
      <span className="flex-none w-[30px] text-right font-v3-mono text-[10px] text-txt3">{epic.pct}</span>
      <span
        onClick={(e) => { e.stopPropagation(); toggleFollow(epic.id); }}
        className={`flex-none text-[11px] cursor-pointer ${followed ? 'text-acc-txt' : 'text-track'}`}
      >
        ★
      </span>
    </div>
  );
}

export function EpicList() {
  const { state, update } = useUiStore();
  const visible = visibleEpics(MOCK_EPICS, state.filter, state.query);
  const { following, rest } = splitFollow(visible, state.follow);
  const counts = filterCounts(MOCK_EPICS);
  const filterActive = Boolean(state.query) || state.filter !== 'All';
  const filterLabel = state.query ? `"${state.query}"` : state.filter;

  return (
    <div className="flex-none w-[316px] h-full min-h-0 flex flex-col bg-panel border-r border-bd">
      {/* header */}
      <div className="flex-none flex flex-col gap-[7px] p-[7px_10px] border-b border-bd">
        <div className="flex items-center gap-[6px]">
          <button
            type="button"
            onClick={() => update({ toolsOpen: !state.toolsOpen })}
            className="flex-1 min-w-0 flex items-center gap-[6px] text-left"
          >
            <span className="flex-none text-[10px] text-txt3">{state.toolsOpen ? '▾' : '▸'}</span>
            <span className="flex-none text-[10.5px] uppercase tracking-[.09em] font-semibold text-txt3">Epics</span>
            <span className="flex-none text-[10.5px] text-txt3">{MOCK_EPICS.length}</span>
            <span
              className={`flex-none rounded-full px-[7px] py-[1px] text-[10px] ${
                filterActive ? 'bg-acc-bg text-acc-txt' : 'bg-hover text-txt3'
              }`}
            >
              {filterLabel}
            </span>
          </button>
          <button
            type="button"
            onClick={() => update({ toolsOpen: !state.toolsOpen })}
            className="flex-none w-[24px] h-[24px] rounded-[6px] border border-bd flex items-center justify-center text-[12px] text-txt2"
          >
            ⌕
          </button>
          <button
            type="button"
            onClick={() => update({ listCollapsed: true })}
            className="flex-none w-[24px] h-[24px] rounded-[6px] flex items-center justify-center text-[12px] text-txt2"
          >
            ‹
          </button>
        </div>

        {state.toolsOpen && (
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-center gap-[7px] bg-panel2 border border-bd rounded-[6px] p-[6px_9px]">
              <span className="flex-none text-[11px] text-txt3">⌕</span>
              <input
                value={state.query}
                onChange={(e) => update({ query: e.target.value })}
                className="flex-1 min-w-0 bg-transparent outline-none text-[11.5px] text-txt"
              />
            </div>
            <div className="flex flex-wrap gap-[3px]">
              {counts.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => update({ filter: c.key })}
                  className={`flex-none rounded-full border px-[7px] py-[3px] text-[10.5px] ${
                    state.filter === c.key ? 'bg-acc-bg border-acc-bd text-acc-txt' : 'bg-transparent border-bd text-txt2'
                  }`}
                >
                  {c.key}
                  <span className="opacity-[.65]"> {c.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* body */}
      <div {...mock('epics.list', 'block')} className="flex-1 overflow-auto flex flex-col gap-[9px] p-[8px_10px]">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-[8px] py-[24px] text-center">
            <div className="w-[38px] h-[38px] rounded-[8px] border border-dashed border-bd flex items-center justify-center text-[15px] text-txt3">⌕</div>
            <div className="text-[12.5px] font-semibold text-txt">No epics match</div>
            <div className="text-[11.5px] text-txt2">Thử xoá từ khoá hoặc chọn filter All.</div>
            <Button label="Xoá bộ lọc" size="sm" variant="default" onClick={() => update({ query: '', filter: 'All' })} />
          </div>
        ) : (
          <>
            {following.length > 0 && (
              <div className="flex flex-col gap-[6px]">
                <SectionCaret
                  label="★ FOLLOWING"
                  count={following.length}
                  open={state.followSectionOpen}
                  onToggle={() => update({ followSectionOpen: !state.followSectionOpen })}
                />
                {state.followSectionOpen && (
                  <div className="flex flex-col gap-[2px]">
                    {following.map((epic) => <EpicRow key={epic.id} epic={epic} />)}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-[6px]">
              <SectionCaret
                label="NOT FOLLOWING"
                count={rest.length}
                open={state.restSectionOpen}
                onToggle={() => update({ restSectionOpen: !state.restSectionOpen })}
              />
              {state.restSectionOpen && (
                <div className="flex flex-col gap-[2px]">
                  {rest.map((epic) => <EpicRow key={epic.id} epic={epic} />)}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* footer */}
      <div className="flex-none flex items-center gap-[6px] p-[8px_10px] border-t border-bd">
        <Button
          label="+ New Epic"
          variant="primary"
          className="flex-1 p-[7px] text-[11.5px] font-semibold"
          onClick={() => update({ newEpicOpen: true })}
        />
        <button
          type="button"
          title="Start Autonomous Delivery"
          onClick={() => {}}
          className="flex-none p-[7px_10px] rounded-[6px] border border-bd text-txt2"
        >
          ⚡
        </button>
      </div>
    </div>
  );
}
