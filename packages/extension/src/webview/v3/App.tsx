// v3/App.tsx — fills the real VS Code editor tab (no fixed 1440×920 mockup
// frame, no fake Sidebar/ActivityBar column, no fake TitleBar/EditorTabs
// strip — all of that duplicated real VS Code/OS chrome that's already
// visible around this panel: the real window title bar, the real editor tab
// strip, and the real Activity Bar sidebar, which already renders
// QuotaTracker etc. with live data (see AppSidebar.tsx). Theme =
// `thm-dark`/`thm-light` class on THIS container (not on <html>) per the
// design's own theme model.
import React from 'react';
import { useUiStore } from './state/store';
import { ViewTabs, StatusBar } from './shell';
import HomeScreen from './screens/HomeScreen';
import { EpicsScreen } from './screens/epics';
import { BuilderScreen } from './screens/builder';
import AnalyzeScreen from './screens/AnalyzeScreen';
import TestsScreen from './screens/TestsScreen';
import GuideScreen from './screens/GuideScreen';
import StudioScreen from './screens/StudioScreen';
import { GateModal, NewEpicModal, AddModal } from './modals';
import { Toast } from './components';
import { TOAST_PRESET } from './data/mock-data';

export default function App() {
  const { state, update } = useUiStore();

  return (
    <div
      className={`w-full h-full overflow-hidden flex flex-col relative font-v3-sans thm-${state.theme}`}
      style={{ background: 'var(--bg)' }}
    >
      <ViewTabs />
      <div className="flex-1 min-h-0 overflow-hidden">
        {state.tab === 'Home' && <HomeScreen />}
        {state.tab === 'Epics' && <EpicsScreen />}
        {state.tab === 'Builder' && <BuilderScreen />}
        {state.tab === 'Analyze' && <AnalyzeScreen />}
        {state.tab === 'Tests' && <TestsScreen />}
        {state.tab === 'Guide' && <GuideScreen />}
        {state.tab === 'Studio' && <StudioScreen />}
      </div>
      <StatusBar />

      {state.gateOpen && <GateModal />}
      {state.newEpicOpen && <NewEpicModal />}
      {state.addOpen && <AddModal />}
      {state.toastOpen && (
        <Toast
          title={TOAST_PRESET.title}
          body={TOAST_PRESET.body}
          onReload={() => update({ toastOpen: false })}
          onLater={() => update({ toastOpen: false })}
          onClose={() => update({ toastOpen: false })}
        />
      )}
    </div>
  );
}
