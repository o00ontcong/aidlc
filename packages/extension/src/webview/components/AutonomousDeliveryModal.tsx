import { useState } from 'react';
import {
  BookOpen,
  FileText,
  GitMerge,
  ListPlus,
  Pencil,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Modal, ModalCancelButton, ModalFooter } from './Modal';
import { postMessage } from '@/lib/bridge';
import {
  autonomousDeliveryReadiness,
  type AutonomousPipelineLike,
} from '@/lib/autonomousDelivery';
import { pickAndReadFile } from '@/lib/pickFile';

type ActionMessage =
  | 'startAutonomousDelivery'
  | 'resumeAutonomousDelivery'
  | 'openAutonomousReviewSummary'
  | 'addAutonomousReviewTask'
  | 'editInferredProjectContext'
  | 'resumeAutonomousAfterMerge';

interface Action {
  message: ActionMessage;
  label: string;
  description: string;
  icon: typeof Play;
  primary?: boolean;
}

const ACTIONS: Action[] = [
  {
    message: 'startAutonomousDelivery',
    label: 'Start new delivery',
    description: 'Run project context, feature, work packages, integration, tests and PR creation.',
    icon: Sparkles,
    primary: true,
  },
  {
    message: 'resumeAutonomousDelivery',
    label: 'Resume interrupted delivery',
    description: 'Continue a stopped or blocked delivery from its durable state.',
    icon: RefreshCw,
  },
  {
    message: 'openAutonomousReviewSummary',
    label: 'Open review summary',
    description: 'Reopen the aggregate evidence, risks, test results and human tasks.',
    icon: FileText,
  },
  {
    message: 'addAutonomousReviewTask',
    label: 'Add review task',
    description: 'Describe a correction; AIDLC routes it and selectively reruns affected work.',
    icon: ListPlus,
  },
  {
    message: 'editInferredProjectContext',
    label: 'Edit inferred project context',
    description: 'Correct the provisional charter and refresh downstream alignment.',
    icon: Pencil,
  },
  {
    message: 'resumeAutonomousAfterMerge',
    label: 'Complete after merge',
    description: 'Verify the human merge, sync project knowledge and write the final summary.',
    icon: GitMerge,
  },
];

export function AutonomousDeliveryModal({
  pipelines,
  onClose,
}: {
  pipelines: AutonomousPipelineLike[];
  onClose: () => void;
}) {
  const readiness = autonomousDeliveryReadiness(pipelines);
  const [screen, setScreen] = useState<'menu' | 'start'>('menu');
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [formError, setFormError] = useState('');

  const run = (message: ActionMessage) => {
    postMessage({ type: message });
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
          ? 'Describe one feature; AIDLC will infer project context and execute the full delivery flow.'
          : 'Opt-in Cohesive Delivery flow — guided pipelines remain unchanged.'
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
            AIDLC runs all eligible steps and defers human gates into one review bundle.
            It opens a feature PR but never merges the default branch.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.message}
                  type="button"
                  onClick={() => action.message === 'startAutonomousDelivery'
                    ? setScreen('start')
                    : run(action.message)}
                  className={
                    action.primary
                      ? 'flex items-start gap-3 rounded-lg border border-primary/50 bg-primary/10 p-3 text-left hover:bg-primary/15'
                      : 'flex items-start gap-3 rounded-lg border border-border bg-card/60 p-3 text-left hover:border-primary/40 hover:bg-accent/50'
                  }
                >
                  <Icon className={action.primary ? 'mt-0.5 h-4 w-4 shrink-0 text-primary' : 'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground'} />
                  <span>
                    <span className="block text-xs font-semibold text-foreground">{action.label}</span>
                    <span className="mt-1 block text-[10.5px] leading-relaxed text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
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
