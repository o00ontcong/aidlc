import { useState } from 'react';
import type { V3ApplicationClient, V3ViewId, V3WorkspaceState } from '../contracts';
import { I18nProvider } from '../../lib/i18n';
import { HomeView } from '../home/HomeView';
import { EpicsView } from '../epics/EpicsView';
import { StudioView } from '../studio/StudioView';
import { GuideDiagnosticsView } from '../guide/GuideDiagnosticsView';
import { BuilderView } from '../builder/BuilderView';
import { AnalyzeView } from '../analyze/AnalyzeView';
import { TestsView } from '../tests/TestsView';
import { V3Navigation } from './Navigation';

/**
 * Top-level v3 composition root. W3I owns mounting it in a webview entrypoint.
 * No sidebar here by design — the real VS Code activity-bar sidebar
 * (`webview/components/AppSidebar.tsx`) already sits to the left of this
 * panel with real Project/Recent Epics/Templates/MCP servers/Open Workspace;
 * an embedded copy inside this panel would just be a redundant, unwired
 * duplicate of it.
 */
export function V3WorkspaceShell({ state, client, initialView = 'home' }: {
  state: V3WorkspaceState;
  client: V3ApplicationClient;
  initialView?: V3ViewId;
}) {
  const [view, setView] = useState<V3ViewId>(initialView);
  const [selectedEpicId, setSelectedEpicId] = useState<string | undefined>(state.currentEpicId ?? state.epics[0]?.id);
  return (
    <I18nProvider lang={state.language}>
      <div className="flex h-full flex-col bg-background text-foreground">
        <V3Navigation view={view} onChange={setView} />
        <main className="flex-1 overflow-y-auto p-5">
          {view === 'home' && <HomeView state={state} client={client} onOpenEpics={() => setView('epics')} onOpenStudio={() => setView('studio')} />}
          {view === 'epics' && <EpicsView state={state} client={client} selectedEpicId={selectedEpicId} onSelectEpic={setSelectedEpicId} />}
          {view === 'builder' && <BuilderView state={state} client={client} />}
          {view === 'analyze' && <AnalyzeView client={client} />}
          {view === 'tests' && <TestsView state={state} client={client} />}
          {view === 'guide' && <GuideDiagnosticsView state={state} client={client} />}
          {view === 'studio' && <StudioView state={state} client={client} />}
        </main>
      </div>
    </I18nProvider>
  );
}
