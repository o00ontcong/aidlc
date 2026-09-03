/**
 * Durable UI preferences for the AIDLC Workspace panel.
 *
 * Stored in VS Code `workspaceState` so they survive webview dispose/recreate
 * (unlike `acquireVsCodeApi().setState()`, which is per-panel instance).
 */

import * as vscode from 'vscode';

export type WorkspaceUiView =
  | 'project' | 'discover' | 'builder' | 'architecture' | 'epics' | 'sprint' | 'analyze' | 'tests';

const WORKSPACE_UI_VIEWS: readonly WorkspaceUiView[] = [
  'project', 'discover', 'builder', 'architecture', 'epics', 'sprint', 'analyze', 'tests',
];

/**
 * A stored `lastView` predates this build when it says `discovery` — the id
 * the Ideas tab used before Discover replaced it. Map it forward rather than
 * dropping the preference; anything else unknown falls back to undefined.
 */
function normalizeView(view: unknown): WorkspaceUiView | undefined {
  if (view === 'discovery') { return 'discover'; }
  return WORKSPACE_UI_VIEWS.includes(view as WorkspaceUiView) ? (view as WorkspaceUiView) : undefined;
}

export interface EpicsViewPrefs {
  filter?: 'all' | 'in_progress' | 'pending' | 'done' | 'failed';
  search?: string;
  followOpen?: boolean;
  noFollowOpen?: boolean;
  followedIds?: string[];
  /** Open epic-list column width in px (rail collapse stays fixed at 46px). */
  listWidth?: number;
}

export interface DiscoverViewPrefs {
  /** Pipeline 12-step rail width in px. */
  railWidth?: number;
  /** Right-hand agent panel. Absent / false = hidden (the default). */
  agentPanelOpen?: boolean;
}

export interface WorkspaceUiPrefs {
  lastView?: WorkspaceUiView;
  epicsView?: EpicsViewPrefs;
  discoverView?: DiscoverViewPrefs;
}

const KEY = 'aidlc.workspace.uiPrefs';

class WorkspaceUiPrefsStore {
  private context: vscode.ExtensionContext | null = null;

  init(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  get(): WorkspaceUiPrefs {
    const stored = this.context?.workspaceState.get<WorkspaceUiPrefs>(KEY) ?? {};
    return { ...stored, lastView: normalizeView(stored.lastView) };
  }

  async setLastView(view: WorkspaceUiView): Promise<void> {
    if (!this.context) { return; }
    const prev = this.get();
    if (prev.lastView === view) { return; }
    await this.context.workspaceState.update(KEY, { ...prev, lastView: view });
  }

  async patchEpicsView(patch: EpicsViewPrefs): Promise<void> {
    if (!this.context) { return; }
    const prev = this.get();
    await this.context.workspaceState.update(KEY, {
      ...prev,
      epicsView: { ...(prev.epicsView ?? {}), ...patch },
    });
  }

  async patchDiscoverView(patch: DiscoverViewPrefs): Promise<void> {
    if (!this.context) { return; }
    const prev = this.get();
    await this.context.workspaceState.update(KEY, {
      ...prev,
      discoverView: { ...(prev.discoverView ?? {}), ...patch },
    });
  }
}

export const workspaceUiPrefs = new WorkspaceUiPrefsStore();
