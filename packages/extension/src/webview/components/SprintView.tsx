/**
 * Sprint tab — my Jira tickets for the running sprint, and the one click that
 * turns one into an AIDLC task.
 *
 * State ownership: the host is the only writer of {@link SprintState}. This
 * component holds nothing but view-local choices (which ticket is selected, the
 * status filter, the search box) and asks the host for everything else. That is
 * why a refresh cannot lose the user's place, and why filtering never disagrees
 * with what the host believes it fetched.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw, Search, Settings2 } from 'lucide-react';

import { onHostMessage, postMessage } from '@/lib/bridge';
import type { SprintState, SprintTicket, SubtaskCreateOutcome, SubtaskPlan } from '@/lib/types';
import { cn } from '@/lib/utils';

import {
  SprintEmpty,
  SprintErrorBanner,
  SprintLoading,
  SprintNoSprint,
  SprintUnconfigured,
} from './sprint/SprintEmptyStates';
import { JiraConnectModal, type JiraConnectResult } from './sprint/JiraConnectModal';
import { JiraTransitionMapPanel } from './sprint/JiraTransitionMapPanel';
import { SubtaskPreviewPanel } from './sprint/SubtaskPreviewPanel';
import { SprintTicketDetail } from './sprint/SprintTicketDetail';
import { SprintTicketList } from './sprint/SprintTicketList';

/** Advice per error kind. Mirrors `remedyFor` in jiraSprintLogic. */
const REMEDY: Record<string, string> = {
  auth: 'Cập nhật API token.',
  forbidden: 'Account thiếu quyền — kiểm tra quyền project trên Jira.',
  not_found: 'Kiểm tra lại board / sprint đã chọn.',
  rate_limited: 'Jira đang giới hạn tốc độ — thử lại sau một lúc.',
  timeout: 'Kiểm tra mạng, rồi thử lại.',
  network: 'Kiểm tra mạng, rồi thử lại.',
  bad_request: 'JQL hoặc cấu hình sai.',
};

const GROUP_ORDER = ['in_progress', 'todo', 'closing'] as const;

export function SprintView({ state }: { state: SprintState | undefined }) {
  const sprint = state ?? {
    status: 'unconfigured' as const,
    boards: [],
    sprints: [],
    tickets: [],
    scope: 'mine' as const,
    transitionsEnabled: false,
    subtasksEnabled: false,
    transitionMapping: { taskCreated: '', review: '', runCompleted: '', runFailed: '' },
    transitionConfirm: true,
    connect: { site: '', email: '' },
  };

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sprintMenuOpen, setSprintMenuOpen] = useState(false);
  const [mapPanelOpen, setMapPanelOpen] = useState(false);
  const [subtaskFor, setSubtaskFor] = useState<string | null>(null);
  const [subtaskPlan, setSubtaskPlan] = useState<SubtaskPlan | null>(null);
  const [subtaskResult, setSubtaskResult] = useState<SubtaskCreateOutcome | null>(null);
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectResult, setConnectResult] = useState<JiraConnectResult | null>(null);

  // Ask for fresh data when the tab mounts. The host decides whether that means
  // a network call or a cache hit, so this is cheap to fire unconditionally.
  useEffect(() => {
    postMessage({ type: 'sprintRefresh' });
  }, []);

  // Subtask planning and creation both round-trip through the host: the webview
  // never builds a Jira payload, it only says which domains the user ticked.
  useEffect(() => onHostMessage((msg) => {
    if (msg.type === 'subtaskDrafts') {
      setSubtaskPlan(msg as unknown as SubtaskPlan);
      setSubtaskBusy(false);
    }
    if (msg.type === 'sprintConnectResult') {
      const result = msg as unknown as JiraConnectResult;
      setConnectResult(result);
      setConnectBusy(false);
      // Leave the dialog up briefly on success so the confirmation is seen, then
      // get out of the way — the tab behind it is already reloading.
      if (result.ok) { setTimeout(() => setConnectOpen(false), 900); }
    }
    if (msg.type === 'subtaskCreateResult') {
      setSubtaskResult(msg as unknown as SubtaskCreateOutcome);
      setSubtaskBusy(false);
      // Re-plan so created drafts flip to their "already on Jira" state.
      postMessage({ type: 'sprintPlanSubtasks', key: (msg as { ticketKey?: string }).ticketKey });
    }
  }), []);

  const openConnect = () => {
    setConnectResult(null);
    setConnectBusy(false);
    setConnectOpen(true);
  };

  const openSubtaskPanel = (key: string) => {
    setSubtaskFor(key);
    setSubtaskPlan(null);
    setSubtaskResult(null);
    setSubtaskBusy(true);
    postMessage({ type: 'sprintPlanSubtasks', key });
  };

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sprint.tickets.filter((ticket) => {
      if (statusFilter === 'unlinked' && ticket.linkedEpicId) { return false; }
      if (statusFilter !== 'all' && statusFilter !== 'unlinked' && ticket.status !== statusFilter) {
        return false;
      }
      if (!query) { return true; }
      return ticket.key.toLowerCase().includes(query)
        || ticket.summary.toLowerCase().includes(query);
    });
  }, [sprint.tickets, statusFilter, search]);

  // Keep a valid selection without fighting the user: default to the first
  // visible ticket, and drop a selection that filtering removed.
  useEffect(() => {
    if (visible.length === 0) {
      if (selectedKey !== null) { setSelectedKey(null); }
      return;
    }
    if (!selectedKey || !visible.some((ticket) => ticket.key === selectedKey)) {
      setSelectedKey(visible[0].key);
    }
  }, [visible, selectedKey]);

  const selected = visible.find((ticket) => ticket.key === selectedKey) ?? null;
  const counts = useMemo(() => countByStatus(sprint.tickets), [sprint.tickets]);
  const groups = useMemo(() => GROUP_ORDER.map((id) => ({
    id,
    tickets: visible.filter((ticket) => bucketOf(ticket) === id),
  })), [visible]);

  // The host decides this — a cache inside its refresh window is trustworthy,
  // so "came from cache" alone must not disable the tab's primary action.
  const stale = Boolean(sprint.stale);
  const hasFilter = statusFilter !== 'all' || search.trim().length > 0;

  const refresh = (force = true) => postMessage({ type: 'sprintRefresh', force });
  const clearFilter = () => { setStatusFilter('all'); setSearch(''); };

  if (sprint.status === 'unconfigured') {
    return (
      <div className="relative flex-1 overflow-y-auto">
        <SprintUnconfigured
          missing={sprint.missing ?? []}
          onConnect={openConnect}
          onOpenDocs={(url) => postMessage({ type: 'openExternalUrl', url })}
        />
        {connectOpen && renderConnectModal()}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {connectOpen && renderConnectModal()}
      {mapPanelOpen && (
        <JiraTransitionMapPanel
          sprint={sprint}
          onChange={(patch) => postMessage({ type: 'sprintSetTransitionConfig', ...patch })}
          onClose={() => setMapPanelOpen(false)}
        />
      )}
      {subtaskFor && (
        <SubtaskPreviewPanel
          ticketKey={subtaskFor}
          plan={subtaskPlan}
          result={subtaskResult}
          enabled={sprint.subtasksEnabled}
          busy={subtaskBusy}
          onCreate={(domains) => {
            setSubtaskBusy(true);
            setSubtaskResult(null);
            postMessage({ type: 'sprintCreateSubtasks', key: subtaskFor, domains });
          }}
          onEnable={() => postMessage({ type: 'sprintSetSubtasksEnabled', enabled: true })}
          onImportTemplate={() => postMessage({ type: 'sprintImportTemplate' })}
          onOpenExternal={(key) => postMessage({ type: 'sprintOpenIssue', key })}
          onClose={() => { setSubtaskFor(null); setSubtaskPlan(null); setSubtaskResult(null); }}
        />
      )}
      <SprintHeader
        sprint={sprint}
        busy={sprint.status === 'loading'}
        menuOpen={sprintMenuOpen}
        onToggleMenu={() => setSprintMenuOpen((open) => !open)}
        onSelectSprint={(sprintId) => {
          setSprintMenuOpen(false);
          postMessage({ type: 'sprintSelectSprint', sprintId });
        }}
        onSelectBoard={(boardId) => {
          setSprintMenuOpen(false);
          postMessage({ type: 'sprintSelectBoard', boardId });
        }}
        onRefresh={() => refresh()}
        onSettings={() => setMapPanelOpen(true)}
      />

      <FilterBar
        scope={sprint.scope}
        counts={counts}
        unlinked={sprint.tickets.filter((ticket) => !ticket.linkedEpicId).length}
        total={sprint.tickets.length}
        active={statusFilter}
        search={search}
        onScope={(scope) => postMessage({ type: 'sprintSetScope', scope })}
        onFilter={setStatusFilter}
        onSearch={setSearch}
      />

      {sprint.status === 'error' && (
        <SprintErrorBanner
          message={sprint.errorMessage ?? 'Không đọc được dữ liệu Jira.'}
          remedy={REMEDY[sprint.errorKind ?? ''] ?? 'Xem Output channel “AIDLC” để biết chi tiết.'}
          showingCache={sprint.tickets.length > 0}
          onRetry={() => refresh()}
          onConnect={openConnect}
        />
      )}

      {renderBody()}
    </div>
  );

  function renderConnectModal() {
    return (
      <JiraConnectModal
        initialSite={sprint.connect.site}
        initialEmail={sprint.connect.email}
        busy={connectBusy}
        result={connectResult}
        onSubmit={(values) => {
          setConnectBusy(true);
          setConnectResult(null);
          postMessage({ type: 'sprintConnectSubmit', ...values });
        }}
        onOpenDocs={(url) => postMessage({ type: 'openExternalUrl', url })}
        onClose={() => { setConnectOpen(false); setConnectResult(null); }}
      />
    );
  }

  function renderBody() {
    if (sprint.status === 'loading' && sprint.tickets.length === 0) {
      return <SprintLoading />;
    }
    if (sprint.status !== 'error' && sprint.board && !sprint.sprint && sprint.tickets.length === 0) {
      return (
        <SprintNoSprint
          boardName={sprint.board.name}
          onSelectBoard={() => setSprintMenuOpen(true)}
        />
      );
    }
    if (visible.length === 0) {
      return (
        <SprintEmpty
          scope={sprint.scope}
          sprintName={sprint.sprint?.name}
          hasFilter={hasFilter}
          onShowTeam={() => postMessage({ type: 'sprintSetScope', scope: 'team' })}
          onClearFilter={clearFilter}
          onRefresh={() => refresh()}
        />
      );
    }
    return (
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="min-h-0 border-border lg:border-r">
          <SprintTicketList
            groups={groups}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onOpenLinked={(epicId) => postMessage({ type: 'sprintOpenLinkedTask', epicId })}
          />
        </div>
        <div className="min-h-0 bg-card">
          <SprintTicketDetail
            ticket={selected}
            stale={stale}
            subtasksEnabled={sprint.subtasksEnabled}
            transitionsEnabled={sprint.transitionsEnabled}
            onStartTask={(ticket) => postMessage({ type: 'sprintStartTask', key: ticket.key })}
            onOpenLinked={(epicId) => postMessage({ type: 'sprintOpenLinkedTask', epicId })}
            onOpenExternal={(url) => postMessage({ type: 'openExternalUrl', url })}
            onCopyKey={(key) => postMessage({ type: 'copyCommand', command: key })}
            onOpenTransitionSettings={() => setMapPanelOpen(true)}
            onOpenSubtasks={() => openSubtaskPanel(selected!.key)}
          />
        </div>
      </div>
    );
  }
}

function SprintHeader({
  sprint, busy, menuOpen, onToggleMenu, onSelectSprint, onSelectBoard, onRefresh, onSettings,
}: {
  sprint: SprintState;
  busy: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelectSprint: (sprintId: number) => void;
  onSelectBoard: (boardId: number) => void;
  onRefresh: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="relative border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleMenu}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-accent"
        >
          {sprint.sprint?.name ?? 'Chưa có sprint'}
          {sprint.board && (
            <span className="text-[11px] font-normal text-muted-foreground">· {sprint.board.name}</span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>

        {sprint.sprint && (
          <span className="text-[11.5px] text-muted-foreground">{describeWindow(sprint.sprint)}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {busy
              ? 'đang đồng bộ…'
              : sprint.lastSyncedAt
                ? `đồng bộ ${describeAge(sprint.lastSyncedAt)}`
                  + (sprint.fromCache ? (sprint.stale ? ' · cache cũ' : ' · cache') : '')
                : ''}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={onSettings}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="h-3 w-3" />
            Jira settings
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="absolute left-4 top-full z-20 mt-1 w-72 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <MenuSection label="Sprint">
            {sprint.sprints.length === 0
              ? <MenuEmpty>Không có sprint active / future</MenuEmpty>
              : sprint.sprints.map((option) => (
                <MenuItem
                  key={option.id}
                  active={option.id === sprint.sprint?.id}
                  onClick={() => onSelectSprint(option.id)}
                >
                  {option.name}
                  <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">{option.state}</span>
                </MenuItem>
              ))}
          </MenuSection>
          <MenuSection label="Board">
            {sprint.boards.length === 0
              ? <MenuEmpty>Account không thấy board scrum nào</MenuEmpty>
              : sprint.boards.map((board) => (
                <MenuItem
                  key={board.id}
                  active={board.id === sprint.board?.id}
                  onClick={() => onSelectBoard(board.id)}
                >
                  {board.name}
                  <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">#{board.id}</span>
                </MenuItem>
              ))}
          </MenuSection>
        </div>
      )}
    </div>
  );
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-2 pb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function MenuItem({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-accent',
        active ? 'font-semibold text-primary' : 'text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function MenuEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{children}</div>;
}

function FilterBar({
  scope, counts, unlinked, total, active, search, onScope, onFilter, onSearch,
}: {
  scope: 'mine' | 'team';
  counts: Array<{ status: string; count: number }>;
  unlinked: number;
  total: number;
  active: string;
  search: string;
  onScope: (scope: 'mine' | 'team') => void;
  onFilter: (value: string) => void;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface/40 px-4 py-2">
      <div className="flex overflow-hidden rounded-md border border-border bg-card">
        {(['mine', 'team'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onScope(option)}
            className={cn(
              'px-2.5 py-1 text-[11px]',
              option === 'mine' && 'border-r border-border',
              scope === option
                ? 'bg-primary/15 font-semibold text-primary'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {option === 'mine' ? 'Của tôi' : 'Cả team'}
          </button>
        ))}
      </div>

      <Chip label="Tất cả" count={total} active={active === 'all'} onClick={() => onFilter('all')} />
      {counts.map(({ status, count }) => (
        <Chip
          key={status}
          label={status}
          count={count}
          active={active === status}
          onClick={() => onFilter(status)}
        />
      ))}
      <Chip
        label="Chưa có task"
        count={unlinked}
        active={active === 'unlinked'}
        onClick={() => onFilter('unlinked')}
      />

      <div className="ml-auto flex min-w-[190px] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Lọc theo key hoặc tiêu đề…"
          spellCheck={false}
          className="w-full bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
        />
      </div>
    </div>
  );
}

function Chip({ label, count, active, onClick }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px]',
        active
          ? 'border-primary/40 bg-primary/15 text-primary'
          : 'border-border bg-card text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
      <span className="ml-1.5 font-mono text-[10px] opacity-70">{count}</span>
    </button>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Which list bucket a ticket belongs to — mirrors `groupTickets` on the host. */
function bucketOf(ticket: SprintTicket): 'in_progress' | 'todo' | 'closing' {
  if (ticket.statusCategory === 'done') { return 'closing'; }
  if (ticket.statusCategory === 'inprogress') { return 'in_progress'; }
  return 'todo';
}

function countByStatus(tickets: SprintTicket[]): Array<{ status: string; count: number }> {
  const byStatus = new Map<string, number>();
  for (const ticket of tickets) {
    const status = ticket.status || '—';
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }
  return [...byStatus.entries()].map(([status, count]) => ({ status, count }));
}

/**
 * `18 Aug → 01 Sep · còn 4 ngày`. The days-left figure is what makes the header
 * worth reading; dates alone need mental arithmetic.
 */
function describeWindow(sprint: NonNullable<SprintState['sprint']>): string {
  const start = formatDay(sprint.startDate);
  const end = formatDay(sprint.endDate);
  const window = start && end ? `${start} → ${end}` : start || end;
  const endMs = Date.parse(sprint.endDate);
  if (!Number.isFinite(endMs)) { return window; }
  const days = Math.ceil((endMs - Date.now()) / 86_400_000);
  if (days < 0) { return `${window} · đã quá hạn ${Math.abs(days)} ngày`; }
  if (days === 0) { return `${window} · hết hôm nay`; }
  return `${window} · còn ${days} ngày`;
}

function formatDay(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) { return ''; }
  return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function describeAge(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) { return ''; }
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) { return 'vừa xong'; }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) { return `${minutes} phút trước`; }
  const hours = Math.round(minutes / 60);
  if (hours < 24) { return `${hours} giờ trước`; }
  return `${Math.round(hours / 24)} ngày trước`;
}
