import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronRight, FileCheck2, MessageSquare, Plus, Send, Sparkles } from 'lucide-react';

import type { ShapeSummary, WorkspaceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { postMessage } from '@/lib/bridge';

interface Props {
  state: WorkspaceState;
  selectedShapeId?: string;
  onSelectShape: (shapeId: string) => void;
}

export function DiscoveryView({ state, selectedShapeId, onSelectShape }: Props) {
  const [creating, setCreating] = useState(false);
  const selected = state.shapes.find((shape) => shape.id === selectedShapeId) ?? state.shapes[0];
  const foundation = state.foundation;

  useEffect(() => {
    if (selected && selected.id !== selectedShapeId) onSelectShape(selected.id);
  }, [selected, selectedShapeId, onSelectShape]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Pre-epic discovery</div>
              <h1 className="mt-1 text-xl font-bold text-foreground">Discuss first. Commit when it is clear.</h1>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                A Shape preserves the human–agent decision before any task, workflow, or source change exists.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => postMessage({ type: 'openDiscoveryGuide' })} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent">
              <BookOpen className="h-3.5 w-3.5 text-primary" /> Guide
            </button>
            <button type="button" onClick={() => setCreating(true)} disabled={foundation?.status !== 'ready'} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> New Shape
            </button>
          </div>
        </div>

        <FoundationCard state={state} />
      </section>

      {creating && <CreateShapeForm onClose={() => setCreating(false)} />}

      <div className="grid min-h-[470px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs font-bold text-foreground">Shapes</div>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Exploration stays outside delivery tasks.</p>
          </div>
          {state.shapes.length === 0 ? (
            <div className="p-4 text-xs leading-relaxed text-muted-foreground">Publish Foundation, then create a Shape for the problem you want to discuss.</div>
          ) : (
            <div className="divide-y divide-border">
              {state.shapes.map((shape) => (
                <button key={shape.id} type="button" onClick={() => onSelectShape(shape.id)} className={cn('w-full px-4 py-3 text-left transition-colors hover:bg-accent/60', selected?.id === shape.id && 'bg-primary/5')}>
                  <div className="flex items-center justify-between gap-2"><code className="text-[10px] font-semibold text-primary">{shape.id}</code><StatusBadge status={shape.status} /></div>
                  <div className="mt-1 truncate text-xs font-semibold text-foreground">{shape.title}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">r{shape.revision} · {formatUpdated(shape.updatedAt)}</div>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="rounded-xl border border-border bg-card">
          {selected ? <ShapeDetail shape={selected} /> : <EmptyDetail />}
        </section>
      </div>
    </div>
  );
}

function FoundationCard({ state }: { state: WorkspaceState }) {
  const foundation = state.foundation;
  const ready = foundation?.status === 'ready';
  return (
    <div className={cn('mt-5 rounded-lg border p-3.5', ready ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><FileCheck2 className="h-3.5 w-3.5 text-primary" /> Project Foundation <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] uppercase', ready ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>{foundation?.status ?? 'incomplete'}</span></div>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            {foundation?.reason ?? `Revision ${foundation?.revision ?? 0} is pinned by every new Shape.`}
          </p>
        </div>
        <div className="flex gap-2">
          {state.projectWorkspace && !state.projectWorkspace.initialized && (
            <button type="button" onClick={() => postMessage({ type: 'initializeProjectWorkspace' })} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[10.5px] font-semibold text-foreground hover:bg-accent">Create project context</button>
          )}
          <button type="button" onClick={() => postMessage({ type: 'publishFoundation' })} disabled={state.projectWorkspace !== undefined && !state.projectWorkspace.initialized} className="rounded-md bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {foundation?.status === 'stale' ? 'Publish new revision' : 'Publish Foundation'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateShapeForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [appetite, setAppetite] = useState('One focused delivery cycle');
  const canCreate = Boolean(title.trim() && problem.trim());
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center justify-between"><div className="text-sm font-bold text-foreground">Start a Shape</div><button type="button" onClick={onClose} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">Cancel</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Title" value={title} onChange={setTitle} placeholder="Outcome, not a solution" /><Field label="Appetite" value={appetite} onChange={setAppetite} placeholder="e.g. one focused delivery cycle" /></div>
      <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Problem" multiline value={problem} onChange={setProblem} placeholder="What is painful, risky, or missing?" /><Field label="Desired outcome" multiline value={desiredOutcome} onChange={setDesiredOutcome} placeholder="What should be true when this is done?" /></div>
      <button type="button" disabled={!canCreate} onClick={() => { postMessage({ type: 'createShape', title, problem, desiredOutcome, appetite }); onClose(); }} className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Create Shape</button>
    </section>
  );
}

function ShapeDetail({ shape }: { shape: ShapeSummary }) {
  const [editing, setEditing] = useState(false);
  const [proposal, setProposal] = useState(false);
  const [proposalText, setProposalText] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [draft, setDraft] = useState(() => toDraft(shape));
  useEffect(() => { setDraft(toDraft(shape)); setEditing(false); }, [shape.id, shape.revision]);
  const canEdit = shape.status !== 'converted' && shape.status !== 'shelved';
  const canMarkReady = shape.status === 'exploring';
  const isReady = shape.readinessBlockers.length === 0;

  const save = () => {
    postMessage({ type: 'updateShape', shapeId: shape.id, revision: shape.revision, patch: fromDraft(draft) });
  };
  const applyProposal = () => {
    try {
      const raw = JSON.parse(proposalText) as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected a JSON object.');
      postMessage({ type: 'updateShape', shapeId: shape.id, revision: shape.revision, patch: raw, source: 'agent-proposal' });
      setProposalText(''); setProposalError(''); setProposal(false);
    } catch (error) { setProposalError(error instanceof Error ? error.message : 'Invalid JSON.'); }
  };

  return (
    <div className="p-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2"><code className="text-[10px] font-semibold text-primary">{shape.id}</code><StatusBadge status={shape.status} /><span className="text-[10px] text-muted-foreground">revision {shape.revision}</span></div><h2 className="mt-1.5 text-lg font-bold text-foreground">{shape.title}</h2><p className="mt-1 text-[10.5px] text-muted-foreground">Foundation r{shape.foundationRevision} · {shape.foundationHash.slice(0, 10)}</p></div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <button type="button" onClick={() => postMessage({ type: 'openShapeDiscussion', shapeId: shape.id })} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[10.5px] font-semibold text-foreground hover:bg-accent"><MessageSquare className="h-3.5 w-3.5 text-primary" /> Open / resume chat</button>}
          {canEdit && <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[10.5px] font-semibold text-foreground hover:bg-accent">{editing ? 'Close editor' : 'Edit brief'}</button>}
        </div>
      </div>

      {shape.readinessBlockers.length > 0 && shape.status !== 'converted' && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3"><div className="text-[10.5px] font-bold uppercase tracking-wide text-warning">Not ready to accept</div><ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10.5px] leading-relaxed text-muted-foreground">{shape.readinessBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>
      )}

      {editing ? <ShapeEditor draft={draft} onChange={setDraft} onSave={save} onCancel={() => { setDraft(toDraft(shape)); setEditing(false); }} /> : <ShapeReadView shape={shape} />}

      {canEdit && <div className="mt-5 border-t border-border pt-4">
        <button type="button" onClick={() => setProposal((value) => !value)} className="text-[10.5px] font-semibold text-primary hover:underline">{proposal ? 'Close agent proposal' : 'Apply agent proposal JSON'}</button>
        {proposal && <div className="mt-2"><textarea value={proposalText} onChange={(event) => setProposalText(event.target.value)} placeholder={'Paste the JSON from the agent\'s shape-update block.'} className="min-h-28 w-full rounded-md border border-border bg-background p-2.5 font-mono text-[10px] text-foreground outline-none focus:border-primary" />{proposalError && <div className="mt-1 text-[10px] text-destructive">{proposalError}</div>}<button type="button" onClick={applyProposal} className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[10.5px] font-semibold text-primary hover:bg-primary/10"><Send className="h-3 w-3" /> Apply proposal</button></div>}
      </div>}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {canMarkReady && <button type="button" disabled={!isReady} onClick={() => postMessage({ type: 'markShapeReady', shapeId: shape.id, revision: shape.revision })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Run readiness check</button>}
        {shape.status === 'ready' && <button type="button" onClick={() => postMessage({ type: 'acceptShape', shapeId: shape.id, revision: shape.revision })} className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-2 text-[10.5px] font-semibold text-white hover:bg-success/90"><Check className="h-3.5 w-3.5" /> Accept this exact revision</button>}
        {shape.status === 'accepted' && <button type="button" onClick={() => postMessage({ type: 'convertShapeStartEpic', shapeId: shape.id })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90"><ChevronRight className="h-3.5 w-3.5" /> Create Epic from accepted Shape</button>}
        {shape.status === 'converted' && <span className="rounded-md bg-success/10 px-3 py-2 text-[10.5px] font-semibold text-success">Converted to {shape.convertedEpicId}</span>}
        {(shape.status === 'ready' || shape.status === 'accepted' || shape.status === 'shelved') && <button type="button" onClick={() => postMessage({ type: 'reopenShape', shapeId: shape.id, revision: shape.revision })} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-foreground hover:bg-accent">Reopen discussion</button>}
        {canEdit && <button type="button" onClick={() => postMessage({ type: 'shelveShape', shapeId: shape.id, revision: shape.revision })} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">Shelve</button>}
      </div>
    </div>
  );
}

function ShapeReadView({ shape }: { shape: ShapeSummary }) {
  const items = [
    ['Problem', shape.problem], ['Desired outcome', shape.desiredOutcome], ['Appetite', shape.appetite], ['Selected approach', shape.selectedApproach], ['Rationale', shape.rationale], ['Architecture impact', shape.architectureImpact],
  ].filter(([, value]) => Boolean(value));
  return <div className="mt-5 space-y-4">{items.map(([label, value]) => <div key={label}><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{value}</p></div>)}<ListBlock title="Constraints" values={shape.constraints} /><ListBlock title="No-gos" values={shape.noGos} /><ListBlock title="Acceptance criteria" values={shape.acceptanceCriteria} /><ListBlock title="Risks" values={shape.risks} /><ListBlock title="Open questions" values={shape.openQuestions} />{shape.options.length > 0 && <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Options</div><div className="mt-1.5 space-y-2">{shape.options.map((option) => <div key={option.id} className="rounded-md bg-secondary/50 p-2.5"><div className="text-[11px] font-semibold text-foreground">{option.title}</div><p className="mt-1 text-[10.5px] text-muted-foreground">{option.summary}</p></div>)}</div></div>}</div>;
}

function ShapeEditor({ draft, onChange, onSave, onCancel }: { draft: ReturnType<typeof toDraft>; onChange: (value: ReturnType<typeof toDraft>) => void; onSave: () => void; onCancel: () => void }) {
  const update = (key: keyof typeof draft, value: string) => onChange({ ...draft, [key]: value });
  return <div className="mt-5 space-y-3"><div className="grid gap-3 md:grid-cols-2"><Field label="Title" value={draft.title} onChange={(value) => update('title', value)} /><Field label="Appetite" value={draft.appetite} onChange={(value) => update('appetite', value)} /></div><div className="grid gap-3 md:grid-cols-2"><Field label="Problem" multiline value={draft.problem} onChange={(value) => update('problem', value)} /><Field label="Desired outcome" multiline value={draft.desiredOutcome} onChange={(value) => update('desiredOutcome', value)} /></div><div className="grid gap-3 md:grid-cols-2"><Field label="Selected approach" multiline value={draft.selectedApproach} onChange={(value) => update('selectedApproach', value)} /><Field label="Rationale" multiline value={draft.rationale} onChange={(value) => update('rationale', value)} /></div><div className="grid gap-3 md:grid-cols-2"><Field label="No-gos (one per line)" multiline value={draft.noGos} onChange={(value) => update('noGos', value)} /><Field label="Acceptance criteria (one per line)" multiline value={draft.acceptanceCriteria} onChange={(value) => update('acceptanceCriteria', value)} /></div><div className="grid gap-3 md:grid-cols-2"><Field label="Constraints (one per line)" multiline value={draft.constraints} onChange={(value) => update('constraints', value)} /><Field label="Risks (one per line)" multiline value={draft.risks} onChange={(value) => update('risks', value)} /></div><Field label="Architecture impact" multiline value={draft.architectureImpact} onChange={(value) => update('architectureImpact', value)} /><Field label="Open questions (one per line; must be empty to accept)" multiline value={draft.openQuestions} onChange={(value) => update('openQuestions', value)} /><div className="flex gap-2"><button type="button" onClick={onSave} className="rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90">Save brief</button><button type="button" onClick={onCancel} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-foreground hover:bg-accent">Cancel</button></div></div>;
}

function Field({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  const className = 'mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary';
  return <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn(className, 'min-h-20 resize-y leading-relaxed')} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />}</label>;
}

function ListBlock({ title, values }: { title: string; values: string[] }) { return values.length ? <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div><ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-foreground">{values.map((value) => <li key={value}>{value}</li>)}</ul></div> : null; }
function StatusBadge({ status }: { status: ShapeSummary['status'] }) { const colors: Record<ShapeSummary['status'], string> = { draft: 'bg-secondary text-muted-foreground', exploring: 'bg-primary/10 text-primary', ready: 'bg-warning/10 text-warning', accepted: 'bg-success/10 text-success', converted: 'bg-success/10 text-success', shelved: 'bg-secondary text-muted-foreground' }; return <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase', colors[status])}>{status}</span>; }
function EmptyDetail() { return <div className="flex min-h-80 flex-col items-center justify-center p-6 text-center"><MessageSquare className="h-7 w-7 text-muted-foreground/60" /><div className="mt-3 text-xs font-semibold text-foreground">No Shape selected</div><p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">Publish a current Foundation, then turn the problem you want to discuss into a Shape.</p></div>; }
function toDraft(shape: ShapeSummary) { return { title: shape.title, problem: shape.problem, desiredOutcome: shape.desiredOutcome, appetite: shape.appetite, constraints: shape.constraints.join('\n'), selectedApproach: shape.selectedApproach, rationale: shape.rationale, risks: shape.risks.join('\n'), noGos: shape.noGos.join('\n'), acceptanceCriteria: shape.acceptanceCriteria.join('\n'), architectureImpact: shape.architectureImpact, openQuestions: shape.openQuestions.join('\n') }; }
function fromDraft(draft: ReturnType<typeof toDraft>) { const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); return { ...draft, constraints: lines(draft.constraints), risks: lines(draft.risks), noGos: lines(draft.noGos), acceptanceCriteria: lines(draft.acceptanceCriteria), openQuestions: lines(draft.openQuestions) }; }
function formatUpdated(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(); }
