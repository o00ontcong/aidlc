// v3/state/store.ts — UiState store. Dùng React Context + useState (không có
// zustand trong dependency của repo) thay cho handoff's `state/store.ts`
// (zustand) — hành vi tương đương: 1 nguồn state, cập nhật bất đồng bộ qua
// `update()`, đọc qua `useUiStore().state`.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { UiState } from '../data/types';
import { MOCK_FOLLOW_DEFAULT, MOCK_CAPABILITIES } from '../data/mock-data';

export function initialUiState(): UiState {
  return {
    theme: 'dark',
    tab: 'Epics',
    mode: 'auto',
    query: '',
    filter: 'All',
    selectedEpicId: 'EPIC-142',
    follow: { ...MOCK_FOLLOW_DEFAULT },
    listCollapsed: false,
    toolsOpen: false,
    followSectionOpen: true,
    restSectionOpen: true,
    quotaOpen: true,
    autonomyOpen: false,
    runMode: 'Guided',
    builderTab: 'Workflows',
    presetOpen: true,
    presetApplied: false,
    platform: 'Jira',
    pack: 'sdlc-core',
    capsEnabled: Object.fromEntries(MOCK_CAPABILITIES.map((c) => [c.name, c.enabled])),
    logsOpen: false,
    gateOpen: false,
    gateReason: '',
    newEpicOpen: false,
    newTitle: '',
    newType: 'Feature',
    newProfile: 'cohesive-feature',
    newPack: 'sdlc-core',
    newMode: 'guide',
    addOpen: false,
    addSrc: '',
    addScope: 'project (.aidlc)',
    addId: '',
    addTier: 'balanced',
    addSkills: {},
    addCaps: { figma: false, files: false, github: false, web: false },
    toastOpen: false,
  };
}

export type UiStateUpdate = Partial<UiState> | ((prev: UiState) => Partial<UiState>);

interface StoreValue {
  state: UiState;
  update: (u: UiStateUpdate) => void;
  toggleFollow: (id: string) => void;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function UiStoreProvider({ children, theme }: { children: React.ReactNode; theme?: UiState['theme'] }) {
  const [state, setState] = useState<UiState>(() => {
    const s = initialUiState();
    return theme ? { ...s, theme } : s;
  });
  const update = useCallback((u: UiStateUpdate) => {
    setState((prev) => ({ ...prev, ...(typeof u === 'function' ? u(prev) : u) }));
  }, []);
  // Theo dõi thay đổi runtime của theme VS Code (không chỉ seed lúc mount) —
  // `theme` prop tới từ MutationObserver ở main.tsx.
  React.useEffect(() => {
    if (theme) setState((prev) => (prev.theme === theme ? prev : { ...prev, theme }));
  }, [theme]);
  const toggleFollow = useCallback((id: string) => {
    setState((prev) => ({ ...prev, follow: { ...prev.follow, [id]: !prev.follow[id] } }));
  }, []);
  const value = useMemo(() => ({ state, update, toggleFollow }), [state, update, toggleFollow]);
  return React.createElement(StoreCtx.Provider, { value }, children);
}

export function useUiStore(): StoreValue {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useUiStore must be used within UiStoreProvider');
  return ctx;
}
