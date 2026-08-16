/* Mock SidebarState for the sidebar harness (not a build input). */
import type { SidebarState } from '../src/webview/lib/types';
import { MOCK_PROVIDER_CONFIG } from '../src/webview/lib/providers';

export const SIDEBAR_STATE: SidebarState = {
  hasFolder: true,
  workspaceName: 'payments-service',
  configExists: true,
  agentsCount: 4,
  skillsCount: 12,
  pipelinesCount: 3,
  epicsCount: 7,
  recentEpics: [
    { id: 'EPIC-142', title: 'Partial refunds', status: 'in_progress', statePath: 'docs/epics/EPIC-142/state.json' },
    { id: 'EPIC-139', title: 'Webhook retry backoff', status: 'in_progress', statePath: 'docs/epics/EPIC-139/state.json' },
    { id: 'EPIC-136', title: 'Idempotency keys', status: 'failed', statePath: 'docs/epics/EPIC-136/state.json' },
  ],
  slashCommands: [],
  builtinTemplates: [
    { id: 'feature-implement', name: 'Feature Implement', description: 'Implement from MISSION.md' },
  ],
  projectTemplates: [],
  activeRuns: [],
  pipelines: [],
  runIds: [],
  demoProjectExists: true,
  mcpServers: null,
  mcpLoading: false,
  mcpError: null,
  autopilotEnabled: false,
  providerConfig: MOCK_PROVIDER_CONFIG,
};
