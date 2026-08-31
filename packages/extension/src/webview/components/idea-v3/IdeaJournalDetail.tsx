/**
 * Journal-first Ideas detail — human writes, AI assists via copy/paste prompts
 * outside the tab. See docs/design/ideas-tab/ideas-journal-wireframe.canvas.tsx.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Copy, Loader2, Plus, Trash2 } from 'lucide-react';

import type { IdeaJournal, IdeaJournalPhase, IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import {
  Btn, Card, CardNote, CardTitle, Chip, Mono, SectionLabel, Spacer,
} from '../epic-v3/primitives';
import { V3Callout, V3Modal, V3ModalFooter, V3ModalHeader, V3Textarea } from '../epic-v3/V3Modal';
import { DeliveryPanel } from './IdeaDeliveryPanel';
import { journalPhaseLabel } from './idea-adapt';

const PHASES: IdeaJournalPhase[] = ['spark', 'research', 'rewrite', 'ready'];

const RECIPES = [
  'cofofo-feature',
  'cofofo-bugfix',
  'cofofo-bootstrap',
  'cofofo-refresh-context',
  'cofofo-update-rules',
  'cofofo-repin-bundle',
] as const;

type PromptKey = 'spark_clarify' | 'research_sources' | 'research_summarize' | 'rewrite_draft' | 'ready_check';

function emptyJournal(): IdeaJournal {
  return {
    sources: [],
    notes: [],
    rewrite: { problem: '', outcome: '', appetite: '', noGos: '' },
  };
}

function journalOf(idea: IdeaSummary): IdeaJournal {
  return idea.journal ?? emptyJournal();
}

export function IdeaJournalDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const readOnly = ['in_delivery', 'completed', 'closed'].includes(idea.checkpoint);
  const phase = idea.journalPhase ?? 'spark';
  const [expanded, setExpanded] = useState<Record<IdeaJournalPhase, boolean>>({
    spark: true, research: phase === 'research', rewrite: phase === 'rewrite', ready: phase === 'ready',
  });
  const [draft, setDraft] = useState(() => ({
    seed: idea.seedSentence,
    journal: journalOf(idea),
  }));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTarget, setPasteTarget] = useState<'notes' | 'rewrite'>('notes');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ seed: idea.seedSentence, journal: journalOf(idea) });
    setSaving(false);
  }, [idea.id, idea.ideaRevision]);

  const persist = useCallback((patch: {
    seedSentence?: string;
    journalPhase?: IdeaJournalPhase;
    journal?: IdeaJournal;
  }) => {
    setSaving(true);
    postMessage({
      type: 'saveIdeaJournal',
      ideaId: idea.id,
      revision: idea.ideaRevision,
      ...patch,
    });
  }, [idea.id, idea.ideaRevision]);

  const copyPrompt = (key: PromptKey) => {
    postMessage({ type: 'copyIdeaPrompt', ideaId: idea.id, revision: idea.ideaRevision, promptKey: key });
  };

  const openPaste = (target: 'notes' | 'rewrite') => {
    setPasteTarget(target);
    setPasteText('');
    setPasteOpen(true);
  };

  const submitPaste = () => {
    if (!pasteText.trim()) return;
    postMessage({
      type: 'appendIdeaJournalNote',
      ideaId: idea.id,
      revision: idea.ideaRevision,
      text: pasteText.trim(),
      origin: 'ai',
    });
    setPasteOpen(false);
    setPasteText('');
  };

  if (readOnly && idea.children.length > 0) {
    return (
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Header idea={idea} language={language} phase={phase} readOnly />
        <V3Callout tone="acc">{copy.journal.scaffoldedBody}</V3Callout>
        <DeliveryPanel idea={idea} language={language} />
        <Btn label={copy.journal.viewJournal} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'journal.md' })} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header idea={idea} language={language} phase={phase} readOnly={readOnly} />

      <PhaseBar phase={phase} language={language} />

      {saving && (
        <div style={{ fontSize: 11, color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={12} className="animate-spin" /> {copy.journal.saving}
        </div>
      )}

      {/* Spark */}
      <Section
        title={copy.journal.phases.spark}
        expanded={expanded.spark}
        onToggle={() => setExpanded((e) => ({ ...e, spark: !e.spark }))}
        done={phase !== 'spark'}
      >
        <V3Textarea
          value={draft.seed}
          onChange={(v) => setDraft((d) => ({ ...d, seed: v }))}
          onBlur={() => {
            if (draft.seed.trim() !== idea.seedSentence) {
              persist({ seedSentence: draft.seed.trim(), journal: draft.journal });
            }
          }}
          rows={3}
          disabled={readOnly}
        />
        <ActionRow
          copyLabel={copy.journal.copySpark}
          onCopy={() => copyPrompt('spark_clarify')}
          onPaste={undefined}
          onSave={() => persist({ seedSentence: draft.seed.trim(), journal: draft.journal })}
          saveLabel={copy.journal.save}
          disabled={readOnly}
        />
        {phase === 'spark' && !readOnly && (
          <Btn
            label={copy.journal.advanceResearch}
            variant="primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => persist({ seedSentence: draft.seed.trim(), journalPhase: 'research', journal: draft.journal })}
          />
        )}
      </Section>

      {/* Research */}
      <Section
        title={copy.journal.phases.research}
        expanded={expanded.research}
        onToggle={() => setExpanded((e) => ({ ...e, research: !e.research }))}
        done={['rewrite', 'ready'].includes(phase)}
      >
        <SectionLabel>{copy.journal.sourcesTitle}</SectionLabel>
        <SourcesTable
          sources={draft.journal.sources}
          language={language}
          readOnly={readOnly}
          onChange={(sources) => {
            const journal = { ...draft.journal, sources };
            setDraft((d) => ({ ...d, journal }));
          }}
          onBlurSave={() => persist({ journal: draft.journal })}
        />
        <ActionRow
          copyLabel={copy.journal.copySources}
          onCopy={() => copyPrompt('research_sources')}
          onPaste={() => openPaste('notes')}
          pasteLabel={copy.journal.pasteAi}
          onSave={() => persist({ journal: draft.journal })}
          saveLabel={copy.journal.save}
          disabled={readOnly}
        />

        <SectionLabel>{copy.journal.notesTitle}</SectionLabel>
        <NotesList notes={draft.journal.notes} language={language} />
        <ActionRow
          copyLabel={copy.journal.copySummarize}
          onCopy={() => copyPrompt('research_summarize')}
          onPaste={() => openPaste('notes')}
          pasteLabel={copy.journal.pasteAi}
          onSave={() => persist({ journal: draft.journal })}
          saveLabel={copy.journal.save}
          disabled={readOnly}
        />
        {phase === 'research' && !readOnly && (
          <Btn
            label={copy.journal.advanceRewrite}
            variant="primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => persist({ journalPhase: 'rewrite', journal: draft.journal })}
          />
        )}
      </Section>

      {/* Rewrite */}
      <Section
        title={copy.journal.phases.rewrite}
        expanded={expanded.rewrite}
        onToggle={() => setExpanded((e) => ({ ...e, rewrite: !e.rewrite }))}
        done={phase === 'ready'}
      >
        {(['problem', 'outcome', 'appetite', 'noGos'] as const).map((field) => (
          <div key={field} style={{ marginBottom: 10 }}>
            <SectionLabel>{copy.journal.rewrite[field]}</SectionLabel>
            <V3Textarea
              value={draft.journal.rewrite[field]}
              onChange={(v) => setDraft((d) => ({
                ...d,
                journal: { ...d.journal, rewrite: { ...d.journal.rewrite, [field]: v } },
              }))}
              onBlur={() => persist({ journal: draft.journal })}
              rows={field === 'noGos' ? 2 : 3}
              disabled={readOnly}
            />
          </div>
        ))}
        <ActionRow
          copyLabel={copy.journal.copyRewrite}
          onCopy={() => copyPrompt('rewrite_draft')}
          onPaste={() => openPaste('rewrite')}
          pasteLabel={copy.journal.pasteAi}
          onSave={() => persist({ journal: draft.journal })}
          saveLabel={copy.journal.save}
          disabled={readOnly}
        />
        {phase === 'rewrite' && !readOnly && (
          <Btn
            label={copy.journal.advanceReady}
            variant="primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={!draft.journal.rewrite.problem.trim() || !draft.journal.rewrite.outcome.trim()}
            onClick={() => persist({ journalPhase: 'ready', journal: draft.journal })}
          />
        )}
      </Section>

      {/* Ready */}
      <Section
        title={copy.journal.phases.ready}
        expanded={expanded.ready}
        onToggle={() => setExpanded((e) => ({ ...e, ready: !e.ready }))}
        done={false}
      >
        <CardNote>{copy.journal.readyHint}</CardNote>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {RECIPES.map((r) => (
            <button
              key={r}
              type="button"
              disabled={readOnly}
              onClick={() => {
                const journal = { ...draft.journal, readyRecipeId: r };
                setDraft((d) => ({ ...d, journal }));
                persist({ journalPhase: 'ready', journal });
              }}
              style={{
                cursor: readOnly ? 'default' : 'pointer',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'inherit',
                border: `1px solid ${draft.journal.readyRecipeId === r ? 'var(--acc-bd)' : 'var(--bd)'}`,
                background: draft.journal.readyRecipeId === r ? 'var(--acc-bg)' : 'var(--panel2)',
                color: draft.journal.readyRecipeId === r ? 'var(--acc-txt)' : 'var(--txt2)',
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <SectionLabel>{copy.journal.epicTitle}</SectionLabel>
          <V3Textarea
            value={draft.journal.readyEpicTitle ?? ''}
            onChange={(v) => setDraft((d) => ({
              ...d,
              journal: { ...d.journal, readyEpicTitle: v },
            }))}
            onBlur={() => persist({ journalPhase: 'ready', journal: draft.journal })}
            rows={1}
            disabled={readOnly}
          />
        </div>
        <ActionRow
          copyLabel={copy.journal.copyReadyCheck}
          onCopy={() => copyPrompt('ready_check')}
          onPaste={undefined}
          onSave={() => persist({ journalPhase: 'ready', journal: draft.journal })}
          saveLabel={copy.journal.save}
          disabled={readOnly}
        />
        {phase === 'ready' && !readOnly && (
          <Btn
            label={copy.journal.scaffoldEpic}
            variant="primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={!draft.journal.readyRecipeId || !(draft.journal.readyEpicTitle ?? '').trim()}
            onClick={() => postMessage({
              type: 'scaffoldIdeaJournal',
              ideaId: idea.id,
              revision: idea.ideaRevision,
              recipeId: draft.journal.readyRecipeId,
              epicTitle: (draft.journal.readyEpicTitle ?? '').trim(),
            })}
          />
        )}
      </Section>

      {pasteOpen && (
        <V3Modal
          width={520}
          onClose={() => setPasteOpen(false)}
          header={<V3ModalHeader title={copy.journal.pasteModalTitle} onClose={() => setPasteOpen(false)} />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setPasteOpen(false)} />
              <Btn label={copy.journal.pasteAppend} variant="primary" disabled={!pasteText.trim()} onClick={submitPaste} />
            </V3ModalFooter>
          )}
        >
          <V3Textarea value={pasteText} onChange={setPasteText} rows={8} autoFocus placeholder={copy.journal.pastePlaceholder} />
        </V3Modal>
      )}
    </div>
  );
}

function Header({ idea, language, phase, readOnly }: { idea: IdeaSummary; language: IdeasLanguage; phase: IdeaJournalPhase; readOnly: boolean }) {
  const copy = ideasCopy(language);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Mono style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{idea.id}</Mono>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>{idea.title}</div>
        <Chip mono label={journalPhaseLabel(phase, language)} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--txt3)' }}>{copy.journal.subtitle}</div>
      {!readOnly && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Btn label={copy.journal.openJournalFile} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'journal.md' })} />
        </div>
      )}
    </div>
  );
}

function PhaseBar({ phase, language }: { phase: IdeaJournalPhase; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const idx = PHASES.indexOf(phase);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {PHASES.map((p, i) => (
        <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i < idx ? 'var(--acc)' : i === idx ? 'var(--warn)' : 'var(--track)',
          }}
          />
          <span style={{ fontSize: 11, color: i === idx ? 'var(--txt)' : 'var(--txt3)' }}>{copy.journal.phases[p]}</span>
          {i < PHASES.length - 1 && <span style={{ color: 'var(--txt3)', fontSize: 10 }}>→</span>}
        </div>
      ))}
    </div>
  );
}

function Section({
  title, expanded, onToggle, done, children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', cursor: 'pointer', border: 'none', background: 'transparent', font: 'inherit',
          padding: '11px 14px', borderBottom: expanded ? '1px solid var(--bd)' : 'none',
          display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
        }}
      >
        <CardTitle>{title}{done ? ' ✓' : ''}</CardTitle>
        <Spacer />
        <ChevronDown size={15} style={{ color: 'var(--txt3)', transform: expanded ? 'rotate(180deg)' : undefined }} />
      </button>
      {expanded && <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </Card>
  );
}

function ActionRow({
  copyLabel, onCopy, onPaste, pasteLabel, onSave, saveLabel, disabled,
}: {
  copyLabel: string;
  onCopy: () => void;
  onPaste?: () => void;
  pasteLabel?: string;
  onSave: () => void;
  saveLabel: string;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 4,
      width: '100%',
    }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: '1 1 auto', minWidth: 0 }}>
        <Btn
          label={<><Copy size={12} />{copyLabel}</>}
          onClick={onCopy}
          title={copyLabel}
        />
        {onPaste && pasteLabel && <Btn label={pasteLabel} onClick={onPaste} />}
      </div>
      <Btn label={saveLabel} variant="primary" onClick={onSave} style={{ flexShrink: 0 }} />
    </div>
  );
}

function SourcesTable({
  sources, language, readOnly, onChange, onBlurSave,
}: {
  sources: IdeaJournal['sources'];
  language: IdeasLanguage;
  readOnly: boolean;
  onChange: (sources: IdeaJournal['sources']) => void;
  onBlurSave: () => void;
}) {
  const copy = ideasCopy(language);
  const add = () => {
    onChange([...sources, {
      id: `src-${Date.now()}`,
      source: '',
      type: 'code',
      question: '',
      read: false,
    }]);
  };
  const update = (id: string, patch: Partial<IdeaJournal['sources'][number]>) => {
    onChange(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const remove = (id: string) => onChange(sources.filter((s) => s.id !== id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sources.map((s) => (
        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 1fr auto auto', gap: 6, alignItems: 'start' }}>
          <input
            value={s.source}
            disabled={readOnly}
            placeholder={copy.journal.sourcePath}
            onChange={(e) => update(s.id, { source: e.target.value })}
            onBlur={onBlurSave}
            style={{ fontSize: 11, padding: 6, borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)' }}
          />
          <input
            value={s.type}
            disabled={readOnly}
            onChange={(e) => update(s.id, { type: e.target.value })}
            onBlur={onBlurSave}
            style={{ fontSize: 11, padding: 6, borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)' }}
          />
          <input
            value={s.question}
            disabled={readOnly}
            placeholder={copy.journal.sourceQuestion}
            onChange={(e) => update(s.id, { question: e.target.value })}
            onBlur={onBlurSave}
            style={{ fontSize: 11, padding: 6, borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)' }}
          />
          <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--txt2)' }}>
            <input type="checkbox" checked={s.read} disabled={readOnly} onChange={(e) => { update(s.id, { read: e.target.checked }); onBlurSave(); }} />
            {copy.journal.read}
          </label>
          {!readOnly && (
            <button type="button" onClick={() => { remove(s.id); onBlurSave(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Btn label={<><Plus size={12} />{copy.journal.addSource}</>} onClick={add} style={{ alignSelf: 'flex-start' }} />
      )}
    </div>
  );
}

function NotesList({ notes, language }: { notes: IdeaJournal['notes']; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  if (notes.length === 0) {
    return <CardNote>{copy.journal.noNotes}</CardNote>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notes.map((n) => (
        <div key={n.id} style={{ padding: 8, borderRadius: 6, background: 'var(--panel2)', border: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 4 }}>
            {new Date(n.at).toLocaleString()} · {n.origin === 'ai' ? copy.journal.fromAi : copy.journal.fromHuman}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt2)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{n.text}</div>
        </div>
      ))}
    </div>
  );
}
