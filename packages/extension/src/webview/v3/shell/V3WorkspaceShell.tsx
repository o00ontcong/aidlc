import { useState } from 'react';
import type { V3ApplicationClient, V3ViewId, V3WorkspaceState } from '../contracts';
import { HomeView } from '../home/HomeView';
import { EpicsView } from '../epics/EpicsView';
import { StudioView } from '../studio/StudioView';
import { GuideDiagnosticsView } from '../guide/GuideDiagnosticsView';
import { ArchitectureView } from '../architecture/ArchitectureView';
import { V3Navigation } from './Navigation';

/** Top-level v3 composition root. W3I owns mounting it in a webview entrypoint. */
export function V3WorkspaceShell({ state, client, initialView = 'home' }: {
  state: V3WorkspaceState;
  client: V3ApplicationClient;
  initialView?: V3ViewId;
}) {
  const [view, setView] = useState<V3ViewId>(initialView);
  const [selectedEpicId, setSelectedEpicId] = useState<string | undefined>(state.currentEpicId ?? state.epics[0]?.id);
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <V3Navigation view={view} onChange={setView} />
      <main className="flex-1 overflow-y-auto p-5">
        {view === 'home' && <HomeView state={state} client={client} onOpenEpics={() => setView('epics')} onOpenStudio={() => setView('studio')} />}
        {view === 'architecture' && <ArchitectureView state={state} client={client} />}
        {view === 'epics' && <EpicsView state={state} client={client} selectedEpicId={selectedEpicId} onSelectEpic={setSelectedEpicId} />}
        {view === 'studio' && <StudioView state={state} client={client} />}
        {view === 'guide' && <GuideDiagnosticsView state={state} client={client} />}
      </main>
    </div>
  );
}
