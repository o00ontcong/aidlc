import { useEffect, useState } from 'react';
import type { V3ApplicationClient, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory } from '../contracts';

export function StudioView({ state, client }: { state: V3WorkspaceState; client: V3ApplicationClient }) {
  const command = createV3CommandFactory('studio');
  const recommendation = state.project.recommendation;
  const epicId = state.currentEpicId ?? state.epics[0]?.id;
  const [policyText, setPolicyText] = useState(() => JSON.stringify(state.artifactPolicy, null, 2));
  const [policyError, setPolicyError] = useState<string>();
  useEffect(() => setPolicyText(JSON.stringify(state.artifactPolicy, null, 2)), [state.artifactPolicy]);
  const savePolicy = () => {
    try {
      const policy = JSON.parse(policyText) as Record<string, unknown>;
      setPolicyError(undefined);
      client.dispatch(command('artifact.policy.update', { policy }));
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : String(error));
    }
  };
  return <div className="space-y-5">
    <header><h1 className="text-xl font-semibold text-foreground">Studio</h1><p className="mt-1 text-xs text-muted-foreground">Review the compiled workflow before it runs. Changes are sent to the application command bus for validation.</p></header>
    <section className="rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Workflow packs</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-2">{state.workflowPacks.map((pack) => <button type="button" key={pack.id} disabled={!epicId} onClick={() => epicId && client.dispatch(command('workflow.compile', { epicId, packId: pack.id }))} className="rounded border border-border p-3 text-left hover:border-primary hover:bg-accent disabled:opacity-50"><span className="text-xs font-medium text-foreground">{pack.label}</span><span className="mt-1 block text-[11px] text-muted-foreground">{pack.description}</span><span className="mt-2 block text-[10px] capitalize text-muted-foreground">{pack.profiles.join(' · ')}</span></button>)}</div>
      {state.compiledWorkflow && <p className="mt-3 text-xs text-muted-foreground">{state.compiledWorkflow.summary}: {state.compiledWorkflow.stages.join(' → ')}</p>}
    </section>
    <section className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Recommended team</h2>{recommendation ? <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><div><dt className="text-muted-foreground">Role</dt><dd className="text-foreground">{recommendation.agentRole}</dd></div><div><dt className="text-muted-foreground">Skills</dt><dd className="text-foreground">{recommendation.skills.join(', ') || '—'}</dd></div><div><dt className="text-muted-foreground">Model tier</dt><dd className="text-foreground">{recommendation.modelTier}</dd></div></dl> : <p className="mt-2 text-xs text-muted-foreground">Analyze the project to receive recommendations.</p>}</section>
    <section className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Model providers</h2><ul className="mt-3 space-y-2">{state.providerDiagnostics.map((provider) => <li key={provider.providerId} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-foreground">{provider.providerId}{provider.modelId ? ` · ${provider.modelId}` : ''}{provider.selected ? ' · default' : ''}</span><span className={provider.status === 'ready' ? 'text-emerald-600' : 'text-amber-600'}>{provider.message}</span>{!provider.selected && <button type="button" onClick={() => client.dispatch(command('model.provider.default.set', { providerId: provider.providerId }))} className="rounded border border-border px-2 py-1 text-[10px] hover:bg-accent">Use as default</button>}</li>)}</ul><button type="button" onClick={() => client.dispatch(command('model.diagnose', {}))} className="mt-3 rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Check providers</button></section>
    <section className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Artifact policy</h2><p className="mt-1 text-xs text-muted-foreground">Only policy-approved artifacts are eligible for commit. The complete policy is validated by core before it is written.</p><textarea aria-label="Artifact policy JSON" value={policyText} onChange={(event) => setPolicyText(event.target.value)} className="mt-3 min-h-48 w-full rounded border border-border bg-background p-2 font-mono text-[11px] text-foreground" />{policyError && <p className="mt-2 text-xs text-destructive">{policyError}</p>}<button type="button" onClick={savePolicy} className="mt-2 rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Validate and save policy</button></section>
    <section className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Capabilities</h2><ul className="mt-3 space-y-2">{state.capabilities.map((capability) => <li key={capability.id} className="flex items-center justify-between gap-3 text-xs"><span><span className="text-foreground">{capability.label}</span><span className="ml-2 text-muted-foreground">{capability.category} · {capability.healthy ? 'healthy' : capability.message ?? 'needs attention'}</span></span><label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={capability.enabled} onChange={(event) => client.dispatch(command('capability.enabled.set', { capabilityId: capability.id, enabled: event.target.checked }))} />Enabled</label></li>)}</ul></section>
  </div>;
}
