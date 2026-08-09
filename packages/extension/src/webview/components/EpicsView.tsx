import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Plus, Brain, FolderOpen, Pencil, Search, ChevronDown, Star, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceState, EpicSummary, EpicFilter } from '@/lib/types';
import { EpicCard, EPIC_DND_MIME } from './EpicCard';
import { StartEpicModal } from './StartEpicModal';
import { CharterBoard } from './CharterBoard';
import { AutonomousDeliveryModal } from './AutonomousDeliveryModal';
import { postMessage, onHostMessage } from '@/lib/bridge';

const FILTERS: { id: EpicFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'pending', label: 'Pending' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
];

/** Slice of Epics UI prefs persisted on the extension host (workspaceState). */
interface PersistedEpicsView {
  filter?: EpicFilter;
  search?: string;
  followOpen?: boolean;
  noFollowOpen?: boolean;
  followedIds?: string[];
}

function matchesFilter(epic: EpicSummary, filter: EpicFilter): boolean {
  if (filter === 'all') { return true; }
  return epic.status === filter;
}

function matchesSearch(epic: EpicSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) { return true; }
  return (
    epic.id.toLowerCase().includes(q) ||
    epic.title.toLowerCase().includes(q) ||
    (epic.description ?? '').toLowerCase().includes(q)
  );
}

function writeEpicsPersist(patch: PersistedEpicsView): void {
  postMessage({ type: 'persistEpicsUi', epicsView: patch });
}

export function EpicsView({ state }: { state: WorkspaceState }) {
  const seed = state.epicsViewUi ?? {};
  const [filter, setFilter] = useState<EpicFilter>(seed.filter ?? 'all');
  const [search, setSearch] = useState(seed.search ?? '');
  const [followOpen, setFollowOpen] = useState(seed.followOpen ?? true);
  const [noFollowOpen, setNoFollowOpen] = useState(seed.noFollowOpen ?? true);
  const [followedIds, setFollowedIds] = useState<Set<string>>(
    () => new Set(seed.followedIds ?? []),
  );
  const [startEpicOpen, setStartEpicOpen] = useState(false);
  const [autonomousDeliveryOpen, setAutonomousDeliveryOpen] = useState(false);
  const [dragEpicId, setDragEpicId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<'follow' | 'no-follow' | null>(null);

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'triggerStartEpic' || msg.type === 'openStartEpicModal') {
        setStartEpicOpen(true);
      }
    });
  }, []);

  // Drop stale follow ids when epics disappear.
  useEffect(() => {
    const live = new Set(state.epics.map((e) => e.id));
    setFollowedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) { next.add(id); }
        else { changed = true; }
      }
      if (!changed && next.size === prev.size) { return prev; }
      writeEpicsPersist({ followedIds: [...next] });
      return next;
    });
  }, [state.epics]);

  const persist = useCallback((patch: PersistedEpicsView) => {
    writeEpicsPersist(patch);
  }, []);

  const onFilterChange = (next: EpicFilter) => {
    setFilter(next);
    persist({ filter: next });
  };

  const onSearchChange = (next: string) => {
    setSearch(next);
    persist({ search: next });
  };

  const toggleFollowOpen = () => {
    const next = !followOpen;
    setFollowOpen(next);
    persist({ followOpen: next });
  };

  const toggleNoFollowOpen = () => {
    const next = !noFollowOpen;
    setNoFollowOpen(next);
    persist({ noFollowOpen: next });
  };

  const setFollowed = useCallback(
    (epicId: string, followed: boolean) => {
      setFollowedIds((prev) => {
        const next = new Set(prev);
        if (followed) { next.add(epicId); }
        else { next.delete(epicId); }
        persist({ followedIds: [...next] });
        return next;
      });
    },
    [persist],
  );

  const toggleFollow = useCallback(
    (epicId: string) => {
      setFollowed(epicId, !followedIds.has(epicId));
    },
    [followedIds, setFollowed],
  );

  const counts = useMemo(() => {
    const out: Record<EpicFilter, number> = {
      all: state.epics.length,
      in_progress: 0,
      pending: 0,
      done: 0,
      failed: 0,
    };
    for (const e of state.epics) { out[e.status] = (out[e.status] ?? 0) + 1; }
    return out;
  }, [state.epics]);

  const visible = useMemo(
    () =>
      state.epics.filter(
        (e) => matchesFilter(e, filter) && matchesSearch(e, search),
      ),
    [state.epics, filter, search],
  );

  const followed = useMemo(
    () => visible.filter((e) => followedIds.has(e.id)),
    [visible, followedIds],
  );
  const unfollowed = useMemo(
    () => visible.filter((e) => !followedIds.has(e.id)),
    [visible, followedIds],
  );

  const [editingDir, setEditingDir] = useState(false);
  const [dirDraft, setDirDraft] = useState(state.epicsDir);

  useEffect(() => { setDirDraft(state.epicsDir); }, [state.epicsDir]);

  const commitDirChange = () => {
    const val = dirDraft.trim();
    if (val && val !== state.epicsDir) {
      postMessage({ type: 'changeEpicsDir', dir: val });
    }
    setEditingDir(false);
  };

  const onSectionDragOver = (section: 'follow' | 'no-follow') => (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes(EPIC_DND_MIME) && dragEpicId === null) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== section) { setDropTarget(section); }
  };

  const onSectionDrop = (section: 'follow' | 'no-follow') => (e: DragEvent) => {
    e.preventDefault();
    const id =
      e.dataTransfer.getData(EPIC_DND_MIME) ||
      e.dataTransfer.getData('text/plain') ||
      dragEpicId;
    setDropTarget(null);
    setDragEpicId(null);
    if (!id) { return; }
    setFollowed(id, section === 'follow');
    if (section === 'follow' && !followOpen) {
      setFollowOpen(true);
      persist({ followOpen: true });
    }
    if (section === 'no-follow' && !noFollowOpen) {
      setNoFollowOpen(true);
      persist({ noFollowOpen: true });
    }
  };

  const emptyMessage = (() => {
    if (state.epics.length === 0) { return 'No epics yet.'; }
    if (visible.length === 0) {
      if (search.trim()) { return 'No epics match this search.'; }
      return `No ${filter.replace('_', ' ')} epics.`;
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">AIDLC Epics</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <FolderOpen className="h-3 w-3 shrink-0" />
            {editingDir ? (
              <span className="flex items-center gap-1">
                <input
                  type="text"
                  value={dirDraft}
                  autoFocus
                  onChange={(e) => setDirDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitDirChange(); }
                    if (e.key === 'Escape') { setEditingDir(false); setDirDraft(state.epicsDir); }
                  }}
                  onBlur={commitDirChange}
                  className="w-40 rounded border border-border bg-input/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="font-mono text-[11px]">{state.epicsDir}</span>
                <button
                  type="button"
                  onClick={() => setEditingDir(true)}
                  title="Edit epics directory"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => postMessage({ type: 'browseEpicsDir' })}
                  title="Browse for epics directory"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <FolderOpen className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              postMessage({ type: 'toggleEpicMemoryHook', enabled: !state.epicMemoryHookEnabled })
            }
            title={
              state.epicMemoryHookEnabled
                ? 'Epic-memory auto-load is ON — prompts mentioning an epic auto-load its memory. Click to turn off.'
                : 'Turn ON epic-memory auto-load — a Claude Code hook injects an epic’s memory whenever a prompt refers to it.'
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
              state.epicMemoryHookEnabled
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <Brain className="h-3.5 w-3.5" />
            Memory auto-load: {state.epicMemoryHookEnabled ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={() => setAutonomousDeliveryOpen(true)}
            title="Start or manage Existing Project Autonomous Delivery"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Autonomous Delivery
          </button>
          <button
            type="button"
            onClick={() => setStartEpicOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Start Epic
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent',
            )}
          >
            {f.label}
            <span
              className={cn(
                'text-[10px] tabular-nums',
                filter === f.id ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
            >
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search epics by title or description…"
          spellCheck={false}
          className="w-full rounded-md border border-border bg-input/50 py-2 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      <CharterBoard charter={state.charter} />

      {emptyMessage ? (
        <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          <EpicSection
            label="Follow"
            count={followed.length}
            open={followOpen}
            onToggle={toggleFollowOpen}
            isDropTarget={dropTarget === 'follow'}
            onDragOver={onSectionDragOver('follow')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropTarget((t) => (t === 'follow' ? null : t));
              }
            }}
            onDrop={onSectionDrop('follow')}
            emptyHint="Drag epics here or star them to follow."
          >
            {followed.map((e) => (
              <EpicCard
                key={e.id}
                epic={e}
                agentMeta={state.agentMeta}
                slashCommandsByAgent={state.slashCommandsByAgent}
                followed
                onToggleFollow={() => toggleFollow(e.id)}
                isDragging={dragEpicId === e.id}
                onDragStart={() => setDragEpicId(e.id)}
                onDragEnd={() => {
                  setDragEpicId(null);
                  setDropTarget(null);
                }}
                diffIgnore={state.diffIgnore}
              />
            ))}
          </EpicSection>

          <EpicSection
            label="No-follow"
            count={unfollowed.length}
            open={noFollowOpen}
            onToggle={toggleNoFollowOpen}
            isDropTarget={dropTarget === 'no-follow'}
            onDragOver={onSectionDragOver('no-follow')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropTarget((t) => (t === 'no-follow' ? null : t));
              }
            }}
            onDrop={onSectionDrop('no-follow')}
            emptyHint="No unfollowed epics in this filter."
          >
            {unfollowed.map((e) => (
              <EpicCard
                key={e.id}
                epic={e}
                agentMeta={state.agentMeta}
                slashCommandsByAgent={state.slashCommandsByAgent}
                followed={false}
                onToggleFollow={() => toggleFollow(e.id)}
                isDragging={dragEpicId === e.id}
                onDragStart={() => setDragEpicId(e.id)}
                onDragEnd={() => {
                  setDragEpicId(null);
                  setDropTarget(null);
                }}
                diffIgnore={state.diffIgnore}
              />
            ))}
          </EpicSection>
        </div>
      )}

      {startEpicOpen && (
        <StartEpicModal
          pipelines={state.pipelines}
          recipes={state.recipes ?? []}
          agentMeta={state.agentMeta}
          nextEpicId={state.nextEpicId}
          existingEpicIds={state.existingEpicIds}
          epicsDir={state.epicsDir}
          isFirstEpic={state.epics.length === 0}
          workspaceName={state.workspaceName}
          charter={state.charter}
          onSubmit={(draft) => postMessage({ type: 'startEpicInline', draft })}
          onClose={() => setStartEpicOpen(false)}
        />
      )}
      {autonomousDeliveryOpen && (
        <AutonomousDeliveryModal
          pipelines={state.pipelines}
          deliveries={state.deliveries ?? []}
          onClose={() => setAutonomousDeliveryOpen(false)}
        />
      )}
    </div>
  );
}

function EpicSection({
  label,
  count,
  open,
  onToggle,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  emptyHint,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  isDropTarget: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  emptyHint: string;
  children: ReactNode;
}) {
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'rounded-lg border border-border/60 bg-surface/30 transition-colors',
        isDropTarget && 'border-primary/50 bg-primary/5',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90',
          )}
        />
        {label === 'Follow' && (
          <Star className="h-3 w-3 shrink-0 fill-primary text-primary" />
        )}
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-2 pb-2">
          {count === 0 ? (
            <div className="rounded-md border border-dashed border-border/80 px-3 py-4 text-center text-[11px] text-muted-foreground">
              {emptyHint}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}
