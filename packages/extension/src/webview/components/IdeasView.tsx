/* Ideas screen, v3 — journal-first: list trái, journal detail phải. */

import { useEffect, useMemo, useState } from 'react';

import type { IdeaLoadError, IdeaSummary, WorkspaceState } from '@/lib/types';
import { onHostMessage, postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import '@/styles/v3-tokens.css';

import { MockProvider } from './epic-v3/mock';
import { Btn } from './epic-v3/primitives';
import { V3Callout, V3Modal, V3ModalFooter, V3ModalHeader, V3Textarea } from './epic-v3/V3Modal';
import { IdeaListPanel, IDEA_LIST_DEFAULT_WIDTH } from './idea-v3/IdeaListPanel';
import { IdeaJournalDetail } from './idea-v3/IdeaJournalDetail';
import { inboxBucket, type Filter } from './idea-v3/idea-adapt';

interface Props {
  state: WorkspaceState;
  selectedIdeaId?: string;
  onSelectIdea: (ideaId: string) => void;
}

function matchesSearch(idea: IdeaSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return idea.id.toLowerCase().includes(q)
    || idea.title.toLowerCase().includes(q)
    || idea.seedSentence.toLowerCase().includes(q);
}

export function IdeasView({ state, selectedIdeaId, onSelectIdea }: Props) {
  const language = state.displayLanguage;
  const copy = ideasCopy(language);
  const selected = state.ideas.find((idea) => idea.id === selectedIdeaId);

  const [creating, setCreating] = useState(state.ideas.length === 0);
  const [filter, setFilter] = useState<Filter>('writing');
  const [search, setSearch] = useState('');
  const [listCollapsed, setListCollapsed] = useState(false);
  const [listWidth, setListWidth] = useState(IDEA_LIST_DEFAULT_WIDTH);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);
  const [conflictIdeaId, setConflictIdeaId] = useState<string | null>(null);

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'ideaRevisionConflict') {
        const ideaId = String(msg.ideaId ?? '');
        if (ideaId) setConflictIdeaId(ideaId);
      }
    });
  }, []);

  const trySelectIdea = (ideaId: string) => {
    if (
      selected
      && selected.id !== ideaId
      && (selected.dirty || selected.saveStatus === 'saving' || selected.saveStatus === 'failed')
    ) {
      setPendingSelectId(ideaId);
      setSwitchConfirmOpen(true);
      return;
    }
    onSelectIdea(ideaId);
  };

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: state.ideas.length, writing: 0, ready: 0, blocked: 0, done: 0, shelved: 0 };
    for (const idea of state.ideas) out[inboxBucket(idea)] += 1;
    return out;
  }, [state.ideas]);

  const visible = useMemo(
    () => state.ideas.filter((idea) => (filter === 'all' || inboxBucket(idea) === filter) && matchesSearch(idea, search)),
    [state.ideas, filter, search],
  );

  const themeClass = useThemeClass();

  return (
    <MockProvider>
      <div
        data-v3="ideas"
        className={`aidlc-v3 ${themeClass}`}
        style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {state.corruptedIdeas.length > 0 && (
          <div style={{ flex: 'none', padding: '10px 14px 0' }}>
            <CorruptedIdeasBanner corrupted={state.corruptedIdeas} language={language} />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <IdeaListPanel
            ideas={state.ideas}
            visible={visible}
            counts={counts}
            filter={filter}
            search={search}
            selectedId={selected?.id ?? null}
            listCollapsed={listCollapsed}
            listWidth={listWidth}
            toolsOpen={toolsOpen}
            language={language}
            onFilter={setFilter}
            onSearch={setSearch}
            onSelect={trySelectIdea}
            onToggleCollapsed={() => setListCollapsed((v) => !v)}
            onListWidthChange={setListWidth}
            onListWidthCommit={setListWidth}
            onToggleTools={() => setToolsOpen((v) => !v)}
            onResetFilters={() => { setFilter('writing'); setSearch(''); }}
            onNewIdea={() => setCreating(true)}
          />
          {selected ? (
            <IdeaJournalDetail idea={selected} language={language} />
          ) : (
            <div
              style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12.5, color: 'var(--txt3)',
              }}
            >
              {copy.list.savedAutomatically}
            </div>
          )}
        </div>

        {/* Modals must stay INSIDE the .aidlc-v3 wrapper, not as siblings of
            it — v3-tokens.css scopes every --acc/--bd/--panel2/... custom
            property to `.aidlc-v3` and its descendants, so a V3Modal
            rendered outside that div gets none of them (transparent,
            unstyled box; see the bug report this fixed). */}
        {creating && (
          <CaptureModal language={language} onClose={() => setCreating(false)} />
        )}

        {switchConfirmOpen && pendingSelectId && (
          <V3Modal
            width={420}
            onClose={() => { setSwitchConfirmOpen(false); setPendingSelectId(null); }}
            header={<V3ModalHeader title={copy.switchConfirm.title} onClose={() => { setSwitchConfirmOpen(false); setPendingSelectId(null); }} />}
            footer={(
              <V3ModalFooter>
                <Btn label={copy.switchConfirm.stay} onClick={() => { setSwitchConfirmOpen(false); setPendingSelectId(null); }} />
                <Btn
                  label={copy.switchConfirm.discard}
                  variant="danger"
                  onClick={() => {
                    onSelectIdea(pendingSelectId);
                    setSwitchConfirmOpen(false);
                    setPendingSelectId(null);
                  }}
                />
              </V3ModalFooter>
            )}
          >
            <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.switchConfirm.body}</div>
          </V3Modal>
        )}

        {conflictIdeaId && (
          <V3Modal
            width={420}
            onClose={() => setConflictIdeaId(null)}
            header={<V3ModalHeader title={copy.conflict.title} onClose={() => setConflictIdeaId(null)} />}
            footer={(
              <V3ModalFooter>
                <Btn label={copy.resume.cancel} onClick={() => setConflictIdeaId(null)} />
                <Btn
                  label={copy.conflict.reload}
                  variant="primary"
                  onClick={() => {
                    postMessage({ type: 'reloadIdeasState' });
                    setConflictIdeaId(null);
                  }}
                />
              </V3ModalFooter>
            )}
          >
            <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.conflict.body}</div>
          </V3Modal>
        )}
      </div>
    </MockProvider>
  );
}

function CaptureModal({ language, onClose }: { language: IdeasLanguage; onClose: () => void }) {
  const copy = ideasCopy(language);
  const [seed, setSeed] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    if (!seed.trim() || submitting) return;
    setSubmitting(true);
    postMessage({ type: 'createIdea', seedSentence: seed.trim() });
    onClose();
  };

  return (
    <V3Modal
      width={480}
      onClose={onClose}
      header={<V3ModalHeader title={copy.capture.prompt} onClose={onClose} />}
      footer={(
        <V3ModalFooter>
          <Btn label={copy.resume.cancel} onClick={onClose} />
          <Btn label={copy.capture.start} variant="primary" disabled={!seed.trim() || submitting} onClick={submit} />
        </V3ModalFooter>
      )}
    >
      <V3Textarea value={seed} onChange={setSeed} placeholder={copy.capture.placeholder} rows={4} autoFocus />
      <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.6 }}>{copy.capture.hint}</div>
    </V3Modal>
  );
}

function CorruptedIdeasBanner({ corrupted, language }: { corrupted: IdeaLoadError[]; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  return (
    <V3Callout tone="err">
      <div style={{ fontWeight: 600 }}>{copy.corrupted.banner(corrupted.length)}</div>
      <div style={{ marginTop: 2, opacity: 0.85 }}>{copy.corrupted.body}</div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {corrupted.map((entry) => (
          <CorruptedIdeaRow key={entry.id} entry={entry} language={language} />
        ))}
      </div>
    </V3Callout>
  );
}

function CorruptedIdeaRow({ entry, language }: { entry: IdeaLoadError; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '6px 8px', borderRadius: 6, background: 'var(--panel)', border: '1px solid var(--bd)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="v3-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)' }}>{entry.id}</div>
        <div
          style={{ fontSize: 10, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={entry.error}
        >
          {entry.error}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
        <Btn
          label={copy.corrupted.openState}
          pad="4px 8px"
          fs={10.5}
          onClick={() => postMessage({ type: 'openIdeaStateFile', ideaId: entry.id })}
        />
        <Btn
          label={copy.corrupted.repair}
          variant="primary"
          pad="4px 8px"
          fs={10.5}
          title="Sao lưu state.json hỏng, rồi đặt idea về captured với seed đã cứu được"
          onClick={() => postMessage({ type: 'repairCorruptedIdea', ideaId: entry.id })}
        />
        <Btn
          label={copy.corrupted.delete}
          variant="danger"
          pad="4px 8px"
          fs={10.5}
          onClick={() => setConfirmingDelete(true)}
        />
      </div>

      {confirmingDelete && (
        <V3Modal
          width={420}
          danger
          onClose={() => setConfirmingDelete(false)}
          header={<V3ModalHeader title={copy.corrupted.deleteConfirmTitle} onClose={() => setConfirmingDelete(false)} tone="err" />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setConfirmingDelete(false)} />
              <Btn
                label={copy.corrupted.deleteConfirm}
                variant="danger"
                onClick={() => {
                  postMessage({ type: 'deleteCorruptedIdea', ideaId: entry.id });
                  setConfirmingDelete(false);
                }}
              />
            </V3ModalFooter>
          )}
        >
          <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.corrupted.deleteConfirmBody}</div>
        </V3Modal>
      )}
    </div>
  );
}

/** Resolve the v3 theme class from the `.dark` class the existing theme bridge
 * maintains on <html>. Duplicated from `EpicsView.tsx` (private there too —
 * Epic itself sets the precedent of not sharing this small hook). */
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
