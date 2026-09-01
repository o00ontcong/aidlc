import { useEffect, useState } from 'react';
import type { DecisionStatus, IdeaDecision, IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card, CardNote } from '../../epic-v3/primitives';
import { FieldCard, StringListEditor, TextAreaField } from './shared';

const STATUSES: DecisionStatus[] = ['go', 'no-go', 'later', 'more-research', 'change-direction'];
const RECIPES = ['cofofo-feature', 'cofofo-bugfix', 'cofofo-bootstrap', 'cofofo-refresh-context', 'cofofo-update-rules', 'cofofo-repin-bundle'] as const;

export function DecideStage({
  idea, language, readOnly, isCurrent,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  readOnly: boolean;
  isCurrent: boolean;
}) {
  const copy = ideasCopy(language);
  const c = copy.stages.decide;
  const [draft, setDraft] = useState<IdeaDecision>(idea.decision);
  const [recipeId, setRecipeId] = useState<string | undefined>(idea.readyRecipeId);
  const [epicTitle, setEpicTitle] = useState(idea.readyEpicTitle ?? idea.title);

  useEffect(() => {
    setDraft(idea.decision);
    setRecipeId(idea.readyRecipeId);
    setEpicTitle(idea.readyEpicTitle ?? idea.title);
  }, [idea.id, idea.ideaRevision]);

  const persist = (patch: Partial<IdeaDecision>) => {
    postMessage({ type: 'updateIdeaDecision', ideaId: idea.id, revision: idea.ideaRevision, patch });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FieldCard title={c.status}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={readOnly}
              onClick={() => { setDraft((d) => ({ ...d, status: s })); persist({ status: s }); }}
              style={{
                cursor: readOnly ? 'default' : 'pointer', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
                border: `1px solid ${draft.status === s ? 'var(--acc-bd)' : 'var(--bd)'}`,
                background: draft.status === s ? 'var(--acc-bg)' : 'var(--panel2)',
                color: draft.status === s ? 'var(--acc-txt)' : 'var(--txt2)',
              }}
            >
              {c.statusLabel[s]}
            </button>
          ))}
        </div>
      </FieldCard>

      <FieldCard title={c.recommendation}>
        <TextAreaField value={draft.recommendation ?? ''} onChange={(v) => setDraft((d) => ({ ...d, recommendation: v }))} onBlurSave={() => persist({ recommendation: draft.recommendation })} readOnly={readOnly} />
      </FieldCard>

      <FieldCard title={c.finalIdea}>
        <TextAreaField value={draft.finalIdea ?? ''} onChange={(v) => setDraft((d) => ({ ...d, finalIdea: v }))} onBlurSave={() => persist({ finalIdea: draft.finalIdea })} readOnly={readOnly} />
      </FieldCard>

      <FieldCard title={c.scope}>
        <StringListEditor items={draft.scope} onChange={(scope) => setDraft((d) => ({ ...d, scope }))} onBlurSave={() => persist({ scope: draft.scope })} readOnly={readOnly} addLabel={copy.stages.add} />
      </FieldCard>

      <FieldCard title={c.outOfScope}>
        <StringListEditor items={draft.outOfScope} onChange={(outOfScope) => setDraft((d) => ({ ...d, outOfScope }))} onBlurSave={() => persist({ outOfScope: draft.outOfScope })} readOnly={readOnly} addLabel={copy.stages.add} />
      </FieldCard>

      <FieldCard title={c.validation}>
        <TextAreaField value={draft.validation ?? ''} onChange={(v) => setDraft((d) => ({ ...d, validation: v }))} onBlurSave={() => persist({ validation: draft.validation })} readOnly={readOnly} rows={2} />
      </FieldCard>

      <FieldCard title={c.successCriteria}>
        <StringListEditor items={draft.successCriteria} onChange={(successCriteria) => setDraft((d) => ({ ...d, successCriteria }))} onBlurSave={() => persist({ successCriteria: draft.successCriteria })} readOnly={readOnly} addLabel={copy.stages.add} />
      </FieldCard>

      <FieldCard title={c.nextStep}>
        <TextAreaField value={draft.nextStep ?? ''} onChange={(v) => setDraft((d) => ({ ...d, nextStep: v }))} onBlurSave={() => persist({ nextStep: draft.nextStep })} readOnly={readOnly} rows={2} />
      </FieldCard>

      {isCurrent && !readOnly && (
        <Card>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CardNote>{c.markReadyHint}</CardNote>
            <div style={{ fontSize: 10.5, color: 'var(--txt3)', fontWeight: 600 }}>{c.recipe}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {RECIPES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecipeId(r)}
                  style={{
                    cursor: 'pointer', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
                    border: `1px solid ${recipeId === r ? 'var(--acc-bd)' : 'var(--bd)'}`,
                    background: recipeId === r ? 'var(--acc-bg)' : 'var(--panel2)',
                    color: recipeId === r ? 'var(--acc-txt)' : 'var(--txt2)',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--txt3)', fontWeight: 600 }}>{c.epicTitle}</div>
            <input
              value={epicTitle}
              onChange={(e) => setEpicTitle(e.target.value)}
              style={{ fontSize: 11.5, padding: '6px 8px', borderRadius: 5, border: '1px solid var(--bd)', background: 'var(--panel2)', color: 'var(--txt)', fontFamily: 'inherit' }}
            />
            <Btn
              label={c.markReady}
              variant="primary"
              style={{ alignSelf: 'flex-start' }}
              disabled={!idea.stageStatus.canAdvance || !recipeId || !epicTitle.trim()}
              title={idea.stageStatus.canAdvance ? undefined : idea.stageStatus.requirements.filter((r) => r.level === 'required' && !r.passed).map((r) => r.label).join(', ')}
              onClick={() => {
                if (!recipeId) return;
                postMessage({
                  type: 'markIdeaReady', ideaId: idea.id, revision: idea.ideaRevision, recipeId, epicTitle: epicTitle.trim(),
                });
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
