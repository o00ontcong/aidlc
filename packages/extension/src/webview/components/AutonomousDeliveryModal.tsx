import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bug,
  CheckCircle2,
  FileText,
  GitMerge,
  KeyRound,
  ListPlus,
  Pencil,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react';
import { Modal, ModalCancelButton, ModalFooter } from './Modal';
import { postMessage } from '@/lib/bridge';
import {
  autonomousDeliveryReadiness,
  autonomousDeliveryActions,
  type AutonomousDeliveryActionId,
  type AutonomousPipelineLike,
} from '@/lib/autonomousDelivery';
import type { AutonomousDeliverySummary } from '@/lib/types';
import { pickAndReadFile } from '@/lib/pickFile';

type ActionMessage =
  | 'startAutonomousDelivery'
  | 'resumeAutonomousDelivery'
  | 'openAutonomousReviewSummary'
  | 'addAutonomousReviewTask'
  | 'editInferredProjectContext'
  | 'resumeAutonomousAfterMerge'
  | 'reworkAutonomousDelivery'
  | 'openAutonomousFailureLog'
  | 'openClaudeLoginTerminal'
  | 'runAutonomousDoctor'
  | 'reconcileAutonomousValidators';

interface DeliveryAction {
  message: ActionMessage;
  label: string;
  description: string;
  icon: typeof Play;
  primary?: boolean;
}

const DELIVERY_ACTIONS: Record<AutonomousDeliveryActionId, DeliveryAction> = {
  resume: {
    message: 'resumeAutonomousDelivery',
    label: 'Resume from checkpoint',
    description: 'Continue the same delivery and unchanged current step.',
    icon: RefreshCw,
    primary: true,
  },
  'claude-login': {
    message: 'openClaudeLoginTerminal',
    label: 'Sign in to Claude',
    description: 'Open an interactive terminal and run claude /login.',
    icon: KeyRound,
    primary: true,
  },
  doctor: {
    message: 'runAutonomousDoctor',
    label: 'Run diagnostics',
    description: 'Check the Claude binary, authentication and workspace.',
    icon: Activity,
  },
  'open-log': {
    message: 'openAutonomousFailureLog',
    label: 'Open failure log',
    description: 'Inspect the durable, secret-redacted error evidence.',
    icon: Bug,
  },
  'resolve-validators': {
    message: 'reconcileAutonomousValidators',
    label: 'Resolve validator conflicts',
    description: 'Review each .aidlc-new file and keep or accept it.',
    icon: ShieldCheck,
    primary: true,
  },
  'open-review': {
    message: 'openAutonomousReviewSummary',
    label: 'Open review summary',
    description: 'Reopen the aggregate evidence, risks, test results and human tasks.',
    icon: FileText,
  },
  'add-review-task': {
    message: 'addAutonomousReviewTask',
    label: 'Request correction',
    description: 'Describe a correction; AIDLC routes it and selectively reruns affected work.',
    icon: ListPlus,
  },
  rework: {
    message: 'reworkAutonomousDelivery',
    label: 'Run pending corrections',
    description: 'Apply all open review tasks and rebuild the review bundle.',
    icon: Wrench,
    primary: true,
  },
  'edit-context': {
    message: 'editInferredProjectContext',
    label: 'Edit inferred project context',
    description: 'Correct the provisional charter and refresh downstream alignment.',
    icon: Pencil,
  },
  'complete-after-merge': {
    message: 'resumeAutonomousAfterMerge',
    label: 'Verify merge & complete',
    description: 'Verify the human merge, sync project knowledge and write the final summary.',
    icon: GitMerge,
    primary: true,
  },
};

function statusLabel(status: AutonomousDeliverySummary['status']): string {
  return status.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

export function AutonomousDeliveryModal({
  pipelines,
  deliveries,
  onClose,
}: {
  pipelines: AutonomousPipelineLike[];
  deliveries: AutonomousDeliverySummary[];
  onClose: () => void;
}) {
  const readiness = autonomousDeliveryReadiness(pipelines);
  const [screen, setScreen] = useState<'menu' | 'start'>('menu');
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [formError, setFormError] = useState('');

  const run = (message: ActionMessage, deliveryId?: string) => {
    postMessage({ type: message, deliveryId });
    onClose();
  };

  const loadRequirementFile = async () => {
    setFormError('');
    try {
      const result = await pickAndReadFile();
      if (!result) return;
      setDescription(result.content);
      setSourceRef(result.fileName);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const submitStart = () => {
    const cleanId = id.trim();
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cleanId)) {
      setFormError('Feature ID must use letters, digits, dot, dash or underscore.');
      return;
    }
    if (!cleanTitle) {
      setFormError('Feature title is required.');
      return;
    }
    if (cleanDescription.length < 20) {
      setFormError('Feature request must contain at least 20 characters.');
      return;
    }
    postMessage({
      type: 'startAutonomousDeliveryInline',
      request: {
        id: cleanId,
        title: cleanTitle,
        description: cleanDescription,
        source: sourceRef
          ? { type: 'file', reference: sourceRef }
          : { type: 'manual' },
      },
    });
    onClose();
  };

  return (
    <Modal
      title={screen === 'start' ? 'Start Autonomous Delivery' : 'Existing Project Autonomous Delivery'}
      subtitle={
        screen === 'start'
          ? 'Describe one feature; AIDLC opens a visible Claude master command for the full delivery flow.'
          : 'Opt-in Claude-master delivery flow — guided pipelines remain unchanged.'
      }
      maxWidth="max-w-2xl"
      onClose={onClose}
      onSubmit={screen === 'start' ? submitStart : undefined}
    >
      {screen === 'start' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-[11.5px] font-medium text-foreground">
              <span>Feature / delivery ID</span>
              <input
                type="text"
                autoFocus
                value={id}
                placeholder="FEATURE-001"
                onChange={(event) => {
                  const next = event.target.value;
                  if (!title || title === id) setTitle(next);
                  setId(next);
                  setFormError('');
                }}
                className="w-full rounded-md border border-border bg-input/50 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>
            <label className="space-y-1.5 text-[11.5px] font-medium text-foreground">
              <span>Feature title</span>
              <input
                type="text"
                value={title}
                placeholder="Add auditable export"
                onChange={(event) => {
                  setTitle(event.target.value);
                  setFormError('');
                }}
                className="w-full rounded-md border border-border bg-input/50 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-[11.5px] font-medium text-foreground">
            <span>Feature request, constraints and acceptance criteria</span>
            <textarea
              value={description}
              rows={9}
              placeholder="Describe the desired behavior, constraints and acceptance criteria…"
              onChange={(event) => {
                setDescription(event.target.value);
                setSourceRef('');
                setFormError('');
              }}
              className="w-full resize-y rounded-md border border-border bg-input/50 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadRequirementFile()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11.5px] font-medium text-primary hover:border-primary/50 hover:bg-primary/10"
            >
              <Upload className="h-3.5 w-3.5" />
              Load requirement file
            </button>
            {sourceRef && (
              <span className="text-[10.5px] text-muted-foreground">
                Loaded <span className="font-mono text-foreground/80">{sourceRef}</span>
              </span>
            )}
          </div>

          {formError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
              {formError}
            </div>
          )}
        </div>
      ) : !readiness.ready ? (
        <div className="space-y-4">
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-[12px] leading-relaxed text-foreground/85">
            <div className="font-semibold text-warning">Cohesive Delivery is missing or outdated</div>
            <p className="mt-1 text-muted-foreground">
              Apply or upgrade the preset before autonomous execution. Custom pipelines with other IDs are preserved.
            </p>
            <ul className="mt-2 list-inside list-disc font-mono text-[11px] text-muted-foreground">
              {readiness.missingOrOutdated.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                postMessage({ type: 'applyCohesiveDelivery' });
              }}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Apply / upgrade Cohesive Delivery
            </button>
            <button
              type="button"
              onClick={() => postMessage({ type: 'openTemplateGuide', id: 'cohesive-delivery' })}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-xs font-medium text-primary hover:border-primary/50 hover:bg-primary/10"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Open guide
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Each delivery is one independent feature epic. You can run several independent
            deliveries at the same time; Claude decides any internal task decomposition.
            Each delivery opens one feature PR and never merges the default branch.
          </div>
          <button
            type="button"
            onClick={() => setScreen('start')}
            className="mb-3 flex w-full items-start gap-3 rounded-lg border border-primary/50 bg-primary/10 p-3 text-left hover:bg-primary/15"
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block text-xs font-semibold text-foreground">Start new delivery</span>
              <span className="mt-1 block text-[10.5px] leading-relaxed text-muted-foreground">
                Run one independent feature epic: context, contract, implementation, tests and PR creation.
              </span>
            </span>
          </button>

          {deliveries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[11.5px] text-muted-foreground">
              No existing autonomous deliveries. Start one above.
            </div>
          ) : (
            <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {deliveries.map((delivery) => {
                const actionIds = autonomousDeliveryActions(delivery);
                const failure = delivery.latestFailure;
                const isBlocked = delivery.status === 'blocked' || delivery.status === 'failed';
                return (
                  <section key={delivery.id} className="rounded-lg border border-border bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">{delivery.id}</span>
                          <span className={isBlocked
                            ? 'rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[9.5px] font-semibold text-destructive'
                            : delivery.status === 'completed'
                              ? 'rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[9.5px] font-semibold text-success'
                              : 'rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9.5px] font-semibold text-primary'}
                          >
                            {statusLabel(delivery.status)}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[11.5px] text-foreground/85">{delivery.title}</div>
                      </div>
                      {delivery.status === 'completed' && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] text-muted-foreground">
                      <span>Review R{delivery.reviewRevision}</span>
                      <span>Independent feature epic</span>
                      {delivery.openReviewTasks > 0 && (
                        <span>{delivery.openReviewTasks} correction{delivery.openReviewTasks === 1 ? '' : 's'} pending</span>
                      )}
                      <span>Updated {new Date(delivery.updatedAt).toLocaleString()}</span>
                    </div>

                    {(failure || delivery.lastError) && (
                      <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[10.5px] leading-relaxed">
                        <div className="flex items-center gap-1.5 font-semibold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {failure
                            ? `${failure.current ? 'Current' : 'Recovered'} · ${failure.code}`
                            : 'Legacy failure'}
                        </div>
                        <div className="mt-1 break-words text-foreground/80">
                          {failure?.summary ?? delivery.lastError}
                        </div>
                        {failure && (
                          <div className="mt-1 truncate font-mono text-[9.5px] text-muted-foreground" title={failure.logPath}>
                            {failure.logPath}
                          </div>
                        )}
                      </div>
                    )}

                    {actionIds.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {actionIds.map((actionId) => {
                          const action = DELIVERY_ACTIONS[actionId];
                          const Icon = action.icon;
                          return (
                            <button
                              key={actionId}
                              type="button"
                              onClick={() => run(action.message, delivery.id)}
                              title={action.description}
                              className={action.primary
                                ? 'inline-flex items-center gap-2 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-2 text-left text-[10.5px] font-semibold text-primary hover:bg-primary/20'
                                : 'inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left text-[10.5px] font-medium text-foreground/85 hover:border-primary/40 hover:bg-accent/50'}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              {action.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <ModalFooter>
        <button
          type="button"
          onClick={() => postMessage({ type: 'openTemplateGuide', id: 'cohesive-delivery' })}
          className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11.5px] font-medium text-primary hover:border-primary/50 hover:bg-primary/10"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Help & guide
        </button>
        {screen === 'start' && (
          <button
            type="button"
            onClick={() => {
              setScreen('menu');
              setFormError('');
            }}
            className="rounded-md border border-border px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Back
          </button>
        )}
        <ModalCancelButton onClick={onClose} />
        {screen === 'start' && (
          <button
            type="button"
            onClick={submitStart}
            className="rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-[11.5px] font-semibold text-primary hover:border-primary hover:bg-primary/25"
          >
            Start delivery
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
