/**
 * Durable UI preferences for the AIDLC Workspace panel.
 *
 * Stored in VS Code `workspaceState` so they survive webview dispose/recreate
 * (unlike `acquireVsCodeApi().setState()`, which is per-panel instance).
 */

import * as vscode from 'vscode';

export type WorkspaceUiView = 'builder' | 'architecture' | 'epics' | 'analyze' | 'tests';

export interface EpicsViewPrefs {
  filter?: 'all' | 'in_progress' | 'pending' | 'done' | 'failed';
  search?: string;
  followOpen?: boolean;
  noFollowOpen?: boolean;
  followedIds?: string[];
}

export interface WorkspaceUiPrefs {
  lastView?: WorkspaceUiView;
  epicsView?: EpicsViewPrefs;
}

const KEY = 'aidlc.workspace.uiPrefs';

class WorkspaceUiPrefsStore {
  private context: vscode.ExtensionContext | null = null;

  init(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  get(): WorkspaceUiPrefs {
    return this.context?.workspaceState.get<WorkspaceUiPrefs>(KEY) ?? {};
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
}

export const workspaceUiPrefs = new WorkspaceUiPrefsStore();
