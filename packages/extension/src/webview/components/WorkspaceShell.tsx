import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceState, WorkspaceView } from '@/lib/types';
import { BuilderView } from './BuilderView';
import { EpicsView } from './EpicsView';
import { ThemeToggle } from './ThemeToggle';
import { StartEpicModal } from './StartEpicModal';
import { AnalyzeView } from './AnalyzeView';
import { TestAgentView } from './TestAgentView';
import { ArchitectureExplorer } from './ArchitectureExplorer';
import { ProjectOverview } from './ProjectOverview';
import { onHostMessage, postMessage } from '@/lib/bridge';

export function WorkspaceShell({ state }: { state: WorkspaceState | null }) {
  const initial = state?.initialView ?? 'project';
  const [view, setView] = useState<WorkspaceView>(initial);
  const [startEpicOpen, setStartEpicOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const seededView = useRef(Boolean(state?.initialView));

  // Host can switch the view at runtime via openBuilder/openEpicsList.
  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'setView') {
        const next = msg.view;
        if (next === 'project' || next === 'builder' || next === 'architecture' || next === 'epics' || next === 'analyze' || next === 'tests') {
          setView(next);
          seededView.current = true;
        }
      }
      if (msg.type === 'openStartEpicModal') {
        setView('epics');
        seededView.current = true;
        setStartEpicOpen(true);
      }
    });
  }, []);

  // Adopt initialView only once (first state push). Later refreshes must not
  // clobber the tab the user is on — host uses setView messages for that.
  useEffect(() => {
    if (!state?.initialView || seededView.current) { return; }
    setView(state.initialView);
    seededView.current = true;
  }, [state?.initialView]);

  const onView = (next: WorkspaceView) => {
    setView(next);
    seededView.current = true;
    postMessage({ type: 'setView', view: next });
  };

  if (!state) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!state.hasFolder) {
    return (
      <div className="flex h-full flex-col">
        <TopBar view={view} onView={onView} workspaceName={state.workspaceName} />
        <div className="p-6">
          {view === 'epics' ? (
            <NoProjectEpicsView />
          ) : (
            <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center">
              <h2 className="text-sm font-bold text-foreground">
                {state.hasFolder ? 'No workspace.yaml' : 'No project open'}
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                {state.hasFolder
                  ? 'Start an epic — the workspace is created automatically when you pick a pipeline or let Auto detect one.'
                  : 'Open a folder in VS Code to get started.'}
              </p>
              <div className="mt-4 inline-flex flex-wrap justify-center gap-2">
                {!state.hasFolder && (
                  <button
                    type="button"
                    onClick={() => postMessage({ type: 'openProject' })}
                    className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open Project
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {startEpicOpen && (
          <StartEpicModal
            pipelines={state.pipelines}
            recipes={state.recipes ?? []}
            agentMeta={state.agentMeta}
            nextEpicId={state.nextEpicId}
            existingEpicIds={state.existingEpicIds}
            epicsDir={state.epicsDir}
            isFirstEpic={state.epics.length === 0}
            workspaceName={state.workspaceName}
            hasFolder={state.hasFolder}
            charter={state.charter}
            onSubmit={(draft) => postMessage({ type: 'startEpicInline', draft })}
            onClose={() => setStartEpicOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar view={view} onView={onView} workspaceName={state.workspaceName} />
      {view === 'project' ? (
        <main className="flex-1 overflow-y-auto p-6">
          <ProjectOverview
            state={state}
            onNewTask={() => setStartEpicOpen(true)}
            onOpenTask={(taskId) => {
              setSelectedTaskId(taskId);
              onView('epics');
            }}
          />
        </main>
      ) : !state.configExists ? (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center">
            <h2 className="text-sm font-bold text-foreground">No workspace.yaml</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Create a task to select a pipeline, or open Builder to configure the workspace manually.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => setStartEpicOpen(true)} className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                New task
              </button>
              <button type="button" onClick={() => onView('builder')} className="rounded-md border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                Open Builder
              </button>
            </div>
          </div>
        </main>
      ) : view === 'epics' ? (
        // The v3 Epics screen is a two-column master/detail that scrolls each
        // column independently and must fill the panel height, so it is not
        // wrapped in the padded scroll box. The other views keep their exact
        // previous wrapper markup below — nothing about them changes.
        <main className="min-h-0 flex-1 overflow-hidden">
          <EpicsView state={state} initialSelectedId={selectedTaskId} />
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {view === 'builder' ? (
              <BuilderView state={state} />
            ) : view === 'architecture' ? (
              <ArchitectureExplorer architecture={state.architecture} epics={state.epics} language={state.displayLanguage} />
            ) : view === 'analyze' ? (
              <AnalyzeView state={state} />
            ) : (
              <TestAgentView state={state} />
            )}
          </div>
        </main>
      )}
      {startEpicOpen && (
        <StartEpicModal
          pipelines={state.pipelines}
          recipes={state.recipes ?? []}
          agentMeta={state.agentMeta}
          nextEpicId={state.nextEpicId}
          existingEpicIds={state.existingEpicIds}
          epicsDir={state.epicsDir}
          isFirstEpic={state.epics.length === 0}
          workspaceName={state.workspaceName}
          hasFolder={state.hasFolder}
          charter={state.charter}
          onSubmit={(draft) => {
            setStartEpicOpen(false);
            postMessage({ type: 'startEpicInline', draft });
          }}
          onClose={() => setStartEpicOpen(false)}
        />
      )}
    </div>
  );
}

function TopBar({
  view,
  onView,
  workspaceName,
}: {
  view: WorkspaceView;
  onView: (v: WorkspaceView) => void;
  workspaceName: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-6 py-2.5 backdrop-blur-sm">
      <PillButton active={view === 'project'} onClick={() => onView('project')}>
        Project
      </PillButton>
      <PillButton active={view === 'epics'} onClick={() => onView('epics')}>
        Tasks
      </PillButton>
      <PillButton active={view === 'builder'} onClick={() => onView('builder')}>
        Builder
      </PillButton>
      <PillButton active={view === 'architecture'} onClick={() => onView('architecture')}>
        Architecture
      </PillButton>
      <PillButton active={view === 'analyze'} onClick={() => onView('analyze')}>
        Analyze
      </PillButton>
      <PillButton active={view === 'tests'} onClick={() => onView('tests')}>
        Tests
      </PillButton>
      <div className="ml-auto flex items-center gap-2">
        {workspaceName && (
          <span className="rounded-md bg-secondary px-2.5 py-1 font-mono text-[10px] font-medium text-muted-foreground">
            PROJECT {workspaceName}
          </span>
        )}
        <ThemeToggle />
      </div>
    </div>
  );
}

function NoProjectEpicsView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">AIDLC Tasks</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          No project open — open a project to create tasks or load existing work.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => postMessage({ type: 'startEpicPickProject' })}
          className="flex flex-col items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/10"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Plus className="h-4 w-4 text-primary" />
            New Task
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pick a project folder and create a focused task in it.
          </p>
        </button>
        <button
          type="button"
          onClick={() => postMessage({ type: 'loadEpicsFromFolder' })}
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ExternalLink className="h-4 w-4 text-primary" />
            Load Tasks from Folder
          </div>
          <p className="text-[11px] text-muted-foreground">
            Browse to a task folder from another project to view existing work.
          </p>
        </button>
        <button
          type="button"
          onClick={() => postMessage({ type: 'openProject' })}
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FolderOpen className="h-4 w-4 text-primary" />
            Open Project
          </div>
          <p className="text-[11px] text-muted-foreground">
            Open a project folder to start building agents and workflows.
          </p>
        </button>
      </div>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
