import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { IdeaExplore, IdeaSummary, SolutionOption } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card, CardHeader, CardTitle } from '../../epic-v3/primitives';
import { EmptyHint, FieldCard, StringListEditor } from './shared';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyOption(): SolutionOption {
  return { id: newId('opt'), title: '', description: '', pros: [], cons: [], risks: [], tradeoffs: [] };
}

export function ExploreStage({
  idea, language, readOnly, isCurrent,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  readOnly: boolean;
  isCurrent: boolean;
}) {
  const copy = ideasCopy(language);
  const c = copy.stages.explore;
  const [draft, setDraft] = useState<IdeaExplore>(idea.explore);

  useEffect(() => { setDraft(idea.explore); }, [idea.id, idea.ideaRevision]);

  const persist = (patch: Partial<IdeaExplore>) => {
    postMessage({ type: 'updateIdeaExplore', ideaId: idea.id, revision: idea.ideaRevision, patch });
  };

  const updateOption = (id: string, patch: Partial<SolutionOption>) => {
    const options = draft.options.map((o) => (o.id === id ? { ...o, ...patch } : o));
    setDraft((d) => ({ ...d, options }));
    return options;
  };
  const addOption = () => setDraft((d) => ({ ...d, options: [...d.options, emptyOption()] }));
  const removeOption = (id: string) => {
    const options = draft.options.filter((o) => o.id !== id);
    setDraft((d) => ({ ...d, options }));
    persist({ options });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {draft.options.length === 0 && (
        <Card><div style={{ padding: 14 }}><EmptyHint>{c.noOptions}</EmptyHint></div></Card>
      )}
      {draft.options.map((option) => (
        <Card key={option.id}>
          <CardHeader pad="9px 12px" wrap>
            <input
              value={option.title}
              disabled={readOnly}
              placeholder={c.optionTitle}
              onChange={(e) => updateOption(option.id, { title: e.target.value })}
              onBlur={() => persist({ options: draft.options })}
              style={{
                flex: 1, minWidth: 120, fontSize: 12.5, fontWeight: 600, padding: '4px 8px', borderRadius: 5,
                border: '1px solid var(--bd)', background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit',
              }}
            />
            {!readOnly && (
              <button type="button" onClick={() => removeOption(option.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>
                <Trash2 size={14} />
              </button>
            )}
          </CardHeader>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              value={option.description}
              disabled={readOnly}
              placeholder={c.description}
              onChange={(e) => updateOption(option.id, { description: e.target.value })}
              onBlur={() => persist({ options: draft.options })}
              rows={2}
              style={{
                fontSize: 11.5, padding: '8px 10px', borderRadius: 5, border: '1px solid var(--bd)',
                background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit', resize: 'none',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginBottom: 4, fontWeight: 600 }}>{c.pros}</div>
                <StringListEditor
                  items={option.pros}
                  onChange={(pros) => updateOption(option.id, { pros })}
                  onBlurSave={() => persist({ options: draft.options })}
                  readOnly={readOnly}
                  addLabel={copy.stages.add}
                />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginBottom: 4, fontWeight: 600 }}>{c.cons}</div>
                <StringListEditor
                  items={option.cons}
                  onChange={(cons) => updateOption(option.id, { cons })}
                  onBlurSave={() => persist({ options: draft.options })}
                  readOnly={readOnly}
                  addLabel={copy.stages.add}
                />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginBottom: 4, fontWeight: 600 }}>{c.risks}</div>
                <StringListEditor
                  items={option.risks}
                  onChange={(risks) => updateOption(option.id, { risks })}
                  onBlurSave={() => persist({ options: draft.options })}
                  readOnly={readOnly}
                  addLabel={copy.stages.add}
                />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginBottom: 4, fontWeight: 600 }}>{c.tradeoffs}</div>
                <StringListEditor
                  items={option.tradeoffs}
                  onChange={(tradeoffs) => updateOption(option.id, { tradeoffs })}
                  onBlurSave={() => persist({ options: draft.options })}
                  readOnly={readOnly}
                  addLabel={copy.stages.add}
                />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginBottom: 4, fontWeight: 600 }}>{c.validation}</div>
              <input
                value={option.validation ?? ''}
                disabled={readOnly}
                onChange={(e) => updateOption(option.id, { validation: e.target.value })}
                onBlur={() => persist({ options: draft.options })}
                style={{ width: '100%', fontSize: 11.5, padding: '6px 8px', borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </Card>
      ))}
      {!readOnly && <Btn label={<><Plus size={12} />{c.optionTitle}</>} onClick={addOption} style={{ alignSelf: 'flex-start' }} />}

      <FieldCard title={c.ideaValidations}>
        <StringListEditor
          items={draft.validations}
          onChange={(validations) => setDraft((d) => ({ ...d, validations }))}
          onBlurSave={() => persist({ validations: draft.validations })}
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
