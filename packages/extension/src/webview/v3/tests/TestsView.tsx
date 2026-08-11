import type { V3ApplicationClient, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory } from '../contracts';
import { NeedsLogic } from '../shell/NeedsLogic';
import { useI18n } from '../../lib/i18n';

export function TestsView({ state, client }: { state: V3WorkspaceState; client: V3ApplicationClient }) {
  const t = useI18n();
  const PIPELINE_STEPS = [t.tests.stepConfirm, t.tests.stepGenerate, t.tests.stepRun, t.tests.stepHeal, t.tests.stepRerun, t.tests.stepVerdict, t.tests.stepReport];
  const command = createV3CommandFactory('tests');
  const testAgent = state.capabilities.find((item) => item.id === 'test-agent');
  return <div className="space-y-4">
    <header><h1 className="text-xl font-semibold text-foreground">{t.tests.title}</h1><p className="mt-1 text-xs text-muted-foreground">{t.tests.subtitle}</p></header>

    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t.tests.testAgent}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{testAgent ? `${testAgent.enabled ? t.tests.enabled : t.tests.disabled} · ${testAgent.healthy ? t.tests.healthy : testAgent.message ?? t.tests.needsSetup}` : t.tests.noCapabilityRegistered}</p>
      {testAgent && <button type="button" onClick={() => client.dispatch(command('capability.enabled.set', { capabilityId: testAgent.id, enabled: !testAgent.enabled }))} className="mt-3 rounded border border-border px-3 py-1.5 text-xs text-foreground">{testAgent.enabled ? t.tests.disableTestAgent : t.tests.enableTestAgent} {t.tests.testAgentSuffix}</button>}
    </section>
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t.tests.providerDiagnostics}</h2>
      <button type="button" onClick={() => client.dispatch(command('model.diagnose', {}))} className="mt-3 rounded border border-border px-3 py-1.5 text-xs text-foreground">{t.tests.checkProviders}</button>
    </section>

    <NeedsLogic block note="Chưa có kiểu dữ liệu test-run/verdict cho E2E pipeline">
      <section className="w-full space-y-4 rounded-lg border border-dashed border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">{t.tests.e2eTitle}</h2>
        <div className="flex items-start">
          {PIPELINE_STEPS.map((step, index) => (
            <div key={step} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <span className={`h-0.5 flex-1 ${index === 0 ? 'bg-transparent' : 'bg-border'}`} />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background text-[10px] text-muted-foreground">{index + 1}</span>
                <span className={`h-0.5 flex-1 ${index === PIPELINE_STEPS.length - 1 ? 'bg-transparent' : 'bg-border'}`} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="rounded-md border border-primary/30 bg-background p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t.tests.verdictLabel}</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">{t.tests.noRunRecorded}</p>
          </div>
          <div className="rounded-md border border-amber-500/30 bg-background p-3.5">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><span>🔒</span>{t.tests.gatesInPipeline}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{t.tests.gatesNote}</p>
          </div>
        </div>
      </section>
    </NeedsLogic>
  </div>;
}
