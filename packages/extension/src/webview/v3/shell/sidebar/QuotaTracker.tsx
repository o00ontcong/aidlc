// v3/shell/sidebar/QuotaTracker.tsx — §4.1. Quota tracker card list.
import React from 'react';
import type { QuotaCardVM } from '../../data/types';
import { pctAvailable, quotaTone, cardAvailPct, cardTone } from '../../lib/quota';
import { toneColor } from '../../lib/tone';
import { relativeTimeFromNow } from '../../lib/relativeTime';
import { useUiStore } from '../../state/store';
import { useQuota } from '../../state/useQuota';
import { IconDot, ProgressBar, Toggle } from '../../components';

function SkeletonTracker() {
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[7px]">
        <span className="flex-none text-[10px] uppercase tracking-[.09em] font-semibold text-txt3">Quota tracker</span>
        <span className="flex-1 min-w-0 h-[10px] rounded-[3px] bg-panel2 animate-pulse" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="bg-panel2 rounded-[7px] h-[36px] border border-bd2 animate-pulse" />
      ))}
    </div>
  );
}

function cardTitle(card: QuotaCardVM): string | undefined {
  if (card.status === 'error') return card.error ?? 'Probe failed';
  if (card.status === 'not-connected' && card.detectionReason) return card.detectionReason;
  if (card.connected && card.quotas.length === 0) return 'Provider không expose hạn mức (unknown)';
  return undefined;
}

export function QuotaTracker() {
  const { state, update } = useUiStore();
  const { quota, loading, refreshing, refresh, setEnabled } = useQuota();
  const open = state.quotaOpen;

  if (loading || !quota) return <SkeletonTracker />;

  const { cards, connectedCount, notConnectedCount } = quota;

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[7px]">
        <span className="flex-none text-[10px] uppercase tracking-[.09em] font-semibold text-txt3">Quota tracker</span>
        <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10.5px] text-txt3">
          {`${connectedCount} connected · ${notConnectedCount} chưa nối`}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          title="Refresh quota"
          className={`flex-none text-[10px] text-txt3 ${refreshing ? 'opacity-50' : ''}`}
        >
          {refreshing ? '⟳' : '↻'}
        </button>
        <button
          type="button"
          onClick={() => update({ quotaOpen: !open })}
          className="flex-none text-[10px] text-txt3"
        >
          {open ? '▾' : '▸'}
        </button>
      </div>

      {cards.map((card) => {
        const tone = cardTone(card);
        const avail = cardAvailPct(card);
        const isLoading = card.status === 'loading';
        const isError = card.status === 'error';
        const stale = card.status === 'stale' ? relativeTimeFromNow(card.lastProbedAt) : '';
        const title = cardTitle(card);

        return (
          <div
            key={card.provider}
            className={`bg-panel2 rounded-[7px] overflow-hidden border ${card.connected ? 'border-bd' : 'border-bd2'}`}
          >
            <div
              className="flex items-center p-[7px_9px] gap-[8px] cursor-pointer"
              onClick={() => update({ tab: 'Studio' })}
              title={title}
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
                  <IconDot tone={isError ? 'err' : tone} size={5} />
                  {isLoading ? (
                    <span className="flex-1 min-w-0 h-[10px] rounded-[3px] bg-bd2 animate-pulse" />
                  ) : isError ? (
                    <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10px] text-err">
                      Probe failed
                    </span>
                  ) : card.connected ? (
                    <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10px] text-txt2">
                      {`${card.accountLabel ?? 'Account 1'} · ${card.quotas.length} quota`}
                      {stale ? ` · cập nhật ${stale}` : ''}
                    </span>
                  ) : (
                    <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[10px] text-txt3">
                      No connections
                    </span>
                  )}
                </div>
              </div>
              {!isLoading && (
                <div className="flex-none flex flex-col items-end">
                  <span className="text-[12.5px] font-bold leading-[1.1]" style={{ color: toneColor(isError ? 'err' : tone) }}>
                    {avail === '—' ? '—' : `${avail}%`}
                  </span>
                  <span className="text-[9.5px] text-txt3">available</span>
                </div>
              )}
              <Toggle
                size="quota"
                on={card.enabled}
                onClick={(event) => {
                  event.stopPropagation();
                  if (card.id) void setEnabled(card.id, !card.enabled);
                }}
              />
            </div>

            {card.connected && open && card.quotas.length > 0 && (
              <div className="flex flex-col gap-[6px] border-t border-bd2 pt-[6px] px-[9px] pb-[7px]">
                {card.quotas.map((row) => {
                  const pct = pctAvailable(row);
                  const rowTone = quotaTone(pct);
                  const estimated = row.confidence === 'estimated';
                  const rowTitle = `source: ${row.source ?? 'unknown'} · confidence: ${row.confidence ?? 'unknown'}`;
                  return (
                    <div key={row.label} className="flex flex-col gap-[6px]" title={rowTitle}>
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
                          {estimated ? `~${pct}%` : `${pct}%`}
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
