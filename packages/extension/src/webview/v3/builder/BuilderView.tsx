import { useState } from 'react';
import type { V3ApplicationClient, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory } from '../contracts';
import { NeedsLogic } from '../shell/NeedsLogic';
import { AddRegistryItemModal } from './AddRegistryItemModal';
import { useI18n } from '../../lib/i18n';

const SUB_TABS = ['workflows', 'agents', 'skills'] as const;
type SubTab = (typeof SUB_TABS)[number];

/** Registry-first Builder: all writes stay in the extension host. */
export function BuilderView({ state, client }: { state: V3WorkspaceState; client: V3ApplicationClient }) {
  const t = useI18n();
  const command = createV3CommandFactory('builder');
  const [tab, setTab] = useState<SubTab>('workflows');
  const [presetOpen, setPresetOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const TAB_LABEL: Record<SubTab, string> = { workflows: t.builder.tabWorkflows, agents: t.builder.tabAgents, skills: t.builder.tabSkills };
  const PRESET_SKILLS = [
    { id: 'figma-to-ui', desc: t.builder.presetSkillDesc.figmaToUi },
    { id: 'image-to-ui', desc: t.builder.presetSkillDesc.imageToUi },
    { id: 'design-system', desc: t.builder.presetSkillDesc.designSystem },
    { id: 'responsive-layout', desc: t.builder.presetSkillDesc.responsiveLayout },
    { id: 'visual-review', desc: t.builder.presetSkillDesc.visualReview },
  ];
  const PRESET_STEPS: { id: string; tag?: string }[] = [
    { id: 'design-analyzer', tag: t.stepFlow.autoReview },
    { id: 'design-recreator', tag: undefined },
    { id: 'visual-reviewer', tag: t.stepFlow.autoReview },
    { id: 'human-review', tag: t.common.humanGate },
  ];

  return <div className="space-y-4">
    <header><h1 className="text-xl font-semibold text-foreground">{t.builder.title}</h1><p className="mt-1 text-xs text-muted-foreground">{t.builder.subtitle}</p></header>

    <section className="overflow-hidden rounded-lg border border-primary/30 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="shrink-0 text-xs font-semibold text-foreground">{t.builder.presetTitle}</h2>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{t.builder.presetDesc}</span>
        <button type="button" onClick={() => client.dispatch(command('preset.redrawDesign.apply', {}))} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{t.builder.applyPreset}</button>
        <button type="button" onClick={() => setPresetOpen((v) => !v)} className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground">{presetOpen ? t.builder.hide : t.builder.show}</button>
      </div>
      {presetOpen && (
        <div className="grid gap-3 p-3.5 sm:grid-cols-2">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t.builder.skillsPresetInstalls}</p>
            {PRESET_SKILLS.map((skill) => <div key={skill.id} className="mt-1.5 rounded border border-border bg-background px-2.5 py-1.5"><span className="font-mono text-[11.5px] text-foreground">{skill.id}</span><span className="ml-2 text-[11px] text-muted-foreground">{skill.desc}</span></div>)}
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t.builder.redrawStepsLabel}</p>
            {PRESET_STEPS.map((step) => <div key={step.id} className="mt-1.5 rounded border border-border bg-background px-2.5 py-1.5"><span className="font-mono text-[11.5px] text-foreground">{step.id}</span>{step.tag && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{step.tag}</span>}</div>)}
          </div>
        </div>
      )}
    </section>

    <div className="flex items-center gap-1.5">
      {SUB_TABS.map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={`rounded-md px-3 py-1.5 text-xs ${tab === item ? 'border border-primary/40 bg-primary/10 text-primary' : 'border border-border text-foreground'}`}>{TAB_LABEL[item]}</button>)}
      <span className="flex-1" />
      <button type="button" onClick={() => setAddOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">+ {t.builder.addLabel} {tab.slice(0, -1)}</button>
    </div>

    {tab === 'workflows' && (
      state.registry.pipelines.length === 0 ? <p className="text-xs text-muted-foreground">{t.builder.noPipelinesYet}</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {state.registry.pipelines.map((pipeline) => (
            <section key={pipeline.id} className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center gap-2"><span className="flex-1 truncate font-mono text-xs font-semibold text-foreground">{pipeline.id}</span><span className="text-[11px] text-muted-foreground">{pipeline.steps.length} {t.builder.stepUnit}</span></div>
              <div className="flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">{pipeline.steps.map((step) => <span key={step.id} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">{step.id}</span>)}</div>
              <div className="flex flex-wrap gap-1.5">
                <NeedsLogic note="Chưa có registry.pipeline.update"><button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px] text-foreground">{t.common.edit}</button></NeedsLogic>
                <NeedsLogic note="Chưa có generate-from-recipe"><button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px] text-foreground">{t.builder.generateFromRecipe}</button></NeedsLogic>
                <NeedsLogic note="Chưa có registry.pipeline.delete"><button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px] text-destructive">{t.common.delete}</button></NeedsLogic>
              </div>
            </section>
          ))}
        </div>
      )
    )}

    {tab === 'agents' && (
      state.registry.agents.length === 0 ? <p className="text-xs text-muted-foreground">{t.builder.noAgentsYet}</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {state.registry.agents.map((agent) => (
            <section key={agent.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center gap-2"><span className="flex-1 truncate text-xs font-semibold text-foreground">{agent.name}</span><span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10.5px] text-primary">{agent.tier}</span></div>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">{agent.description}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{agent.model}</p>
              <div className="flex flex-wrap gap-1">{agent.skills.map((skill) => <span key={skill} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{skill}</span>)}</div>
              {agent.capabilities.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">{t.builder.capabilitiesLabel} {agent.capabilities.map((cap) => <span key={cap} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{cap}</span>)}</div>}
              <div className="flex flex-wrap gap-1.5">
                <NeedsLogic note="Chưa có registry.agent.update"><button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px] text-foreground">{t.common.edit}</button></NeedsLogic>
                <NeedsLogic note="Chưa có registry.agent.rename"><button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px] text-foreground">{t.common.rename}</button></NeedsLogic>
                <NeedsLogic note="Chưa có registry.agent.delete"><button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px] text-destructive">{t.common.delete}</button></NeedsLogic>
              </div>
            </section>
          ))}
        </div>
      )
    )}

    {tab === 'skills' && (
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        {state.registry.skills.length === 0 ? <p className="p-3.5 text-xs text-muted-foreground">{t.builder.noSkillsYet}</p> : state.registry.skills.map((skill) => (
          <div key={skill.id} className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2 last:border-b-0">
            <span className="w-36 shrink-0 truncate font-mono text-xs text-foreground">{skill.id}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{skill.description}</span>
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{skill.source}</span>
            <NeedsLogic note="Chưa có registry.skill.update"><button type="button" className="shrink-0 text-[11.5px] text-muted-foreground">{t.common.edit}</button></NeedsLogic>
            <NeedsLogic note="Chưa có registry.skill.delete"><button type="button" className="shrink-0 text-[11.5px] text-destructive">{t.common.delete}</button></NeedsLogic>
          </div>
        ))}
        <p className="border-t border-border p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">{t.builder.addSkillHint}</p>
      </section>
    )}

    {addOpen && <AddRegistryItemModal initialKind={tab === 'workflows' ? 'pipeline' : tab === 'agents' ? 'agent' : 'skill'} onClose={() => setAddOpen(false)} />}
  </div>;
}
