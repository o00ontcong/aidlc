/**
 * Status write-back mapping: which AIDLC event moves a ticket to which Jira
 * status.
 *
 * This exists instead of sending the user to raw VS Code settings because the
 * four events are a *sequence* — the useful question is "what happens to my
 * ticket as the run progresses", and four separate settings rows do not answer
 * it. It also puts the two non-obvious rules next to the controls they explain:
 * status names are resolved per issue, and a move into Done always asks.
 *
 * Status inputs are free text, deliberately. The valid destinations differ per
 * issue (a workflow decides them), so any dropdown we built would be a guess.
 * Instead the statuses actually seen in this sprint are offered as suggestions.
 */

import { AlertTriangle, X } from 'lucide-react';

import type { SprintState } from '@/lib/types';
import { cn } from '@/lib/utils';

type MappingKey = 'taskCreated' | 'review' | 'runCompleted' | 'runFailed';

const ROWS: Array<{ key: MappingKey; event: string; note: string }> = [
  { key: 'taskCreated', event: 'task được tạo từ ticket', note: 'chỉ khi ticket chưa bắt đầu' },
  { key: 'review', event: 'run tới bước review đầu tiên', note: 'bỏ qua nếu ticket đã ở đó hoặc xa hơn' },
  { key: 'runCompleted', event: 'run completed', note: 'chuyển sang Done thì luôn hỏi' },
  { key: 'runFailed', event: 'run failed / bị reject', note: 'mặc định không làm gì' },
];

export interface JiraTransitionMapPanelProps {
  sprint: SprintState;
  onChange: (patch: {
    enabled?: boolean;
    confirm?: boolean;
    mapping?: Partial<Record<MappingKey, string>>;
  }) => void;
  onClose: () => void;
}

export function JiraTransitionMapPanel({ sprint, onChange, onClose }: JiraTransitionMapPanelProps) {
  const enabled = sprint.transitionsEnabled;
  // Statuses seen in this sprint — real destinations on this board, which beats
  // a hardcoded list of Jira's defaults.
  const seen = [...new Set(sprint.tickets.map((ticket) => ticket.status).filter(Boolean))];

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Jira · ghi ngược trạng thái</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Đẩy tiến độ pipeline lên ticket. Ghi vào board của cả team, nên mặc định tắt.
            </p>
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11.5px] text-muted-foreground">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => onChange({ enabled: event.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
            />
            Bật cho project này
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <table className={cn('w-full border-collapse text-xs', !enabled && 'opacity-50')}>
          <thead>
            <tr>
              <th className="w-[38%] border-b border-border bg-surface/40 px-3 py-2 text-left font-mono text-[9.5px] font-normal uppercase tracking-[0.09em] text-muted-foreground">
                Sự kiện AIDLC
              </th>
              <th className="w-[4%] border-b border-border bg-surface/40" />
              <th className="w-[30%] border-b border-border bg-surface/40 px-3 py-2 text-left font-mono text-[9.5px] font-normal uppercase tracking-[0.09em] text-muted-foreground">
                Trạng thái Jira
              </th>
              <th className="border-b border-border bg-surface/40 px-3 py-2 text-left font-mono text-[9.5px] font-normal uppercase tracking-[0.09em] text-muted-foreground">
                Ghi chú
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="border-b border-border/50 px-3 py-2 font-mono text-[11px] text-foreground">
                  {row.event}
                </td>
                <td className="border-b border-border/50 text-center text-muted-foreground">→</td>
                <td className="border-b border-border/50 px-3 py-2">
                  <input
                    type="text"
                    list="aidlc-jira-statuses"
                    disabled={!enabled}
                    value={sprint.transitionMapping[row.key] ?? ''}
                    onChange={(event) => onChange({ mapping: { [row.key]: event.target.value } })}
                    placeholder="(không đổi)"
                    spellCheck={false}
                    className="w-full rounded border border-border bg-input/50 px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:cursor-not-allowed"
                  />
                </td>
                <td className="border-b border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
                  {row.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="aidlc-jira-statuses">
          {seen.map((status) => <option key={status} value={status} />)}
        </datalist>

        <div className="grid gap-2.5 px-4 py-3">
          <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Tên trạng thái được resolve theo <b>transition khả dụng của từng issue</b>, không
              hardcode id — workflow mỗi project mỗi khác. Không tìm thấy transition thì bỏ qua và
              cảnh báo; run không bao giờ bị ảnh hưởng.
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted-foreground">
            <input
              type="checkbox"
              checked={sprint.transitionConfirm}
              disabled={!enabled}
              onChange={(event) => onChange({ confirm: event.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
            />
            Hỏi trước mỗi lần chuyển
            <span className="text-muted-foreground/70">— chuyển sang Done thì luôn hỏi, kể cả khi tắt</span>
          </label>
          <p className="text-[11px] text-muted-foreground">
            Mọi lần ghi đều có một dòng trong Output channel “AIDLC” và một entry trong{' '}
            <code className="font-mono">docs/epics/&lt;ID&gt;/jira.json</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
