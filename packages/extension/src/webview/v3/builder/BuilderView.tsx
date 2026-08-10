import type { ReactNode } from 'react';
import type { V3ApplicationClient, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory } from '../contracts';

/** Registry-first Builder: all writes stay in the extension host. */
export function BuilderView({ state, client }: { state: V3WorkspaceState; client: V3ApplicationClient }) {
  const command = createV3CommandFactory('builder');
  return <div className="space-y-5">
    <header><h1 className="text-xl font-semibold text-foreground">Builder</h1><p className="mt-1 text-xs text-muted-foreground">Skills, agents, and versioned project pipelines available to this workspace.</p></header>
    <section className="rounded-md border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">Redraw Design</h2><p className="mt-1 text-xs text-muted-foreground">Install the design-recreation skills, agent, and four-step review pipeline.</p></div><button type="button" onClick={() => client.dispatch(command('preset.redrawDesign.apply', {}))} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Apply preset</button></div></section>
    <RegistrySection title="Skills" empty="No registry skills yet." items={state.registry.skills.map((item) => <li key={item.id}><code className="text-foreground">{item.id}</code><span className="ml-2 text-muted-foreground">{item.description}</span></li>)} />
    <RegistrySection title="Agents" empty="No registry agents yet." items={state.registry.agents.map((item) => <li key={item.id}><code className="text-foreground">{item.id}</code><span className="ml-2 text-muted-foreground">{item.model} · {item.skills.join(', ') || 'no skills'}</span></li>)} />
    <RegistrySection title="Pipelines" empty="No registry pipelines yet." items={state.registry.pipelines.map((item) => <li key={item.id}><code className="text-foreground">{item.id}</code><span className="ml-2 text-muted-foreground">v{item.version} · {item.steps.map((step) => step.id).join(' → ')}</span></li>)} />
  </div>;
}

function RegistrySection({ title, empty, items }: { title: string; empty: string; items: readonly ReactNode[] }) {
  return <section className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">{title}</h2>{items.length ? <ul className="mt-3 space-y-2 text-xs">{items}</ul> : <p className="mt-2 text-xs text-muted-foreground">{empty}</p>}</section>;
}
