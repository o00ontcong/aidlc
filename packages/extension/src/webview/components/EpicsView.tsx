import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import type { WorkspaceState, EpicSummary, EpicFilter } from '@/lib/types';
import { EPIC_DND_MIME } from './EpicCard';
import { StartEpicModal, type StartEpicDraft } from './StartEpicModal';
import { CharterBoard } from './CharterBoard';
import { AutonomousDeliveryModal } from './AutonomousDeliveryModal';
import { postMessage, onHostMessage } from '@/lib/bridge';
import '@/styles/v3-tokens.css';
import { EpicListPanel, EPIC_LIST_DEFAULT_WIDTH, EPIC_LIST_MAX_WIDTH, EPIC_LIST_MIN_WIDTH } from './epic-v3/EpicListPanel';
import { EpicDetail } from './epic-v3/EpicDetail';
import { MockProvider } from './epic-v3/mock';
import { Btn } from './epic-v3/primitives';
import { StartImplementModal, type SpikePackOption } from './epic-v3/StartImplementModal';
import { SAMPLE_MISSION, isFeatureImplementPipeline } from './epic-v3/three-pipeline';

/** Slice of Epics UI prefs persisted on the extension host (workspaceState). */
interface PersistedEpicsView {
  filter?: EpicFilter;
  search?: string;
  followOpen?: boolean;
  noFollowOpen?: boolean;
  followedIds?: string[];
  listWidth?: number;
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

/**
 * Epics screen, v3 design (AIDLC Workspace v3.dc.html §6).
 *
 * Two columns: resizable epic list (default 316px, collapsible to 46px rail) and
 * detail stack. Everything below the presentation layer is unchanged from the
 * previous version of this file — same state, same `persistEpicsUi` patches,
 * same host message types.
 *
 * Selection / list-collapse / tools-open stay session-only; list width persists
 * in `epicsViewUi.listWidth`.
 */
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
  const [startImplementOpen, setStartImplementOpen] = useState(false);
  const [implementDraft, setImplementDraft] = useState<StartEpicDraft | null>(null);
  const [autonomousDeliveryOpen, setAutonomousDeliveryOpen] = useState(false);
  const [dragEpicId, setDragEpicId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<'follow' | 'no-follow' | null>(null);

  // v3 view state (session-only).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [listWidth, setListWidth] = useState(() => {
    const saved = seed.listWidth;
    if (typeof saved !== 'number' || !Number.isFinite(saved)) return EPIC_LIST_DEFAULT_WIDTH;
    return Math.max(EPIC_LIST_MIN_WIDTH, Math.min(EPIC_LIST_MAX_WIDTH, Math.round(saved)));
  });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [charterOpen, setCharterOpen] = useState(false);

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

  // Keep the selection valid: fall back to the first visible epic.
  const selected = useMemo(() => {
    const byId = selectedId ? visible.find((e) => e.id === selectedId) : undefined;
    return byId ?? visible[0] ?? null;
  }, [visible, selectedId]);

  const spikePacks: SpikePackOption[] = useMemo(
    () =>
      state.epics
        .filter((epic) => (epic.pipeline ?? '').startsWith('feature-spike') || epic.pipeline === 'feature-spike')
        .map((epic) => ({
          id: epic.id,
          title: epic.title,
          missionMd: (epic.existingArtifacts ?? []).includes('MISSION.md') ? SAMPLE_MISSION : '',
        })),
    [state.epics],
  );

  const openStartImplement = (draft?: StartEpicDraft | null) => {
    setImplementDraft(draft ?? null);
    setStartImplementOpen(true);
  };

  const onSectionDragOver = (section: 'follow' | 'no-follow') => (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes(EPIC_DND_MIME) && dragEpicId === null) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== section) { setDropTarget(section); }
  };

  const onSectionDragLeave = (section: 'follow' | 'no-follow') => (e: DragEvent) => {
    if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      setDropTarget((t) => (t === section ? null : t));
    }
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

  const onListWidthChange = (next: number) => {
    setListWidth(next);
  };

  const onListWidthCommit = (next: number) => {
    setListWidth(next);
    persist({ listWidth: next });
  };

  const themeClass = useThemeClass();

  return (
    <MockProvider>
      <div
        data-v3="epics"
        className={`aidlc-v3 ${themeClass}`}
        style={{ height: '100%', display: 'flex', minHeight: 0 }}
      >
        <EpicListPanel
          epics={state.epics}
          visible={visible}
          followed={followed}
          unfollowed={unfollowed}
          counts={counts}
          filter={filter}
          search={search}
          selectedId={selected?.id ?? null}
          followedIds={followedIds}
          followOpen={followOpen}
          noFollowOpen={noFollowOpen}
          listCollapsed={listCollapsed}
          listWidth={listWidth}
          toolsOpen={toolsOpen}
          dragEpicId={dragEpicId}
          dropTarget={dropTarget}
          onFilter={onFilterChange}
          onSearch={onSearchChange}
          onSelect={setSelectedId}
          onToggleFollow={toggleFollow}
          onToggleFollowOpen={toggleFollowOpen}
          onToggleNoFollowOpen={toggleNoFollowOpen}
          onToggleCollapsed={() => setListCollapsed((v) => !v)}
          onListWidthChange={onListWidthChange}
          onListWidthCommit={onListWidthCommit}
          onToggleTools={() => setToolsOpen((v) => !v)}
          onResetFilters={() => { onFilterChange('all'); onSearchChange(''); }}
          onRefresh={() => postMessage({ type: 'refreshEpics' })}
          onMigrate={() => postMessage({ type: 'migrateEpics' })}
          onNewEpic={() => setStartEpicOpen(true)}
          onAutonomousDelivery={() => setAutonomousDeliveryOpen(true)}
          onDragStart={setDragEpicId}
          onDragEnd={() => { setDragEpicId(null); setDropTarget(null); }}
          onSectionDragOver={onSectionDragOver}
          onSectionDragLeave={onSectionDragLeave}
          onSectionDrop={onSectionDrop}
        />

        {selected ? (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Project-scoped controls the v3 Epic screen has no slot for. They
                live in the sidebar in the design, which is out of scope for this
                change, so they stay here rather than being dropped. */}
            <ProjectStrip state={state} />
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
              <EpicDetail
                epic={selected}
                state={state}
                onOpenCharter={() => setCharterOpen((v) => !v)}
                onChoosePack={() => openStartImplement(null)}
                onStartImplementFromSpike={(epic) =>
                  postMessage({ type: 'startImplementFromSpike', epicId: epic.id })}
              />
            </div>
            {charterOpen && (
              <div
                style={{
                  flex: 'none', maxHeight: '38%', overflow: 'auto', padding: '12px 18px',
                  borderTop: '1px solid var(--bd)', background: 'var(--panel)',
                }}
              >
                <CharterBoard charter={state.charter} />
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12.5, color: 'var(--txt3)',
            }}
          >
            Chọn một epic ở danh sách bên trái.
          </div>
        )}
      </div>

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
          onSubmit={(draft) => {
            if (draft.target.kind === 'pipeline' && isFeatureImplementPipeline(draft.target.id)) {
              setStartEpicOpen(false);
              openStartImplement(draft);
              return;
            }
            postMessage({ type: 'startEpicInline', draft });
          }}
          onClose={() => setStartEpicOpen(false)}
        />
      )}
      {startImplementOpen && (
        <StartImplementModal
          spikeEpics={spikePacks}
          initialSource={selected && isFeatureImplementPipeline(selected.pipeline) && !implementDraft
            ? (selected.inputs?.jira ? 'jira' : 'spike')
            : 'spike'}
          initialJira={implementDraft ? '' : (selected?.inputs?.jira ?? '')}
          onStart={(result) => {
            if (implementDraft) {
              postMessage({
                type: 'startEpicInline',
                draft: {
                  ...implementDraft,
                  inputs: {
                    ...implementDraft.inputs,
                    spec_source: result.source,
                    spec_ref: result.specRef,
                  },
                  missionMd: result.missionMd,
                },
              });
            } else if (selected) {
              postMessage({
                type: 'startPipelineRunForEpic',
                epicId: selected.id,
                pipelineId: 'feature-implement',
                specSource: result.source,
                specRef: result.specRef,
                missionMd: result.missionMd,
              });
            }
            setStartImplementOpen(false);
            setImplementDraft(null);
          }}
          onClose={() => {
            setStartImplementOpen(false);
            setImplementDraft(null);
          }}
        />
      )}
      {autonomousDeliveryOpen && (
        <AutonomousDeliveryModal
          pipelines={state.pipelines}
          deliveries={state.deliveries ?? []}
          onClose={() => setAutonomousDeliveryOpen(false)}
        />
      )}
    </MockProvider>
  );
}

/**
 * Resolve the v3 theme class from the `.dark` class the existing theme bridge
 * already maintains on <html>. No new theme control is introduced — the design
 * file's Dark/Light switcher is design-doc chrome (V3_HANDOFF §2, §13.15).
 */
function useThemeClass(): 'thm-dark' | 'thm-light' {
  const read = (): 'thm-dark' | 'thm-light' =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'thm-dark'
      : 'thm-light';
  const [cls, setCls] = useState<'thm-dark' | 'thm-light'>(read);
  useEffect(() => {
    if (typeof document === 'undefined') { return; }
    const observer = new MutationObserver(() => setCls(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setCls(read());
    return () => observer.disconnect();
  }, []);
  return cls;
}

/**
 * Epics-directory control + epic-memory hook toggle. Both existed on the
 * previous Epics screen; the v3 design puts project-level controls in the
 * sidebar, which this change does not touch, so they are preserved here.
 */
function ProjectStrip({ state }: { state: WorkspaceState }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.epicsDir);
  useEffect(() => { setDraft(state.epicsDir); }, [state.epicsDir]);

  const commit = () => {
    const val = draft.trim();
    if (val && val !== state.epicsDir) {
      postMessage({ type: 'changeEpicsDir', dir: val });
    }
    setEditing(false);
  };

  return (
    <div
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
        borderBottom: '1px solid var(--bd)', background: 'var(--panel)',
      }}
    >
      <div
        style={{
          fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase',
          color: 'var(--txt3)', fontWeight: 600, flex: 'none',
        }}
      >
        Epics dir
      </div>
      {editing ? (
        <input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setEditing(false); setDraft(state.epicsDir); }
          }}
          onBlur={commit}
          className="v3-mono"
          style={{
            width: 240, background: 'var(--panel2)', border: '1px solid var(--bd)',
            borderRadius: 5, padding: '3px 7px', color: 'var(--txt)', fontSize: 11, outline: 'none',
          }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          title="Sửa epics directory"
          className="v3-mono"
          style={{ fontSize: 11, color: 'var(--txt2)', cursor: 'pointer' }}
        >
          {state.epicsDir}
        </div>
      )}
      <Btn
        label="Browse"
        pad="3px 8px"
        fs={11}
        onClick={() => postMessage({ type: 'browseEpicsDir' })}
        title="Chọn epics directory"
      />
      <div style={{ flex: 1 }} />
      <Btn
        label={`Tự nạp memory: ${state.epicMemoryHookEnabled ? 'Bật' : 'Tắt'}`}
        pad="3px 8px"
        fs={11}
        onClick={() =>
          postMessage({ type: 'toggleEpicMemoryHook', enabled: !state.epicMemoryHookEnabled })
        }
        title={
          state.epicMemoryHookEnabled
            ? 'Hook Claude Code: khi prompt nhắc tên epic thì tự chèn memory digest. Đây không phải nút Xem memory trong detail. Click để tắt.'
            : 'Bật hook Claude Code để tự chèn memory digest khi prompt nhắc epic. Khác nút Xem memory trong detail. Click để bật.'
        }
        style={
          state.epicMemoryHookEnabled
            ? { borderColor: 'var(--acc-bd)', background: 'var(--acc-bg)', color: 'var(--acc-txt)' }
            : undefined
        }
      />
    </div>
  );
}
