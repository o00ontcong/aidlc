/**
 * The Sprint tab's non-happy paths: not connected, loading, failed, empty.
 *
 * These are drawn as first-class states rather than an afterthought because an
 * integration spends real time in them, and each needs a *different* next
 * action. Collapsing them into one "something went wrong" box is what makes an
 * expired token feel like a permissions problem.
 */

import { AlertTriangle, KeyRound, Loader2, Plug, RefreshCw, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const TOKEN_DOCS = 'https://id.atlassian.com/manage-profile/security/api-tokens';

function Centered({ icon, title, body, actions }: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {body && <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{body}</p>}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
    >
      {children}
    </button>
  );
}

/**
 * Nothing configured yet. Lists exactly what is missing rather than a generic
 * "configure Jira", so the user knows whether they need a token or just an email.
 */
export function SprintUnconfigured({ missing, onConnect, onOpenDocs }: {
  missing: string[];
  onConnect: () => void;
  onOpenDocs: (url: string) => void;
}) {
  return (
    <Centered
      icon={<Plug className="h-5 w-5" />}
      title="Chưa kết nối Jira"
      body={
        <>
          Cần {missing.length > 0 ? <b>{missing.join(', ')}</b> : 'site, email và API token'} để đọc
          sprint. Token lưu trong VS Code SecretStorage, không vào <code className="font-mono">settings.json</code>.
          {' '}Chỉ hỗ trợ Jira Cloud.
        </>
      }
      actions={
        <>
          <PrimaryButton onClick={onConnect}>
            <KeyRound className="h-3.5 w-3.5" />
            Kết nối Jira
          </PrimaryButton>
          <SecondaryButton onClick={() => onOpenDocs(TOKEN_DOCS)}>Cách tạo token ↗</SecondaryButton>
        </>
      }
    />
  );
}

/** Skeleton rows — shown only when there is no cache to display instead. */
export function SprintLoading() {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-3" style={{ opacity: 1 - row * 0.15 }}>
          <div className="h-3 w-16 shrink-0 animate-pulse rounded bg-secondary" />
          <div className="h-3 flex-1 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-12 shrink-0 animate-pulse rounded bg-secondary" />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        Đang tải sprint đang mở…
      </div>
    </div>
  );
}

/**
 * Error banner. Sits above cached tickets when there are any, so the user can
 * still read them — the list itself goes read-only, which the caller enforces.
 */
export function SprintErrorBanner({ message, remedy, showingCache, onRetry, onConnect }: {
  message: string;
  remedy: string;
  showingCache: boolean;
  onRetry: () => void;
  onConnect: () => void;
}) {
  return (
    <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <div className="flex gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-destructive">{message}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {remedy}
            {showingCache && ' Danh sách dưới đây là bản cache — chỉ để xem, không tạo task từ đây.'}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/25"
            >
              <KeyRound className="h-3 w-3" />
              Cập nhật token
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent"
            >
              <RefreshCw className="h-3 w-3" />
              Thử lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Connected, but nothing to show. Distinguishes "no tickets assigned to me" from
 * "this sprint is empty" — the first has an obvious next move (look at the whole
 * team), the second does not.
 */
export function SprintEmpty({ scope, sprintName, hasFilter, onShowTeam, onClearFilter, onRefresh }: {
  scope: 'mine' | 'team';
  sprintName?: string;
  hasFilter: boolean;
  onShowTeam: () => void;
  onClearFilter: () => void;
  onRefresh: () => void;
}) {
  if (hasFilter) {
    return (
      <Centered
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Không ticket nào khớp filter"
        actions={<SecondaryButton onClick={onClearFilter}>Bỏ filter</SecondaryButton>}
      />
    );
  }
  return (
    <Centered
      icon={<Users className="h-5 w-5" />}
      title={
        scope === 'mine'
          ? `Không có ticket nào assign cho bạn${sprintName ? ` trong ${sprintName}` : ''}`
          : `Sprint${sprintName ? ` ${sprintName}` : ''} chưa có ticket nào`
      }
      actions={
        <>
          {scope === 'mine' && <PrimaryButton onClick={onShowTeam}>Xem cả team</PrimaryButton>}
          <SecondaryButton onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </SecondaryButton>
        </>
      }
    />
  );
}

/** No sprint at all on the chosen board. */
export function SprintNoSprint({ boardName, onSelectBoard }: {
  boardName?: string;
  onSelectBoard: () => void;
}) {
  return (
    <Centered
      icon={<AlertTriangle className="h-5 w-5" />}
      title={`Board${boardName ? ` ${boardName}` : ''} không có sprint nào đang mở`}
      body="Board này chưa có sprint active hoặc future. Chọn board khác, hoặc mở sprint trên Jira."
      actions={<SecondaryButton onClick={onSelectBoard}>Đổi board</SecondaryButton>}
    />
  );
}

/** Small inline status pill used by list and detail. */
export function StatusPill({ status, category }: { status: string; category: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium',
        category === 'done' && 'border border-primary/40 bg-primary/15 text-primary',
        category === 'inprogress' && 'border border-info/40 bg-info/15 text-info',
        category === 'todo' && 'bg-secondary text-muted-foreground',
      )}
    >
      {status || '—'}
    </span>
  );
}
