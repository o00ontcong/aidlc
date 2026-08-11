// v3/shell/sidebar/QuotaTracker.tsx — §4.1. Quota tracker card list.
import React from 'react';
import { MOCK_QUOTA } from '../../data/mock-data';
import { pctAvailable, quotaTone, cardAvailPct, cardTone } from '../../lib/quota';
import { toneColor } from '../../lib/tone';
import { useUiStore } from '../../state/store';
import { IconDot, ProgressBar, Toggle, mock } from '../../components';

export function QuotaTracker() {
  const { state, update } = useUiStore();
  const connected = MOCK_QUOTA.filter((c) => c.connected).length;
  const notConnected = MOCK_QUOTA.length - connected;
  const open = state.quotaOpen;

  return (
    <div className="flex flex-col gap-[8px]" {...mock('sidebar.quota', 'block')}>
      <div className="flex items-center gap-[7px]">
        <span className="flex-none text-[10px] uppercase tracking-[.09em] font-semibold text-txt3">Quota tracker</span>
        <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10.5px] text-txt3">
          {`${connected} connected · ${notConnected} chưa nối`}
        </span>
        <button
          type="button"
          onClick={() => update({ quotaOpen: !open })}
          className="flex-none text-[10px] text-txt3"
        >
          {open ? '▾' : '▸'}
        </button>
      </div>

      {MOCK_QUOTA.map((card) => {
        const tone = cardTone(card);
        const avail = cardAvailPct(card);
        return (
          <div
            key={card.provider}
            className={`bg-panel2 rounded-[7px] overflow-hidden border ${card.connected ? 'border-bd' : 'border-bd2'}`}
          >
            <div
              className="flex items-center p-[7px_9px] gap-[8px] cursor-pointer"
              onClick={() => update({ tab: 'Studio' })}
            >
              <div
                className="flex-none w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[11px] font-semibold"
                style={{ background: card.iconBg, color: card.iconFg }}
              >
                {card.initial}
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[11.5px] font-semibold text-txt">
                  {card.provider}
                </span>
                <div className="flex items-center gap-[5px]">
                  <IconDot tone={tone} size={5} />
                  {card.connected ? (
                    <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10px] text-txt2">
                      {`${card.accountLabel} · ${card.quotas.length} quota`}
                    </span>
                  ) : (
                    <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10px] text-txt3">
                      No connections
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-none flex flex-col items-end">
                <span className="text-[12.5px] font-bold leading-[1.1]" style={{ color: toneColor(tone) }}>
                  {avail === '—' ? '—' : `${avail}%`}
                </span>
                <span className="text-[9.5px] text-txt3">available</span>
              </div>
              <Toggle size="quota" on={card.enabled} />
            </div>

            {card.connected && open && (
              <div className="flex flex-col gap-[6px] border-t border-bd2 pt-[6px] px-[9px] pb-[7px]">
                {card.quotas.map((row) => {
                  const pct = pctAvailable(row);
                  const rowTone = quotaTone(pct);
                  return (
                    <div key={row.label} className="flex flex-col gap-[6px]">
                      <div className="flex items-center gap-[6px]">
                        <IconDot tone={rowTone} size={5} />
                        <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10.5px] text-txt2">
                          {row.label}
                        </span>
                        <span className="flex-none text-[10px] font-v3-mono text-txt3">{`${row.used} / ${row.limit}`}</span>
                        <span
                          className="flex-none text-[10.5px] font-semibold font-v3-mono"
                          style={{ color: toneColor(rowTone) }}
                        >
                          {`${pct}%`}
                        </span>
                      </div>
                      <div className="flex items-center gap-[6px]">
                        <ProgressBar pct={pct} tone={rowTone} height={3} className="flex-1" />
                        <span className="flex-none text-[9.5px] text-txt3 w-[62px] text-right">{row.resetAt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-[8px]">
        <button
          type="button"
          onClick={() => update({ tab: 'Studio' })}
          className="flex-1 text-center text-[11px] p-[5px_8px] rounded-[5px] border border-bd text-txt2"
        >
          Thêm provider
        </button>
        <button
          type="button"
          className="flex-1 text-center text-[11px] p-[5px_8px] rounded-[5px] border border-bd text-txt2"
        >
          Routing
        </button>
      </div>
    </div>
  );
}
