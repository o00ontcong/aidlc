import type { V3ApplicationClient } from '../contracts';
import { createV3CommandFactory } from '../contracts';
import { NeedsLogic } from '../shell/NeedsLogic';
import { useI18n } from '../../lib/i18n';

const PLATFORMS = ['Jira', 'Linear', 'GitHub', 'Azure DevOps'];

export function AnalyzeView({ client }: { client: V3ApplicationClient }) {
  const t = useI18n();
  const command = createV3CommandFactory('analyze');
  return <div className="space-y-4">
    <header><h1 className="text-xl font-semibold text-foreground">{t.analyze.title}</h1><p className="mt-1 text-xs text-muted-foreground">{t.analyze.subtitle}</p></header>

    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t.analyze.projectIntelligence}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t.analyze.readOnlyNote}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => client.dispatch(command('project.analyze', {}))} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">{t.analyze.analyzeProject}</button>
        <button type="button" onClick={() => client.dispatch(command('project.recommend', {}))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground">{t.analyze.generateRecommendation}</button>
        <button type="button" onClick={() => client.dispatch(command('project.context.refresh', {}))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground">{t.analyze.publishContext}</button>
      </div>
    </section>

    <div className="flex flex-col gap-4 lg:flex-row">
      <NeedsLogic block note="Chưa có command requirement.analyze / tích hợp Jira">
        <section className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-dashed border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">{t.analyze.requirementTitle}</h2>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t.analyze.requirementSourceLabel}
            <textarea disabled placeholder={t.analyze.requirementPlaceholder} className="min-h-16 rounded border border-border bg-background px-2.5 py-2 text-xs text-muted-foreground" />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t.analyze.targetPlatform}</span>
            <div className="flex flex-wrap gap-1.5">{[...PLATFORMS, t.analyze.platformPlainText].map((platform) => <span key={platform} className="rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground">{platform}</span>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">{t.analyze.parentTask}<input disabled placeholder="PAY-884" className="rounded border border-border bg-background px-2.5 py-2 font-mono text-xs text-muted-foreground" /></label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">{t.analyze.projectKey}<input disabled placeholder="PAY" className="rounded border border-border bg-background px-2.5 py-2 font-mono text-xs text-muted-foreground" /></label>
          </div>
          <button type="button" disabled className="rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground opacity-60">{t.analyze.proceed}</button>
        </section>
      </NeedsLogic>

      <NeedsLogic block note="Chưa có lịch sử requirement analysis">
        <section className="w-full flex-1 overflow-hidden rounded-lg border border-dashed border-border bg-card">
          <div className="border-b border-border px-3.5 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t.analyze.recentAnalyses}</div>
          <p className="p-3.5 text-[11.5px] text-muted-foreground">{t.analyze.noHistory}</p>
        </section>
      </NeedsLogic>
    </div>
  </div>;
}
