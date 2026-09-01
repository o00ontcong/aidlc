import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExistingSolution, Finding, FindingType, IdeaResearch, IdeaSource, IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn } from '../../epic-v3/primitives';
import { EmptyHint, FieldCard, StringListEditor } from './shared';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const FINDING_TONE: Record<FindingType, { bg: string; fg: string }> = {
  fact: { bg: 'var(--acc-bg)', fg: 'var(--acc-txt)' },
  assumption: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
  inference: { bg: 'var(--hover)', fg: 'var(--txt2)' },
};

export function ResearchStage({
  idea, language, readOnly, isCurrent,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  readOnly: boolean;
  isCurrent: boolean;
}) {
  const copy = ideasCopy(language);
  const c = copy.stages.research;
  const [draft, setDraft] = useState<IdeaResearch>(idea.research);

  useEffect(() => { setDraft(idea.research); }, [idea.id, idea.ideaRevision]);

  const persist = (patch: Partial<IdeaResearch>) => {
    postMessage({ type: 'updateIdeaResearch', ideaId: idea.id, revision: idea.ideaRevision, patch });
  };

  const updateFindingLocal = (id: string, patch: Partial<Finding>): Finding[] => {
    const findings = draft.findings.map((f) => (f.id === id ? { ...f, ...patch } : f));
    setDraft((d) => ({ ...d, findings }));
    return findings;
  };
  // Only for discrete actions (the Fact/Assumption/Inference toggle) — persists
  // immediately since there's no blur event to catch it. Continuous typing
  // (the text textarea below) must use `updateFindingLocal` and rely on its
  // own onBlur instead: persisting on every keystroke here raced each
  // keystroke's request against the last one's still-in-flight revision bump,
  // guaranteeing an `ideaRevisionConflict` (and its disruptive reload prompt)
  // on any finding edit longer than one character.
  const updateFinding = (id: string, patch: Partial<Finding>) => {
    persist({ findings: updateFindingLocal(id, patch) });
  };
  const addFinding = () => {
    const findings: Finding[] = [...draft.findings, {
      id: newId('f'), text: '', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: new Date().toISOString(),
    }];
    setDraft((d) => ({ ...d, findings }));
  };
  const removeFinding = (id: string) => {
    const findings = draft.findings.filter((f) => f.id !== id);
    setDraft((d) => ({ ...d, findings }));
    persist({ findings });
  };

  const updateSource = (id: string, patch: Partial<IdeaSource>) => {
    const sources = draft.sources.map((s) => (s.id === id ? { ...s, ...patch } : s));
    setDraft((d) => ({ ...d, sources }));
  };
  const addSource = () => setDraft((d) => ({ ...d, sources: [...d.sources, { id: newId('src'), source: '', type: 'code', question: '', read: false }] }));
  const removeSource = (id: string) => {
    const sources = draft.sources.filter((s) => s.id !== id);
    setDraft((d) => ({ ...d, sources }));
    persist({ sources });
  };

  const updateExisting = (id: string, text: string) => {
    const existingSolutions = draft.existingSolutions.map((s) => (s.id === id ? { ...s, text } : s));
    setDraft((d) => ({ ...d, existingSolutions }));
  };
  const addExisting = () => setDraft((d) => ({
    ...d,
    existingSolutions: [...d.existingSolutions, { id: newId('sol'), text: '', createdBy: 'user', createdAt: new Date().toISOString() }],
  }));
  const removeExisting = (id: string) => {
    const existingSolutions = draft.existingSolutions.filter((s) => s.id !== id);
    setDraft((d) => ({ ...d, existingSolutions }));
    persist({ existingSolutions });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FieldCard title={c.findings}>
        {draft.findings.length === 0 && <EmptyHint>{c.noFindings}</EmptyHint>}
        {draft.findings.map((f) => (
          <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 6, background: 'var(--panel2)', border: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['fact', 'assumption', 'inference'] as FindingType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={readOnly}
                  onClick={() => updateFinding(f.id, { type: t })}
                  style={{
                    cursor: readOnly ? 'default' : 'pointer', border: 'none', borderRadius: 999, padding: '2px 9px', fontSize: 10, fontWeight: 600,
                    background: f.type === t ? FINDING_TONE[t].bg : 'transparent',
                    color: f.type === t ? FINDING_TONE[t].fg : 'var(--txt3)',
                    opacity: f.type === t ? 1 : 0.6,
                  }}
                >
                  {c.findingTypeLabel[t]}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {!readOnly && (
                <button type="button" onClick={() => removeFinding(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <textarea
              value={f.text}
              disabled={readOnly}
              placeholder={c.findingText}
              onChange={(e) => updateFindingLocal(f.id, { text: e.target.value })}
              onBlur={() => persist({ findings: draft.findings })}
              rows={2}
              style={{
                fontSize: 11.5, padding: '6px 8px', borderRadius: 5, border: '1px solid var(--bd)',
                background: 'var(--panel)', color: 'var(--txt)', fontFamily: 'inherit', resize: 'none',
              }}
            />
          </div>
        ))}
        {!readOnly && <Btn label={<><Plus size={12} />{copy.stages.add}</>} onClick={addFinding} style={{ alignSelf: 'flex-start' }} />}
      </FieldCard>

      <FieldCard title={c.existingSolutions}>
        {draft.existingSolutions.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={s.text}
              disabled={readOnly}
              onChange={(e) => updateExisting(s.id, e.target.value)}
              onBlur={() => persist({ existingSolutions: draft.existingSolutions })}
              style={{ flex: 1, fontSize: 11.5, padding: '6px 8px', borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit' }}
            />
            {!readOnly && (
              <button type="button" onClick={() => removeExisting(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {!readOnly && <Btn label={<><Plus size={12} />{copy.stages.add}</>} onClick={addExisting} style={{ alignSelf: 'flex-start' }} />}
      </FieldCard>

      <FieldCard title={c.sourcesTitle}>
        {draft.sources.map((s) => (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 1fr auto auto', gap: 6, alignItems: 'start' }}>
            <input
              value={s.source}
              disabled={readOnly}
              placeholder={c.sourcePath}
              onChange={(e) => updateSource(s.id, { source: e.target.value })}
              onBlur={() => persist({ sources: draft.sources })}
              style={{ fontSize: 11, padding: 6, borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit' }}
            />
            <input
              value={s.type}
              disabled={readOnly}
              onChange={(e) => updateSource(s.id, { type: e.target.value })}
              onBlur={() => persist({ sources: draft.sources })}
              style={{ fontSize: 11, padding: 6, borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit' }}
            />
            <input
              value={s.question}
              disabled={readOnly}
              placeholder={c.sourceQuestion}
              onChange={(e) => updateSource(s.id, { question: e.target.value })}
              onBlur={() => persist({ sources: draft.sources })}
              style={{ fontSize: 11, padding: 6, borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit' }}
            />
            <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--txt2)' }}>
              <input type="checkbox" checked={s.read} disabled={readOnly} onChange={(e) => { updateSource(s.id, { read: e.target.checked }); persist({ sources: draft.sources.map((it) => (it.id === s.id ? { ...it, read: e.target.checked } : it)) }); }} />
              {c.read}
            </label>
            {!readOnly && (
              <button type="button" onClick={() => removeSource(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {!readOnly && <Btn label={<><Plus size={12} />{copy.stages.add}</>} onClick={addSource} style={{ alignSelf: 'flex-start' }} />}
      </FieldCard>

      <FieldCard title={c.unknowns}>
        <StringListEditor
          items={draft.unknowns}
          onChange={(unknowns) => setDraft((d) => ({ ...d, unknowns }))}
          onBlurSave={() => persist({ unknowns: draft.unknowns })}
          readOnly={readOnly}
          addLabel={copy.stages.add}
        />
      </FieldCard>

      {isCurrent && !readOnly && (
        <Btn
          label={c.continueTo}
          variant="primary"
          style={{ alignSelf: 'flex-start' }}
          disabled={!idea.stageStatus.canAdvance}
          title={idea.stageStatus.canAdvance ? undefined : idea.stageStatus.requirements.filter((r) => r.level === 'required' && !r.passed).map((r) => r.label).join(', ')}
          onClick={() => postMessage({ type: 'advanceIdeaStage', ideaId: idea.id, revision: idea.ideaRevision })}
        />
      )}
    </div>
  );
}
