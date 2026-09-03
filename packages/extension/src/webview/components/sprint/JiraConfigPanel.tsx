/**
 * Jira config dialog — the `aidlc.jira.*` block, editable where it is used.
 *
 * This exists instead of sending the user to raw VS Code settings because the
 * Sprint tab is where a wrong value shows up: an empty list is usually a board
 * id, a project key or a JQL override, and settings.json does not tell you
 * which. Everything that decides *what the tab reads* is on one screen here.
 *
 * ## Two halves, deliberately different
 *
 * Site, email and token are the *credential*: they only mean anything verified
 * together, so they are read-only here and edited through the connect dialog,
 * which checks them against Jira before storing. The token is never shown — it
 * lives in SecretStorage and is only ever written.
 *
 * The rest is plain configuration. It is edited locally and written on Save
 * rather than per keystroke: saving fires the config watcher, which forces a
 * sprint refresh, and a refresh per character is a network call per character.
 */

import { useState } from 'react';
import { ExternalLink, KeyRound, X } from 'lucide-react';

import type { SprintState } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Only the fields the user actually changed are sent, so Save writes a small diff. */
export interface JiraConfigPatch {
  projectKey?: string;
  boardId?: number;
  jql?: string;
  refreshMinutes?: number;
  requestTimeoutSeconds?: number;
  subtasksEnabled?: boolean;
}

export interface JiraConfigPanelProps {
  sprint: SprintState;
  onSave: (patch: JiraConfigPatch) => void;
  /** Open the connect dialog — the only path that touches site / email / token. */
  onReconnect: () => void;
  /** Fall back to the raw settings UI, for the keys not surfaced here. */
  onOpenSettings: () => void;
  onClose: () => void;
}

export function JiraConfigPanel({
  sprint, onSave, onReconnect, onOpenSettings, onClose,
}: JiraConfigPanelProps) {
  const saved = sprint.config;
  const [projectKey, setProjectKey] = useState(saved.projectKey);
  const [boardId, setBoardId] = useState(String(saved.boardId || ''));
  const [jql, setJql] = useState(saved.jql);
  const [refreshMinutes, setRefreshMinutes] = useState(String(saved.refreshMinutes));
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(saved.requestTimeoutSeconds));
  const [subtasksEnabled, setSubtasksEnabled] = useState(sprint.subtasksEnabled);

  const boardError = numberError(boardId, 0, 'Board id');
  const refreshError = numberError(refreshMinutes, 0, 'Số phút');
  // Required, unlike the other two: an empty board id means "no board pinned"
  // and an empty refresh means "manual only", but an empty timeout has no
  // sensible reading — and falling back to the minimum would be a 1s timeout
  // that fails every call.
  const timeoutError = numberError(timeoutSeconds, 1, 'Số giây', true);
  const invalid = Boolean(boardError || refreshError || timeoutError);

  const patch: JiraConfigPatch = {};
  if (projectKey.trim() !== saved.projectKey) { patch.projectKey = projectKey.trim(); }
  if (jql.trim() !== saved.jql) { patch.jql = jql.trim(); }
  if (!boardError && numberOf(boardId, 0) !== saved.boardId) {
    patch.boardId = numberOf(boardId, 0);
  }
  if (!refreshError && numberOf(refreshMinutes, 0) !== saved.refreshMinutes) {
    patch.refreshMinutes = numberOf(refreshMinutes, 0);
  }
  if (!timeoutError && numberOf(timeoutSeconds, 1) !== saved.requestTimeoutSeconds) {
    patch.requestTimeoutSeconds = numberOf(timeoutSeconds, 1);
  }
  if (subtasksEnabled !== sprint.subtasksEnabled) { patch.subtasksEnabled = subtasksEnabled; }

  const dirty = Object.keys(patch).length > 0;

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/70 p-6 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { onClose(); }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (invalid || !dirty) { return; }
          onSave(patch);
        }}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">Jira · cấu hình</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Các giá trị này quyết định Sprint tab đọc gì. Lưu ở scope Workspace —{' '}
              <code className="font-mono">.vscode/settings.json</code> của project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-4 py-3.5">
          <Section label="Kết nối">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface/40 px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-mono text-[11.5px] text-foreground">
                  {sprint.connect.site || '(chưa đặt site)'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {sprint.connect.email || '(chưa đặt email)'} · token trong SecretStorage
                </div>
              </div>
              <button
                type="button"
                onClick={onReconnect}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11.5px] text-foreground hover:bg-accent"
              >
                <KeyRound className="h-3 w-3" />
                Đổi / kết nối lại
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              Site, email và token chỉ có nghĩa khi đi cùng nhau, nên chúng sửa qua dialog kết
              nối — chỗ duy nhất xác thực với Jira trước khi lưu.
            </p>
          </Section>

          <Section label="Truy vấn">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Project key"
                hint="Dùng để tìm board. Rỗng = mọi project account thấy."
              >
                <input
                  type="text"
                  value={projectKey}
                  onChange={(event) => setProjectKey(event.target.value)}
                  placeholder="ACME"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(inputClass, 'font-mono')}
                />
              </Field>
              <Field
                label="Board id"
                hint={boardsHint(sprint)}
                error={boardError}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={boardId}
                  onChange={(event) => setBoardId(event.target.value)}
                  placeholder="0"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(inputClass, 'font-mono')}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field
                label="JQL override"
                hint="Rỗng = query mặc định (assignee = currentUser() AND sprint IN openSprints()). Có giá trị thì thay thế toàn bộ, kể cả board/sprint đang chọn."
              >
                <textarea
                  value={jql}
                  onChange={(event) => setJql(event.target.value)}
                  rows={2}
                  placeholder="project = ACME AND sprint IN openSprints()"
                  spellCheck={false}
                  className={cn(inputClass, 'resize-y font-mono')}
                />
              </Field>
            </div>
          </Section>

          <Section label="Đồng bộ">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Refresh (phút)"
                hint="Cache cũ hơn mức này thì fetch lại. 0 = chỉ refresh tay."
                error={refreshError}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={refreshMinutes}
                  onChange={(event) => setRefreshMinutes(event.target.value)}
                  spellCheck={false}
                  className={cn(inputClass, 'font-mono')}
                />
              </Field>
              <Field
                label="Timeout (giây)"
                hint="Cho mỗi request Jira / Confluence."
                error={timeoutError}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={timeoutSeconds}
                  onChange={(event) => setTimeoutSeconds(event.target.value)}
                  spellCheck={false}
                  className={cn(inputClass, 'font-mono')}
                />
              </Field>
            </div>
          </Section>

          <Section label="Ghi lên Jira">
            <label className="flex cursor-pointer items-start gap-2 text-[11.5px] text-foreground">
              <input
                type="checkbox"
                checked={subtasksEnabled}
                onChange={(event) => setSubtasksEnabled(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-primary)]"
              />
              <span>
                Cho phép tạo subtask từ template
                <span className="block text-[10.5px] text-muted-foreground">
                  Mặc định tắt — đây là ghi lên board cả team đang xem. Ngoài subtask, AIDLC
                  không tự động thay đổi gì trên Jira.
                </span>
              </span>
            </label>
          </Section>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-surface/40 px-4 py-3">
          <button
            type="submit"
            disabled={invalid || !dirty}
            className={cn(
              'rounded-md px-3 py-2 text-xs font-semibold',
              invalid || !dirty
                ? 'cursor-not-allowed border border-border bg-secondary text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {dirty ? 'Huỷ' : 'Đóng'}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
          >
            Mở toàn bộ setting aidlc.jira
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass = 'w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] '
  + 'text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none '
  + 'focus:ring-1 focus:ring-primary/40';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, error, children }: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className={cn(
          'mb-1 block font-mono text-[9.5px] uppercase tracking-[0.1em]',
          error ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {children}
      {error
        ? <span className="mt-1 block text-[10.5px] text-destructive">{error}</span>
        : hint ? <span className="mt-1 block text-[10.5px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/**
 * Board ids are opaque, so the hint names the boards this account can actually
 * see — that is the list the number has to come from.
 */
function boardsHint(sprint: SprintState): string {
  if (sprint.boards.length === 0) { return '0 = board đầu tiên account thấy.'; }
  const names = sprint.boards.slice(0, 4).map((board) => `${board.name} #${board.id}`).join(', ');
  const more = sprint.boards.length > 4 ? `, +${sprint.boards.length - 4} board nữa` : '';
  return `0 = board đầu tiên. Đang thấy: ${names}${more}.`;
}

/** Empty counts as the minimum, so clearing a field is not an error state. */
function numberOf(raw: string, min: number): number {
  const value = Number(raw.trim());
  if (!raw.trim()) { return min; }
  return Math.max(min, Math.round(value));
}

function numberError(raw: string, min: number, subject: string, required = false): string {
  const text = raw.trim();
  if (!text) { return required ? `Nhập ${subject.toLowerCase()}` : ''; }
  const value = Number(text);
  if (!Number.isFinite(value)) { return `${subject} phải là số`; }
  if (value < min) { return `${subject} nhỏ nhất là ${min}`; }
  return '';
}
