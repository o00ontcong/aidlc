// v3/App.tsx — shell 1440×920 (§3) + modal layer. Theme = `thm-dark`/`thm-light`
// class on THIS container (not on <html>) per the design's own theme model.
import React from 'react';
import { useUiStore } from './state/store';
import { TitleBar, ActivityBar, EditorTabs, ViewTabs, StatusBar } from './shell';
import { Sidebar } from './shell/Sidebar';
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
      className={`w-[1440px] h-[920px] rounded-[10px] overflow-hidden flex flex-col relative shadow-v3-frame font-v3-sans thm-${state.theme}`}
      style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--bg)' }}
    >
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <ActivityBar />
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col bg-bg">
          <EditorTabs />
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
        </div>
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
