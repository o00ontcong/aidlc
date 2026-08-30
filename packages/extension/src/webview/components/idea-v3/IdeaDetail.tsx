/* v3 Idea detail column — 1:1 restyle of the previous plain-Tailwind
 * `IdeaDetail`/`PrepPanel`/`SelfAnsweredList`/`RouteTerminalPanel`/
 * `RoutePanel`/`DeliveryPanel`/terminal blocks onto the v3 primitives. Same
 * state, same conditions, same `postMessage` calls — only the JSX/styling
 * layer changed. Every confirm dialog now uses `V3Modal` instead of the old
 * ad-hoc `fixed inset-0` blocks / the retired local `ConfirmModal`.
 *
 * The card below `IdeaStepper` is keyed on the *clicked* station
 * (`focusedStation`), not directly on `idea.checkpoint` — mirroring Epic's
 * `FlowCard`/`StepDetailCard` (click a step, see its detail below,
 * regardless of whether it's the run's current step). Every field an Idea
 * carries (`prep.selfAnswered`, `routeDraft`, `children`) survives past its
 * own checkpoint, so a past station still has something real to show; a
 * station not yet reached shows a plain "not there yet" card instead of
 * fabricating data that doesn't exist.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, Flag, Loader2, Pencil, RotateCcw, Square, Trash2 } from 'lucide-react';

import type { IdeaSelfAnswered, IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import {
  Btn, Card, CardHeader, CardNote, CardTitle, Chip, Mono, SectionLabel, Spacer, StatusBadgeV3,
} from '../epic-v3/primitives';
import { V3Callout, V3Modal, V3ModalFooter, V3ModalHeader, V3Textarea } from '../epic-v3/V3Modal';
import { IdeaStepper } from './IdeaStepper';
import { currentStationKey, FILTER_TONE, inboxBucket, type StationKey } from './idea-adapt';

/** Persisted by the host when the person, rather than the provider, stops a phase. */
const IDEA_AGENT_STOPPED = 'Stopped by user.';

export function IdeaDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [editingSeed, setEditingSeed] = useState(false);
  const [seedDraft, setSeedDraft] = useState(idea.seedSentence);
  const [confirmingSeedRerun, setConfirmingSeedRerun] = useState(false);
  const [confirmingAnswerEdit, setConfirmingAnswerEdit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const canEditSeed = !['route_proposed', 'in_delivery', 'completed', 'closed'].includes(idea.checkpoint);

  useEffect(() => {
    setEditingSeed(false);
    setSeedDraft(idea.seedSentence);
    setConfirmingSeedRerun(false);
    setConfirmingAnswerEdit(false);
    setConfirmingDelete(false);
  }, [idea.id, idea.ideaRevision, idea.seedSentence]);

  const current = currentStationKey(idea);
  const [focusedStation, setFocusedStation] = useState<StationKey>(current);
  useEffect(() => { setFocusedStation(current); }, [idea.id, current]);

  const tone = FILTER_TONE[inboxBucket(idea)];

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mono style={{ fontSize: 11.5, color: 'var(--txt3)', flex: 'none' }}>{idea.id}</Mono>
            <div
              style={{
                fontSize: 15, color: 'var(--txt)', fontWeight: 700, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {idea.title}
            </div>
            <StatusBadgeV3 icon={tone.icon} label={copy.checkpointLabel[idea.checkpoint]} bg={tone.bg} fg={tone.fg} />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt3)' }}>
            {copy.resume.savedAt(new Date(idea.updatedAt).toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }))}
          </div>
        </div>
        {idea.checkpoint !== 'shelved' && idea.checkpoint !== 'completed' && (
          <Btn label={<><RotateCcw size={12} style={{ marginRight: 4 }} />{copy.resume.restart}</>} onClick={() => setConfirmingRestart(true)} />
        )}
      </div>

      {idea.checkpoint !== 'shelved' && (
        <IdeaStepper idea={idea} language={language} focusedKey={focusedStation} onNodeClick={setFocusedStation} />
      )}

      <Card>
        <CardHeader>
          <SectionLabel>{copy.capture.prompt}</SectionLabel>
          <Spacer />
          {canEditSeed && !editingSeed && (
            <Btn label={<><Pencil size={11} style={{ marginRight: 4 }} />{copy.capture.edit}</>} pad="4px 8px" fs={11} onClick={() => setEditingSeed(true)} />
          )}
        </CardHeader>
        <div style={{ padding: 12 }}>
          {editingSeed ? (
            <>
              <V3Textarea value={seedDraft} onChange={setSeedDraft} rows={3} autoFocus />
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Btn label={copy.resume.cancel} onClick={() => { setSeedDraft(idea.seedSentence); setEditingSeed(false); }} />
                <Btn
                  label={copy.capture.saveAndRerun}
                  variant="primary"
                  disabled={!seedDraft.trim() || seedDraft.trim() === idea.seedSentence}
                  onClick={() => setConfirmingSeedRerun(true)}
                />
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.6 }}>{idea.seedSentence}</div>
          )}
        </div>
      </Card>

      {idea.foundationStale && idea.checkpoint !== 'in_delivery' && idea.checkpoint !== 'completed' && idea.checkpoint !== 'closed' && (
        <V3Callout tone="acc">{copy.foundationStaleBanner}</V3Callout>
      )}

      {(idea.saveStatus === 'failed' || idea.saveStatus === 'saving') && (
        <V3Callout tone={idea.saveStatus === 'failed' ? 'err' : 'acc'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>{idea.saveStatus === 'failed' ? copy.batch.saveFailed : copy.batch.saving}</div>
            {idea.saveStatus === 'failed' && (
              <Btn label={copy.batch.retrySave} variant="primary" pad="4px 10px" fs={11} onClick={() => postMessage({ type: 'reloadIdeasState' })} />
            )}
          </div>
        </V3Callout>
      )}

      {idea.checkpoint !== 'shelved' && (
        <StationDetail
          station={focusedStation}
          idea={idea}
          language={language}
          onRequestEditAnswers={() => setConfirmingAnswerEdit(true)}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {idea.checkpoint === 'shelved' && (
          <Btn label={copy.actions.reopen} variant="primary" onClick={() => postMessage({ type: 'reopenIdea', ideaId: idea.id, revision: idea.ideaRevision })} />
        )}
        {idea.checkpoint !== 'shelved' && idea.checkpoint !== 'closed' && idea.checkpoint !== 'completed' && (
          <Btn label={copy.actions.shelve} onClick={() => postMessage({ type: 'shelveIdea', ideaId: idea.id, revision: idea.ideaRevision })} />
        )}
        <Btn
          label={<><Trash2 size={11} style={{ marginRight: 4 }} />{copy.actions.delete}</>}
          variant="danger"
          onClick={() => setConfirmingDelete(true)}
        />
      </div>

      {confirmingDelete && (
        <V3Modal
          width={420}
          danger
          onClose={() => setConfirmingDelete(false)}
          header={<V3ModalHeader title={copy.actions.deleteConfirmTitle} onClose={() => setConfirmingDelete(false)} tone="err" />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setConfirmingDelete(false)} />
              <Btn
                label={copy.actions.deleteConfirm}
                variant="danger"
                onClick={() => {
                  postMessage({ type: 'deleteIdea', ideaId: idea.id, revision: idea.ideaRevision });
                  setConfirmingDelete(false);
                }}
              />
            </V3ModalFooter>
          )}
        >
          <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.actions.deleteConfirmBody}</div>
        </V3Modal>
      )}

      {confirmingRestart && (
        <V3Modal
          width={420}
          danger
          onClose={() => setConfirmingRestart(false)}
          header={<V3ModalHeader title={copy.resume.restartConfirmTitle} onClose={() => setConfirmingRestart(false)} tone="err" />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setConfirmingRestart(false)} />
              <Btn
                label={copy.resume.restartConfirm}
                variant="danger"
                onClick={() => {
                  postMessage({ type: 'restartIdea', ideaId: idea.id, revision: idea.ideaRevision });
                  setConfirmingRestart(false);
                }}
              />
            </V3ModalFooter>
          )}
        >
          <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.resume.restartConfirmBody}</div>
        </V3Modal>
      )}

      {confirmingSeedRerun && (
        <V3Modal
          width={420}
          onClose={() => setConfirmingSeedRerun(false)}
          header={<V3ModalHeader title={copy.capture.editConfirmTitle} onClose={() => setConfirmingSeedRerun(false)} />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setConfirmingSeedRerun(false)} />
              <Btn
                label={copy.capture.editConfirm}
                variant="primary"
                onClick={() => {
                  postMessage({ type: 'patchIdeaSeed', ideaId: idea.id, revision: idea.ideaRevision, seedSentence: seedDraft.trim() });
                  setConfirmingSeedRerun(false);
                  setEditingSeed(false);
                }}
              />
            </V3ModalFooter>
          )}
        >
          <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.capture.editConfirmBody}</div>
        </V3Modal>
      )}

      {confirmingAnswerEdit && (
        <V3Modal
          width={420}
          onClose={() => setConfirmingAnswerEdit(false)}
          header={<V3ModalHeader title={copy.batch.editAnswersConfirmTitle} onClose={() => setConfirmingAnswerEdit(false)} />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setConfirmingAnswerEdit(false)} />
              <Btn
                label={copy.batch.editAnswersConfirm}
                variant="primary"
                onClick={() => {
                  postMessage({ type: 'reopenIdeaAnswers', ideaId: idea.id, revision: idea.ideaRevision });
                  setConfirmingAnswerEdit(false);
                }}
              />
            </V3ModalFooter>
          )}
        >
          <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.batch.editAnswersConfirmBody}</div>
        </V3Modal>
      )}
    </div>
  );
}

/** Dispatches the card below the stepper to whichever station is focused — not necessarily the current one. */
function StationDetail({
  station, idea, language, onRequestEditAnswers,
}: {
  station: StationKey;
  idea: IdeaSummary;
  language: IdeasLanguage;
  onRequestEditAnswers: () => void;
}) {
  if (station === 'capture') return <CaptureStationDetail idea={idea} language={language} />;
  if (station === 'intent') return <IntentStationDetail idea={idea} language={language} onRequestEditAnswers={onRequestEditAnswers} />;
  if (station === 'route') return <RouteStationDetail idea={idea} language={language} />;
  if (station === 'delivery') return <DeliveryStationDetail idea={idea} language={language} />;
  return <EndStationDetail idea={idea} language={language} />;
}

function NotReachedCard({ language }: { language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  return (
    <Card>
      <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>
        {copy.stationRecap.notReached}
      </div>
    </Card>
  );
}

const BEFORE_INTENT = new Set(['captured', 'preparing', 'awaiting_human']);
const BEFORE_ROUTE = new Set(['captured', 'preparing', 'awaiting_human', 'intent_drafted']);

function CaptureStationDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  if (BEFORE_INTENT.has(idea.checkpoint)) {
    return (
      <>
        {idea.checkpoint === 'captured' && <PrepPanel state="ready" idea={idea} language={language} />}
        {idea.checkpoint === 'preparing' && (
          <PrepPanel state={idea.prep.status === 'failed' ? 'failed' : 'running'} idea={idea} language={language} />
        )}
        {idea.checkpoint === 'awaiting_human' && (
          <>
            {idea.prep.selfAnswered.length > 0 && <SelfAnsweredList idea={idea} language={language} />}
            <PrepPanel state="waiting" idea={idea} language={language} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      {idea.prep.selfAnswered.length > 0 && <SelfAnsweredList idea={idea} language={language} />}
      <Card><CardHeader><CardTitle>{copy.stationRecap.captureDone}</CardTitle></CardHeader></Card>
    </>
  );
}

function IntentStationDetail({
  idea, language, onRequestEditAnswers,
}: { idea: IdeaSummary; language: IdeasLanguage; onRequestEditAnswers: () => void }) {
  const copy = ideasCopy(language);
  if (BEFORE_INTENT.has(idea.checkpoint)) return <NotReachedCard language={language} />;

  if (idea.checkpoint === 'intent_drafted') {
    return (
      <>
        {idea.blockedReason ? (
          <Card>
            <CardHeader>
              <CardTitle>{idea.blockedReason === IDEA_AGENT_STOPPED ? copy.route.stoppedTitle : copy.route.blockedTitle}</CardTitle>
            </CardHeader>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11.5, color: 'var(--err)', lineHeight: 1.6 }}>
                {idea.blockedReason === IDEA_AGENT_STOPPED ? copy.route.stoppedBody : idea.blockedReason}
              </div>
              <Btn
                label={copy.route.retry}
                variant="primary"
                onClick={() => postMessage({ type: 'retryIdeaRoute', ideaId: idea.id, revision: idea.ideaRevision })}
              />
            </div>
          </Card>
        ) : (
          <RouteTerminalPanel idea={idea} language={language} />
        )}
        {idea.prep.questions.length > 0 && (
          <Btn label={<><Pencil size={11} style={{ marginRight: 4 }} />{copy.batch.editAnswers}</>} onClick={onRequestEditAnswers} />
        )}
      </>
    );
  }

  // Past — checkpoint moved on to route_proposed / in_delivery / closed / completed.
  return (
    <Card>
      <CardHeader><CardTitle>{copy.stationRecap.intentDone}</CardTitle></CardHeader>
      <div style={{ padding: 12 }}>
        <Btn label={copy.route.viewIntent} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'INTENT.md' })} />
      </div>
    </Card>
  );
}

function RouteStationDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  if (BEFORE_ROUTE.has(idea.checkpoint)) return <NotReachedCard language={language} />;

  if (idea.checkpoint === 'route_proposed') return <RoutePanel idea={idea} language={language} />;

  // Past — routing already resolved, either to a close or to a confirmed epics route.
  if (idea.routeDraft?.outcome === 'close') {
    return (
      <Card>
        <CardHeader><CardTitle>{copy.stationRecap.routeClosed}</CardTitle></CardHeader>
        <div style={{ padding: 12 }}>
          <Btn label={copy.closed.viewEvidence} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'EVIDENCE.md' })} />
        </div>
      </Card>
    );
  }
  const steps = idea.routeDraft?.steps ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <CardNote>{copy.stationRecap.routeDone}</CardNote>
      {steps.map((step, i) => (
        <Card key={`${step.recipeId}-${i}`}>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--acc-txt)' }}>{i + 1}</span>
              <span className="v3-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt)' }}>{step.recipeId}</span>
              <span style={{ fontSize: 11, color: 'var(--txt2)' }}>· {step.epicTitle}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--txt3)' }}>{step.rationale}</div>
          </div>
        </Card>
      ))}
      <Btn label={copy.route.viewRoute} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'ROUTE.md' })} />
    </div>
  );
}

function DeliveryStationDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  if (BEFORE_ROUTE.has(idea.checkpoint) || idea.checkpoint === 'route_proposed') return <NotReachedCard language={language} />;
  if (idea.children.length === 0) {
    // Covers both "not there yet" and a close-outcome idea that skipped
    // delivery entirely — honest either way, since no epic exists in both cases.
    return <Card><CardHeader><CardTitle>{copy.stationRecap.deliveryNone}</CardTitle></CardHeader></Card>;
  }
  return <DeliveryPanel idea={idea} language={language} />;
}

function EndStationDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  if (idea.checkpoint !== 'closed' && idea.checkpoint !== 'completed') return <NotReachedCard language={language} />;
  if (idea.checkpoint === 'completed') {
    return <Card><CardHeader><CardTitle>{copy.completed.title}</CardTitle></CardHeader></Card>;
  }
  return (
    <Card>
      <CardHeader><CardTitle>{copy.closed.title}</CardTitle></CardHeader>
      {idea.routeDraft?.evidence && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{idea.routeDraft.evidence}</div>
          <Btn label={copy.closed.viewEvidence} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'EVIDENCE.md' })} />
        </div>
      )}
    </Card>
  );
}

function PrepPanel({ state, idea, language }: { state: 'ready' | 'running' | 'waiting' | 'failed'; idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const stopped = idea.prep.error === IDEA_AGENT_STOPPED;

  return (
    <Card style={state === 'failed' ? { border: '1px solid var(--err-bd)' } : undefined}>
      <CardHeader>
        {state === 'running' && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--warn)' }} />}
        <CardTitle>
          {state === 'ready' ? copy.prep.readyTitle
            : state === 'failed' ? (stopped ? copy.prep.stoppedTitle : copy.prep.failedTitle)
              : state === 'waiting' ? copy.prep.waitingTitle : copy.prep.runningTitle}
        </CardTitle>
      </CardHeader>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state === 'ready' && <CardNote>{copy.prep.readyBody}</CardNote>}
        {state === 'running' && <CardNote>{copy.prep.runningBody}</CardNote>}
        {state === 'waiting' && <CardNote>{copy.prep.waitingBody}</CardNote>}
        {state === 'failed' && (
          <div style={{ fontSize: 11.5, color: 'var(--err)', lineHeight: 1.6 }}>{stopped ? copy.prep.stoppedBody : idea.prep.error}</div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {state === 'ready' && (
            <Btn label={copy.prep.runInTerminal} variant="primary" onClick={() => postMessage({ type: 'runIdeaProvider', ideaId: idea.id })} />
          )}
          {(state === 'running' || state === 'waiting') && (
            <>
              <Btn label={copy.prep.openTerminal} onClick={() => postMessage({ type: 'openIdeaTerminal', ideaId: idea.id })} />
              {state === 'running' && (
                <Btn label={<><Square size={10} style={{ marginRight: 4 }} />{copy.prep.stop}</>} variant="danger" onClick={() => setConfirmingStop(true)} />
              )}
            </>
          )}
          {state === 'failed' && (
            <Btn label={copy.prep.retry} variant="primary" onClick={() => postMessage({ type: 'retryIdeaPrep', ideaId: idea.id })} />
          )}
        </div>
      </div>

      {confirmingStop && (
        <V3Modal
          width={420}
          danger
          onClose={() => setConfirmingStop(false)}
          header={<V3ModalHeader title={copy.prep.stopConfirmTitle} onClose={() => setConfirmingStop(false)} tone="err" />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setConfirmingStop(false)} />
              <Btn
                label={copy.prep.stopConfirm}
                variant="danger"
                onClick={() => {
                  postMessage({ type: 'stopIdeaRun', ideaId: idea.id, revision: idea.ideaRevision, phase: 'prep' });
                  setConfirmingStop(false);
                }}
              />
            </V3ModalFooter>
          )}
        >
          <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.prep.stopConfirmBody}</div>
        </V3Modal>
      )}
    </Card>
  );
}

function RouteTerminalPanel({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  return (
    <Card>
      <CardHeader><CardTitle>{copy.route.readyTitle}</CardTitle></CardHeader>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CardNote>{copy.route.readyBody}</CardNote>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Btn label={copy.route.runInTerminal} variant="primary" onClick={() => postMessage({ type: 'runIdeaProvider', ideaId: idea.id })} />
          <Btn label={copy.route.viewIntent} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'INTENT.md' })} />
        </div>
      </div>
    </Card>
  );
}

function SelfAnsweredList({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', cursor: 'pointer', border: 'none', background: 'transparent', font: 'inherit',
          padding: '11px 14px', borderBottom: expanded ? '1px solid var(--bd)' : 'none',
          display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <CardTitle>{copy.prep.selfAnsweredHeader(idea.prep.selfAnswered.length)}</CardTitle>
          {!expanded && <CardNote>{copy.prep.selfAnsweredCaption}</CardNote>}
        </div>
        <ChevronDown size={15} style={{ color: 'var(--txt3)', transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>
      {expanded && (
        <div style={{ padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {idea.prep.selfAnswered.map((entry, index) => (
            <SelfAnsweredRow key={`${entry.question}-${index}`} ideaId={idea.id} revision={idea.ideaRevision} entry={entry} index={index} language={language} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SelfAnsweredRow({
  ideaId, revision, entry, index, language,
}: {
  ideaId: string; revision: number; entry: IdeaSelfAnswered; index: number; language: IdeasLanguage;
}) {
  const copy = ideasCopy(language);
  return (
    <div style={{ borderRadius: 6, padding: '8px 8px', background: entry.flagged ? 'var(--err-bg)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt)' }}>{entry.question}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: 'var(--txt2)' }}>{entry.answer}</div>
        </div>
        <Chip mono label={entry.source} />
      </div>
      {entry.flagged ? (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--err)' }}>
          <Flag size={11} /> {copy.prep.flagged}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => postMessage({ type: 'flagIdeaSelfAnswer', ideaId, revision, index })}
          style={{
            marginTop: 4, cursor: 'pointer', background: 'none', border: 'none', padding: 0,
            fontSize: 10.5, color: 'var(--txt3)', textDecoration: 'underline dotted', fontFamily: 'inherit',
          }}
        >
          {copy.prep.flagWrong}
        </button>
      )}
    </div>
  );
}

function RoutePanel({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [confirming, setConfirming] = useState(false);
  const steps = idea.routeDraft?.steps ?? [];
  const hasBootstrap = steps[0]?.recipeId === 'cofofo-bootstrap';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionLabel>{copy.route.title}</SectionLabel>
      {hasBootstrap && <V3Callout tone="acc">{copy.route.bootstrapBanner}</V3Callout>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <Card key={`${step.recipeId}-${i}`}>
            <div style={{ padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--acc-txt)' }}>{i + 1}</span>
                <span className="v3-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt)' }}>{step.recipeId}</span>
                <span style={{ fontSize: 11, color: 'var(--txt2)' }}>· {step.epicTitle}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--txt3)' }}>{step.rationale}</div>
            </div>
          </Card>
        ))}
      </div>

      {idea.assumptions.length > 0 && (
        <Card>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)' }}>{copy.route.assumptionsHeader(idea.assumptions.length)}</div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {idea.assumptions.map((assumption) => (
                <div key={assumption.id} style={{ fontSize: 11, color: 'var(--txt2)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <Chip mono label="assumption" />
                  <span>{assumption.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <CardNote>{copy.route.footerNote}</CardNote>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Btn label={copy.route.confirm} variant="primary" onClick={() => setConfirming(true)} />
        <Btn label={copy.route.viewRoute} onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'ROUTE.md' })} />
      </div>

      {confirming && (
        <V3Modal
          width={420}
          onClose={() => setConfirming(false)}
          header={<V3ModalHeader title={`${copy.route.confirm}?`} onClose={() => setConfirming(false)} />}
          footer={(
            <V3ModalFooter>
              <Btn label={copy.resume.cancel} onClick={() => setConfirming(false)} />
              <Btn
                label={copy.route.confirm}
                variant="primary"
                onClick={() => {
                  postMessage({ type: 'confirmIdeaRoute', ideaId: idea.id, revision: idea.ideaRevision });
                  setConfirming(false);
                }}
              />
            </V3ModalFooter>
          )}
        >
          <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{copy.route.footerNote}</div>
        </V3Modal>
      )}
    </div>
  );
}

function DeliveryPanel({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {idea.children.map((child) => (
        <Card key={child.epicId}>
          <div style={{ padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt)' }}>{copy.delivery.title(child.recipeId)}</div>
              <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--txt3)' }}>
                {child.epicId} · {copy.delivery.childStatus}: {child.runStatus}
              </div>
            </div>
            <Btn
              label={copy.delivery.openCanvas}
              variant="primary"
              onClick={() => postMessage({ type: 'reviewCanvasStep', runId: child.epicId, stepIdx: child.canvasStepIdx ?? 0 })}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
