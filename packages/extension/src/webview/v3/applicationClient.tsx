import React from 'react';
import type {
  ExtensionV3CommandResult,
  RegistryAgentInput,
  RegistryPipelineInput,
  RegistryScope,
  RegistrySkillInput,
  RegistryTemplate,
} from '../../v3/ExtensionV3ApplicationClient';

export interface RegistryAgent extends RegistryAgentInput { scope: RegistryScope | null }
export interface RegistrySkill extends RegistrySkillInput { scope: RegistryScope | null }
export interface RegistryPipeline extends RegistryPipelineInput { source: 'bundled' | 'project' | 'user' }
export type RegistryPipelineStep = RegistryPipelineInput['steps'][number];
export interface RegistryState { agents: RegistryAgent[]; skills: RegistrySkill[]; pipelines: RegistryPipeline[]; templates: RegistryTemplate[] }

interface ApplicationClient {
  registry: RegistryState;
  command(name: string, payload: unknown): Promise<ExtensionV3CommandResult>;
}

const emptyRegistry: RegistryState = { agents: [], skills: [], pipelines: [], templates: [] };
const ApplicationContext = React.createContext<ApplicationClient | null>(null);

export function V3ApplicationClientProvider({ children }: { children: React.ReactNode }) {
  const [registry, setRegistry] = React.useState<RegistryState>(emptyRegistry);
  const pending = React.useRef(new Map<string, (result: ExtensionV3CommandResult) => void>());
  const sequence = React.useRef(0);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; state?: { registry?: RegistryState }; result?: ExtensionV3CommandResult } | undefined;
      if (message?.type === 'aidlc.v3.state' && message.state?.registry) setRegistry(message.state.registry);
      if (message?.type === 'aidlc.v3.result' && message.result) {
        const resolve = pending.current.get(message.result.commandId);
        if (resolve) { pending.current.delete(message.result.commandId); resolve(message.result); }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const command = React.useCallback((name: string, payload: unknown) => new Promise<ExtensionV3CommandResult>((resolve) => {
    const id = `v3-${Date.now()}-${++sequence.current}`;
    pending.current.set(id, resolve);
    const vscode = window.acquireVsCodeApi?.();
    if (!vscode) {
      pending.current.delete(id);
      resolve({ commandId: id, status: 'error', data: { message: 'VS Code bridge is unavailable.' } });
      return;
    }
    vscode.postMessage({ type: 'aidlc.v3.command', command: { id, name, payload } });
  }), []);
  const value = React.useMemo(() => ({ registry, command }), [registry, command]);
  return <ApplicationContext.Provider value={value}>{children}</ApplicationContext.Provider>;
}

export function useApplicationClient(): ApplicationClient {
  const value = React.useContext(ApplicationContext);
  if (!value) throw new Error('useApplicationClient must be used inside V3ApplicationClientProvider');
  return value;
}
