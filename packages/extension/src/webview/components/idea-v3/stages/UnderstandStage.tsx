import { useEffect, useState } from 'react';
import type { IdeaSummary, IdeaUnderstand } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card, CardHeader, CardTitle } from '../../epic-v3/primitives';
import { EmptyHint, FieldCard, StringListEditor, TextAreaField } from './shared';

export function UnderstandStage({
  idea, language, readOnly, isCurrent,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  readOnly: boolean;
  isCurrent: boolean;
}) {
  const copy = ideasCopy(language);
  const c = copy.stages.understand;
  const [draft, setDraft] = useState<IdeaUnderstand>(idea.understand);

  useEffect(() => { setDraft(idea.understand); }, [idea.id, idea.ideaRevision]);

  const persist = (patch: Partial<IdeaUnderstand>) => {
    postMessage({ type: 'updateIdeaUnderstand', ideaId: idea.id, revision: idea.ideaRevision, patch });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Card>
        <CardHeader pad="9px 12px"><CardTitle>{c.originalIdea}</CardTitle></CardHeader>
        <div style={{ padding: 12, fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {idea.seedSentence}
        </div>
      </Card>

      <FieldCard title={c.problem}>
        <TextAreaField
          value={draft.problem}
          onChange={(v) => setDraft((d) => ({ ...d, problem: v }))}
          onBlurSave={() => persist({ problem: draft.problem })}
          readOnly={readOnly}
        />
      </FieldCard>

      <FieldCard title={c.context}>
        <TextAreaField
          value={draft.context}
          onChange={(v) => setDraft((d) => ({ ...d, context: v }))}
          onBlurSave={() => persist({ context: draft.context })}
          readOnly={readOnly}
        />
      </FieldCard>

      <FieldCard title={c.users}>
        <EmptyHint>{c.usersHint}</EmptyHint>
        <StringListEditor
          items={draft.users}
          onChange={(users) => setDraft((d) => ({ ...d, users }))}
          onBlurSave={() => persist({ users: draft.users })}
          readOnly={readOnly}
          addLabel={copy.stages.add}
        />
      </FieldCard>

      <FieldCard title={c.assumptions}>
        <StringListEditor
          items={draft.assumptions}
          onChange={(assumptions) => setDraft((d) => ({ ...d, assumptions }))}
          onBlurSave={() => persist({ assumptions: draft.assumptions })}
          readOnly={readOnly}
          addLabel={copy.stages.add}
        />
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
