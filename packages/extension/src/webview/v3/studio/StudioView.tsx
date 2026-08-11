import { useEffect, useState } from 'react';
import type { V3ApplicationClient, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory } from '../contracts';
import { NeedsLogic } from '../shell/NeedsLogic';
import { useI18n } from '../../lib/i18n';

export function StudioView({ state, client }: { state: V3WorkspaceState; client: V3ApplicationClient }) {
  const t = useI18n();
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
  return <div className="space-y-4">
    <header><h1 className="text-xl font-semibold text-foreground">{t.studio.title}</h1><p className="mt-1 text-xs text-muted-foreground">{t.studio.subtitle}</p></header>
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t.studio.workflowPacks}</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{t.studio.workflowPacksNote}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{state.workflowPacks.map((pack) => <button type="button" key={pack.id} disabled={!epicId} onClick={() => epicId && client.dispatch(command('workflow.compile', { epicId, packId: pack.id }))} className="rounded-lg border border-border p-3 text-left hover:border-primary hover:bg-accent disabled:opacity-50"><span className="text-xs font-medium text-foreground">{pack.label}</span><span className="mt-1 block text-[11px] text-muted-foreground">{pack.description}</span><span className="mt-2 block text-[10px] capitalize text-muted-foreground">{pack.profiles.join(' · ')}</span></button>)}</div>
      {state.compiledWorkflow && <p className="mt-3 rounded border border-border bg-background px-2.5 py-2 font-mono text-[11.5px] text-muted-foreground">{state.compiledWorkflow.summary}: {state.compiledWorkflow.stages.join(' → ')}</p>}
    </section>
    <section className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">{t.studio.recommendedTeam}</h2>{recommendation ? <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><div><dt className="text-muted-foreground">{t.studio.role}</dt><dd className="text-foreground">{recommendation.agentRole}</dd></div><div><dt className="text-muted-foreground">{t.studio.skills}</dt><dd className="text-foreground">{recommendation.skills.join(', ') || '—'}</dd></div><div><dt className="text-muted-foreground">{t.studio.modelTier}</dt><dd className="text-foreground">{recommendation.modelTier}</dd></div></dl> : <p className="mt-2 text-xs text-muted-foreground">{t.studio.analyzeToReceive}</p>}</section>
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{t.studio.modelProviders}</h2>
      {state.providerDiagnostics.map((provider) => (
        <div key={provider.providerId} className="flex flex-wrap items-center gap-2.5 border-b border-border/60 px-4 py-2.5 text-xs last:border-b-0">
          <span className="flex-1 text-foreground">{provider.providerId}{provider.modelId ? ` · ${provider.modelId}` : ''}{provider.selected ? ` · ${t.studio.defaultSuffix}` : ''}</span>
          <span className={provider.status === 'ready' ? 'text-primary' : 'text-amber-600 dark:text-amber-300'}>{provider.message}</span>
          {!provider.selected && <button type="button" onClick={() => client.dispatch(command('model.provider.default.set', { providerId: provider.providerId }))} className="rounded border border-border px-2 py-1 text-[10.5px] hover:bg-accent">{t.studio.useAsDefault}</button>}
        </div>
      ))}
      <button type="button" onClick={() => client.dispatch(command('model.diagnose', {}))} className="m-3 rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{t.studio.checkProviders}</button>
    </section>
    <section className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">{t.studio.artifactPolicy}</h2><p className="mt-1 text-xs text-muted-foreground">{t.studio.artifactPolicyNote}</p><textarea aria-label="Artifact policy JSON" value={policyText} onChange={(event) => setPolicyText(event.target.value)} className="mt-3 min-h-48 w-full rounded border border-border bg-background p-2 font-mono text-[11px] text-foreground" />{policyError && <p className="mt-2 text-xs text-destructive">{policyError}</p>}<button type="button" onClick={savePolicy} className="mt-2 rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{t.studio.validateAndSave}</button></section>
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{t.studio.capabilities}</h2>
      {state.capabilities.map((capability) => (
        <div key={capability.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0">
          <NeedsLogic note="Click vào hàng capability chưa rõ hành vi trong mockup, chưa có command riêng">
            <button type="button" className="min-w-0 flex-1 text-left"><span className="text-xs text-foreground">{capability.label}</span><span className="ml-2 text-[11px] text-muted-foreground">{capability.category} · {capability.healthy ? t.studio.healthy : capability.message ?? t.studio.needsAttention}</span></button>
          </NeedsLogic>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={capability.enabled} onChange={(event) => client.dispatch(command('capability.enabled.set', { capabilityId: capability.id, enabled: event.target.checked }))} />{t.studio.enabledLabel}</label>
        </div>
      ))}
    </section>
  </div>;
}
