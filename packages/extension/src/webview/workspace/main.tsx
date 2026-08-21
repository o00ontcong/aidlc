import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { useHostState } from '../hooks/useHostState';
import { useThemeBridge } from '../hooks/useThemeBridge';
import type { WorkspaceState } from '../lib/types';
import '../styles.css';

class WorkspaceErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AIDLC Workspace] render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, font: '13px/1.5 sans-serif', color: 'var(--vscode-errorForeground, #f14c4c)' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>AIDLC Workspace could not render.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  useThemeBridge();
  const state = useHostState<WorkspaceState>();
  return <WorkspaceShell state={state} />;
}

const root = document.getElementById('app');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WorkspaceErrorBoundary>
        <App />
      </WorkspaceErrorBoundary>
    </StrictMode>,
  );
}
