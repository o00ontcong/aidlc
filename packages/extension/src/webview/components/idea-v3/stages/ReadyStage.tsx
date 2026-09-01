import type { IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card, CardNote, Mono } from '../../epic-v3/primitives';
import { V3Callout } from '../../epic-v3/V3Modal';

export function ReadyStage({ idea, language, readOnly = false }: { idea: IdeaSummary; language: IdeasLanguage; readOnly?: boolean }) {
  const copy = ideasCopy(language);
  const c = copy.stages.ready;

  if (idea.stage !== 'ready') {
    return <Card><div style={{ padding: 14 }}><CardNote>{c.notReadyYet}</CardNote></div></Card>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <V3Callout tone="acc">{c.hint}</V3Callout>
      <Card>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
            {copy.stages.decide.recipe}: <Mono>{idea.readyRecipeId}</Mono>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
            {copy.stages.decide.epicTitle}: {idea.readyEpicTitle}
          </div>
          {!readOnly && (
            <Btn
              label={c.scaffoldEpic}
              variant="primary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => postMessage({ type: 'scaffoldIdea', ideaId: idea.id, revision: idea.ideaRevision })}
            />
          )}
        </div>
      </Card>
      <Btn label={c.openResearchFile} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'RESEARCH.md' })} style={{ alignSelf: 'flex-start' }} />
    </div>
  );
}
