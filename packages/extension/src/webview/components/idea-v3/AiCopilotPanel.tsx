/* AI Copilot — intentionally exposes only the two useful execution paths:
 * run the current Idea pipeline in the configured provider, or copy the
 * selected stage's explicit slash command for a session the user owns.
 * Existing pending actions stay visible because Accept/Reject is the human
 * approval gate, not another way of invoking the agent.
 */

import { useState } from 'react';
import { Copy, Play, Sparkles } from 'lucide-react';
import type { IdeaStage, IdeaSummary, PendingIdeaAction } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card, CardHeader, CardTitle } from '../epic-v3/primitives';
import { V3Textarea } from '../epic-v3/V3Modal';

export function AiCopilotPanel({
  idea, language, stage,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  stage: IdeaStage;
}) {
  const copy = ideasCopy(language);
  const [note, setNote] = useState('');

  const runStage = () => {
    postMessage({ type: 'runIdeaAgentStage', ideaId: idea.id, revision: idea.ideaRevision, stage, userMessage: note.trim() || undefined });
  };

  const copyCommand = () => {
    postMessage({ type: 'copyIdeaAgentCommand', ideaId: idea.id, revision: idea.ideaRevision, stage, userMessage: note.trim() || undefined });
  };

  const resolve = (actionId: string, verdict: 'accept' | 'reject') => {
    postMessage({ type: 'resolveIdeaPendingAction', ideaId: idea.id, revision: idea.ideaRevision, actionId, verdict });
  };

  return (
    <div style={{ width: 260, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 0 }}>
      {idea.pendingActions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10.5, color: 'var(--warn)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {copy.stages.aiProposes} · {idea.pendingActions.length}
          </div>
          {idea.pendingActions.map((pending) => (
            <PendingActionCard
              key={pending.id}
              pending={pending}
              language={language}
              onAnswer={setNote}
              onResolve={(verdict) => resolve(pending.id, verdict)}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader pad="9px 12px"><CardTitle><Sparkles size={13} style={{ marginRight: 4, verticalAlign: -2 }} />{copy.stages.continueWithAi}</CardTitle></CardHeader>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <V3Textarea value={note} onChange={setNote} rows={2} placeholder={copy.stages.notePlaceholder} />
          <Btn label={<><Play size={12} />{copy.stages.runStage(copy.stages.labels[stage])}</>} variant="primary" onClick={runStage} title={copy.stages.runStageHint(copy.stages.labels[stage])} />
          <div style={{ fontSize: 10, color: 'var(--txt3)', lineHeight: 1.4 }}>{copy.stages.runStageHint(copy.stages.labels[stage])}</div>
          <Btn label={<><Copy size={12} />{copy.stages.copyCommand}</>} onClick={copyCommand} title={copy.stages.copyCommandHint} />
          <div style={{ fontSize: 10, color: 'var(--txt3)', lineHeight: 1.4 }}>{copy.stages.copyCommandHint}</div>
        </div>
      </Card>
    </div>
  );
}

function PendingActionCard({
  pending, language, onAnswer, onResolve,
}: {
  pending: PendingIdeaAction;
  language: IdeasLanguage;
  onAnswer: (text: string) => void;
  onResolve: (verdict: 'accept' | 'reject') => void;
}) {
  const copy = ideasCopy(language);
  if (pending.actionType === 'ask_user') {
    const question = typeof pending.payload.question === 'string' ? pending.payload.question : pending.summary;
    return (
      <Card style={{ border: '1px solid var(--warn-bd)' }}>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 600 }}>{question}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {copy.stages.quickReplies.map((label) => (
              <Btn key={label} label={label} pad="4px 9px" fs={10.5} onClick={() => { onAnswer(`${question} → ${label}`); onResolve('reject'); }} />
            ))}
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 10.5, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{copy.stages.aiProposes}</div>
        <div style={{ fontSize: 11, color: 'var(--txt2)', lineHeight: 1.5 }}>{pending.summary}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn label={copy.stages.accept} variant="primary" pad="4px 9px" fs={10.5} onClick={() => onResolve('accept')} />
          <Btn label={copy.stages.reject} variant="danger" pad="4px 9px" fs={10.5} onClick={() => onResolve('reject')} />
        </div>
      </div>
    </Card>
  );
}
