import { useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered, ChevronRight, FileUp, Loader2, Sparkles, Plus, DownloadCloud, FolderOpen, Github, Layers, X, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentMeta, ExtraProject, PipelineSummary } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';
import { pickAndReadFile, pickFolder } from '@/lib/pickFile';
import { postMessage, onHostMessage } from '@/lib/bridge';
import { pickDefaultPipelineId } from '../../defaultWorkflow';

const ID_PATTERN = /^[A-Z][A-Z0-9-]*$/;

interface CapabilityPrompt {
  prompt: string;
  placeholder: string;
  defaultValue?: string;
}

const CAPABILITY_PROMPTS: Record<string, CapabilityPrompt> = {
  jira: { prompt: 'Jira ticket key or URL', placeholder: 'PROJ-123 or https://acme.atlassian.net/browse/PROJ-123' },
  figma: { prompt: 'Figma file URL or file key', placeholder: 'https://www.figma.com/file/abc123/...' },
  'core-business': { prompt: 'Path to core business docs (relative)', placeholder: 'docs/core', defaultValue: 'docs/core' },
  github: { prompt: 'GitHub repo or PR URL', placeholder: 'owner/repo or https://github.com/owner/repo/pull/42' },
  slack: { prompt: 'Slack channel or thread URL', placeholder: '#engineering or https://slack.com/...' },
  files: { prompt: 'Files glob (relative to project root)', placeholder: 'src/**/*.ts' },
  web: { prompt: 'URLs to fetch (comma-separated, optional)', placeholder: 'https://example.com/...' },
};

export type EpicTargetKind = 'pipeline' | 'agent' | 'recipe';

type ExternalSource = 'jira' | 'github' | 'drive' | 'url';

const EXTERNAL_SOURCES: { id: ExternalSource; label: string; placeholder: string }[] = [
  { id: 'jira', label: 'Jira', placeholder: 'PROJ-123 or https://acme.atlassian.net/browse/PROJ-123' },
  { id: 'github', label: 'GitHub', placeholder: 'owner/repo#123 or https://github.com/owner/repo/pull/42' },
  { id: 'drive', label: 'Drive', placeholder: 'https://docs.google.com/document/d/… or file id' },
  { id: 'url', label: 'URL', placeholder: 'https://… (spec / requirement page)' },
];

/** What happens right after the owning Change is created (plan §12.1) — every submission creates a Change first, then takes exactly one of these. */
export type ChangeComposerNextAction = 'start-epic' | 'explore' | 'save';

export interface StartEpicDraft {
  target: { kind: EpicTargetKind; id: string };
  epicId: string;
  title: string;
  description: string;
  inputs: Record<string, string>;
  extraProjects?: ExtraProject[];
  /** Set only by an accepted Discovery Shape; host performs the atomic conversion. */
  sourceShapeId?: string;
  sourceShapeRevision?: number;
  /** Present when the modal configures delivery for an already captured Change. */
  existingChange?: { id: string; expectedRevision: number; expectedContentHash: string };
  /** What to do once the owning Change exists — defaults to `start-epic` (today's one-click behavior). */
  nextAction: ChangeComposerNextAction;
}

/**
 * Values the host can seed the form with — currently from the Sprint tab, where
 * a Jira ticket supplies the id, title, brief and the `jira` capability input.
 * Every field stays editable: prefill is a starting point, not a decision.
 */
export interface StartEpicPrefill {
  epicId?: string;
  title?: string;
  description?: string;
  inputs?: Record<string, string>;
  sourceShapeId?: string;
  sourceShapeRevision?: number;
  existingChange?: { id: string; expectedRevision: number; expectedContentHash: string };
}

interface Props {
  pipelines: PipelineSummary[];
  agentMeta: Record<string, AgentMeta>;
  nextEpicId: string;
  existingEpicIds: string[];
  epicsDir: string;
  isFirstEpic: boolean;
  workspaceName: string;
  /** When false (no folder open), the user must add at least one project. */
  hasFolder?: boolean;
  prefill?: StartEpicPrefill;
  onSubmit: (draft: StartEpicDraft) => void;
  onClose: () => void;
}

type Selection = { kind: 'pipeline'; id: string };

function defaultSelection(pipelines: PipelineSummary[]): Selection {
  const startable = pipelines.filter((pipeline) => !pipeline.templateOnly);
  return { kind: 'pipeline', id: pickDefaultPipelineId(startable) };
}

export function StartEpicModal({
  pipelines,
  agentMeta,
  nextEpicId,
  existingEpicIds,
  epicsDir,
  isFirstEpic,
  workspaceName,
  hasFolder = true,
  prefill,
  onSubmit,
  onClose,
}: Props) {
  const existingChange = prefill?.existingChange;
  const [selected, setSelected] = useState<Selection>(() => defaultSelection(pipelines));
  // Start empty (nextEpicId is shown only as a placeholder). A pre-filled
  // "EPIC-100" looks like a Jira key and would trigger auto-analysis on open.
  // A real prefill from the Sprint tab is different: the key IS a Jira key, and
  // the description is already the ticket's own text, so there is nothing to
  // auto-fetch.
  const [epicId, setEpicId] = useState(prefill?.epicId ?? '');
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [inputs, setInputs] = useState<Record<string, string>>(prefill?.inputs ?? {});
  const [nextAction, setNextAction] = useState<ChangeComposerNextAction>('start-epic');
  const idInputRef = useRef<HTMLInputElement>(null);
  // Extra projects (GH-67)
  const [extraProjects, setExtraProjects] = useState<ExtraProject[]>([]);
  const [addingGithub, setAddingGithub] = useState(false);
  const [githubInput, setGithubInput] = useState('');
  const [githubModeStep, setGithubModeStep] = useState(false); // true = show mode picker after entering repo
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [cloningRepo, setCloningRepo] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const [descLoading, setDescLoading] = useState(false);
  const [descLoadInfo, setDescLoadInfo] = useState<{ kind: 'loaded' | 'error'; text: string } | null>(null);
// External requirement loading (Jira / GitHub / Drive / URL via Claude MCP).
  const [loadSource, setLoadSource] = useState<ExternalSource | null>(null);
  const [loadRef, setLoadRef] = useState('');
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [loadingSource, setLoadingSource] = useState<ExternalSource | null>(null);
  const [loadElapsed, setLoadElapsed] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasWorkflows = pipelines.length > 0;
  // Hide legacy templateOnly payloads; CoFoFo's three pipelines are startable.
  const startablePipelines = useMemo(
    () => pipelines.filter((p) => !p.templateOnly),
    [pipelines],
  );
  const userPipelines = useMemo(() => startablePipelines.filter((p) => !p.builtin), [startablePipelines]);
  const aidlcPipelines = useMemo(() => startablePipelines.filter((p) => p.builtin), [startablePipelines]);
  // The ref of the in-flight external load. Streamed chunks / results carry
  // their ref; we drop any that don't match (the user moved on to another).
  const activeLoadRef = useRef('');
  // Watchdog so a load can never spin forever (e.g. the host never replies
  // because the connector hung). Cleared by every terminal load message.
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearLoad = () => {
    if (loadTimer.current) { clearTimeout(loadTimer.current); loadTimer.current = null; }
    if (loadTick.current) { clearInterval(loadTick.current); loadTick.current = null; }
    activeLoadRef.current = '';
    setLoadingExternal(false);
    setLoadingSource(null);
  };

  const onLoadDescriptionFromFile = async () => {
    setDescLoading(true);
    setDescLoadInfo(null);
    try {
      const result = await pickAndReadFile();
      if (!result) { return; }
      setDescription(result.content);
      setDescLoadInfo({ kind: 'loaded', text: `Loaded ${result.fileName} (${formatBytes(result.byteLength)})` });
    } catch (err) {
      setDescLoadInfo({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setDescLoading(false);
    }
  };

  useEffect(() => {
    idInputRef.current?.focus();
    idInputRef.current?.select();
    // Clear any pending load watchdog / tick if the modal unmounts mid-load.
    return () => {
      if (loadTimer.current) { clearTimeout(loadTimer.current); }
      if (loadTick.current) { clearInterval(loadTick.current); }
    };
  }, []);

  useEffect(() => {
    const valid = startablePipelines.some((p) => p.id === selected.id);
    if (!valid && startablePipelines[0]) {
      setSelected({ kind: 'pipeline', id: startablePipelines[0].id });
    }
  }, [startablePipelines, selected.id]);


  useEffect(() => {
    return onHostMessage((m) => {
      // Streamed external load: clear → append chunks → finalize. Drop messages
      // for a ref the user has moved past (started another load / edited).
      if (m.type === 'requirementLoadStart') {
        if (String(m.ref ?? '').trim() !== activeLoadRef.current) { return; }
        setDescription('');
        return;
      }
      if (m.type === 'requirementChunk') {
        if (String(m.ref ?? '').trim() !== activeLoadRef.current) { return; }
        const chunk = String(m.chunk ?? '');
        if (chunk) { setDescription((d) => d + chunk); }
        return;
      }
      if (m.type === 'requirementLoaded') {
        if (String(m.ref ?? '').trim() !== activeLoadRef.current) { return; }
        clearLoad();
        setLoadSource(null);
        setLoadRef('');
        // Safety / back-compat: if streamed chunks didn't fill the field (a
        // non-streaming host, or chunks dropped), drop the summary in now so
        // the description never ends up empty after a successful load.
        const summary = String(m.summary ?? '');
        if (summary) { setDescription((d) => (d.trim() ? d : summary)); }
        const loadedEpicId = String(m.epicId ?? '');
        if (loadedEpicId && ID_PATTERN.test(loadedEpicId)) {
          setEpicId((cur) => (cur.trim() ? cur : loadedEpicId));
        }
        setDescLoadInfo({ kind: 'loaded', text: `Loaded from ${String(m.source ?? '')}` });
        return;
      }
      if (m.type === 'requirementLoadError') {
        // Always stop the spinner — a stuck "loading…" with no message is the
        // worst case. Only touch the description for the load we started.
        const ref = String(m.ref ?? '').trim();
        const ours = !ref || ref === activeLoadRef.current;
        clearLoad();
        if (ours) { setDescription(''); }  // drop the partial stream
        setLoadError(String(m.message ?? 'Failed to load requirement.'));
        return;
      }
    });
  }, []);

  const startLoad = (source: ExternalSource, ref: string) => {
    const r = ref.trim();
    if (!r) { return; }
    if (loadTimer.current) { clearTimeout(loadTimer.current); }
    if (loadTick.current) { clearInterval(loadTick.current); }
    activeLoadRef.current = r;
    setLoadingExternal(true);
    setLoadingSource(source);
    setLoadElapsed(0);
    setLoadError(null);
    setDescription('');
    postMessage({ type: 'loadRequirement', source, ref: r });
    loadTick.current = setInterval(() => setLoadElapsed((s) => s + 1), 1000);
    // Safety net: if the host never replies (connector hung, process wedged),
    // stop the spinner and tell the user instead of loading forever.
    loadTimer.current = setTimeout(() => {
      if (activeLoadRef.current !== r) { return; }
      clearLoad();
      setDescription('');
      setLoadError(
        `Timed out loading from ${source}. The connector may be unreachable from the background CLI — paste the requirement text into the description instead.`,
      );
    }, 110_000);
  };

  const loadFromSource = () => {
    if (!loadSource || !loadRef.trim()) { return; }
    startLoad(loadSource, loadRef.trim());
  };


  // ── Extra project helpers (GH-67) ──────────────────────────────────────────
  const isDuplicateProject = (ref: string) =>
    extraProjects.some((p) => p.ref === ref);

  const addLocalProject = async () => {
    setLoadingFolder(true);
    setDuplicateWarning(null);
    try {
      const folderPath = await pickFolder();
      if (!folderPath) { return; }
      if (isDuplicateProject(folderPath)) {
        setDuplicateWarning('This project is already added.');
        return;
      }
      const label = folderPath.split('/').filter(Boolean).pop() ?? folderPath;
      setExtraProjects((prev) => [...prev, { type: 'local', ref: folderPath, label, mode: 'workspace' }]);
    } finally {
      setLoadingFolder(false);
    }
  };

  const parseGithubRef = (raw: string): string => {
    const m = raw.match(/github\.com\/([^/]+\/[^/]+)/);
    return m ? m[1].replace(/\.git$/, '') : raw;
  };

  const confirmGithubRepo = () => {
    const raw = githubInput.trim();
    if (!raw) { return; }
    setDuplicateWarning(null);
    const ref = parseGithubRef(raw);
    if (isDuplicateProject(ref)) {
      setDuplicateWarning('This project is already added.');
      return;
    }
    // Show mode picker
    setGithubModeStep(true);
  };

  const addGithubWithMode = (mode: 'reference' | 'clone') => {
    const ref = parseGithubRef(githubInput.trim());
    const label = ref.split('/').pop() ?? ref;
    if (mode === 'clone') {
      setCloningRepo(true);
      postMessage({ type: 'cloneGithubProject', ref });
    } else {
      setExtraProjects((prev) => [...prev, { type: 'github', ref, label, mode: 'reference' }]);
      setGithubInput('');
      setAddingGithub(false);
      setGithubModeStep(false);
    }
  };

  // Listen for clone result from host
  useEffect(() => {
    return onHostMessage((m) => {
      if (m.type === 'cloneGithubProject:done') {
        setCloningRepo(false);
        const ref = String(m.ref ?? '');
        const localPath = String(m.localPath ?? '');
        const label = ref.split('/').pop() ?? ref;
        if (localPath) {
          setExtraProjects((prev) => [...prev, { type: 'github', ref, label, mode: 'clone' }]);
        }
        setGithubInput('');
        setAddingGithub(false);
        setGithubModeStep(false);
        return;
      }
      if (m.type === 'cloneGithubProject:error') {
        setCloningRepo(false);
        setGithubModeStep(false);
        setDuplicateWarning(String(m.message ?? 'Clone failed'));
        return;
      }
    });
  }, []);

  const removeProject = (idx: number) => {
    setExtraProjects((prev) => prev.filter((_, i) => i !== idx));
    setDuplicateWarning(null);
  };

  const selectedAgents = useMemo<string[]>(() => {
    return pipelines.find((p) => p.id === selected.id)?.steps.map((s) => s.agent) ?? [];
  }, [selected.id, pipelines]);


  const capabilities = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of selectedAgents) {
      for (const c of agentMeta[a]?.capabilities ?? []) {
        if (!seen.has(c)) { seen.add(c); out.push(c); }
      }
    }
    return out;
  }, [selectedAgents, agentMeta]);

  useEffect(() => {
    setInputs((cur) => {
      const next = { ...cur };
      let changed = false;
      for (const cap of capabilities) {
        if (!(cap in next)) {
          const def = CAPABILITY_PROMPTS[cap]?.defaultValue ?? '';
          if (def) { next[cap] = def; changed = true; }
        }
      }
      return changed ? next : cur;
    });
  }, [capabilities]);

  // Empty field falls back to the suggested next id (shown as placeholder).
  const effectiveId = epicId.trim() || nextEpicId;
  const trimmedId = epicId.trim();
  const startingEpicNow = Boolean(existingChange) || nextAction === 'start-epic';
  const idError = useMemo(() => {
    if (!startingEpicNow) { return null; }
    if (!effectiveId) { return 'Epic id is required'; }
    if (!ID_PATTERN.test(effectiveId)) {
      return 'Uppercase letters / digits / dashes only — must start with a letter';
    }
    if (existingEpicIds.includes(effectiveId)) { return `Epic "${effectiveId}" already exists`; }
    return null;
  }, [startingEpicNow, effectiveId, existingEpicIds]);

  const targetError = startingEpicNow && !selected.id ? 'Pick a pipeline' : null;
  const projectError = startingEpicNow && !hasFolder && extraProjects.length === 0
    ? 'Add at least one project to create a task'
    : null;
  const requirementError = !startingEpicNow && !title.trim() && !description.trim()
    ? 'Add a title or description'
    : null;
  const error = idError || targetError || projectError || requirementError;

  const submit = () => {
    if (error) { return; }
    const cleanInputs: Record<string, string> = {};
    for (const cap of capabilities) {
      const v = (inputs[cap] ?? '').trim();
      if (v) { cleanInputs[cap] = v; }
    }
    onSubmit({
      target: { kind: 'pipeline', id: selected.id },
      epicId: effectiveId,
      title: title.trim(),
      description: description.trim(),
      inputs: cleanInputs,
      nextAction,
      extraProjects: extraProjects.length > 0 ? extraProjects : undefined,
      sourceShapeId: prefill?.sourceShapeId,
      sourceShapeRevision: prefill?.sourceShapeRevision,
      existingChange,
    });
    onClose();
  };

  const [localEpicsDir, setLocalEpicsDir] = useState(epicsDir);

  return (
    <Modal title={existingChange ? `Start Epic · ${existingChange.id}` : 'New task'} maxWidth="max-w-2xl" onClose={onClose} onSubmit={submit} closeOnBackdrop={false}>
      <div className="space-y-4">
        {isFirstEpic && hasFolder && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-primary">
              <FolderOpen className="h-3 w-3" />
              Tasks directory
            </label>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Where should task workspaces be stored? You can change this later from the Tasks view.
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={localEpicsDir}
                onChange={(e) => setLocalEpicsDir(e.target.value)}
                onBlur={() => {
                  const val = localEpicsDir.trim();
                  if (val && val !== epicsDir) { postMessage({ type: 'changeEpicsDir', dir: val }); }
                }}
                spellCheck={false}
                className="flex-1 rounded-md border border-border bg-input/50 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => postMessage({ type: 'browseEpicsDir' })}
                title="Browse for a folder"
                className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <FolderOpen className="h-3 w-3" />
                Browse
              </button>
            </div>
          </div>
        )}

        {/* ── Project context (GH-67) ────────────────────────────────────── */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3 w-3" />
            Project context
          </label>
          <div className="space-y-1.5">
            {hasFolder && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="flex-1 text-[11px] font-medium text-foreground">
                  {workspaceName || 'Current workspace'}
                </span>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase text-primary">current</span>
              </div>
            )}
            {!hasFolder && extraProjects.length === 0 && (
              <div className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2.5 text-[11px] text-amber-600 dark:text-amber-400">
                No project open. Add at least one project below to create a task.
              </div>
            )}

            {extraProjects.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2">
                {p.type === 'github'
                  ? <Github className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="flex-1 truncate font-mono text-[10.5px] text-foreground" title={p.ref}>{p.ref}</span>
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase',
                  p.mode === 'workspace' ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                    : p.mode === 'clone' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {p.mode === 'workspace' ? 'workspace' : p.mode === 'clone' ? 'cloned' : 'ref'}
                </span>
                <button type="button" onClick={() => removeProject(i)}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {addingGithub && !githubModeStep && (
              <div className="flex gap-1.5">
                <input value={githubInput} onChange={(e) => setGithubInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); confirmGithubRepo(); }
                    if (e.key === 'Escape') { setAddingGithub(false); }
                  }}
                  autoFocus placeholder="owner/repo or github.com URL"
                  className="flex-1 rounded-md border border-border bg-input/50 px-2.5 py-1.5 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
                <button type="button" onClick={confirmGithubRepo}
                  disabled={!githubInput.trim()}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  Next
                </button>
                <button type="button" onClick={() => { setAddingGithub(false); setDuplicateWarning(null); }}
                  className="rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent">Cancel</button>
              </div>
            )}
            {addingGithub && githubModeStep && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <div className="mb-2 text-[10.5px] font-medium text-foreground">
                  How to use <span className="font-mono text-primary">{parseGithubRef(githubInput)}</span>?
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => addGithubWithMode('reference')}
                    disabled={cloningRepo}
                    className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/50 disabled:opacity-50">
                    <div className="text-[11px] font-semibold text-foreground">Reference only</div>
                    <div className="text-[10px] text-muted-foreground">Agent reads via GitHub API — no local clone</div>
                  </button>
                  <button type="button" onClick={() => addGithubWithMode('clone')}
                    disabled={cloningRepo}
                    className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/50 disabled:opacity-50">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                      {cloningRepo ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranch className="h-3 w-3" />}
                      Clone to workspace
                    </div>
                    <div className="text-[10px] text-muted-foreground">Git clone + open in VS Code for full access</div>
                  </button>
                </div>
                {!cloningRepo && (
                  <button type="button" onClick={() => { setGithubModeStep(false); }}
                    className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground">Back</button>
                )}
              </div>
            )}

            {duplicateWarning && (
              <div className="text-[10px] text-destructive">{duplicateWarning}</div>
            )}

            {!addingGithub && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button type="button" onClick={addLocalProject} disabled={loadingFolder}
                  className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                  {loadingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderOpen className="h-3 w-3" />}
                  Add local project
                </button>
                <button type="button" onClick={() => { setAddingGithub(true); setDuplicateWarning(null); setGithubModeStep(false); }}
                  className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary/40 hover:text-foreground">
                  <Github className="h-3 w-3" />Add GitHub repo
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            <ListOrdered className="h-3 w-3" />
            Workflow
          </label>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {!hasFolder && !hasWorkflows && extraProjects.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                Add a project above first — pipelines load from the project's workspace.
              </div>
            ) : !hasWorkflows ? (
              <NoPipelines
                onClose={onClose}
                projectPath={!hasFolder ? extraProjects.find((p) => p.type === 'local')?.ref : undefined}
              />
            ) : (
              <>
                {userPipelines.length > 0 && (
                  <GroupHeader label="Your pipelines" />
                )}
                {userPipelines.map((p) => {
                  const steps = p.steps.map((s) => s.name ?? s.agent);
                  return (
                    <WorkflowRow
                      key={`p:${p.id}`}
                      id={p.id}
                      active={selected.id === p.id}
                      stepCount={steps.length}
                      steps={steps}
                      onClick={() => setSelected({ kind: 'pipeline', id: p.id })}
                    />
                  );
                })}
                {aidlcPipelines.length > 0 && (
                  <GroupHeader label="AIDLC pipelines (built-in)" />
                )}
                {aidlcPipelines.map((p) => {
                  const steps = p.steps.map((s) => s.name ?? s.agent);
                  return (
                    <WorkflowRow
                      key={`p:${p.id}`}
                      id={p.id}
                      active={selected.id === p.id}
                      badge="built-in"
                      stepCount={steps.length}
                      steps={steps}
                      onClick={() => setSelected({ kind: 'pipeline', id: p.id })}
                    />
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Task id
            </label>
            <input
              ref={idInputRef}
              type="text"
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
              placeholder={nextEpicId || 'EPIC-001'}
              spellCheck={false}
              disabled={!hasWorkflows || Boolean(existingChange)}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            />
            {idError && trimmedId && (
              <div className="mt-1 text-[10.5px] text-destructive">{idError}</div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              {existingChange ? 'Change title' : <>Title <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional)</span></>}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Add user profile page"'
              disabled={!hasWorkflows || Boolean(existingChange)}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Description / requirement{' '}
              <span className="font-normal normal-case tracking-normal text-muted-foreground/80">{existingChange ? '(pinned from Change)' : '(optional)'}</span>
            </label>
            {!existingChange && <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onLoadDescriptionFromFile}
                disabled={descLoading || !hasWorkflows}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                title="Load contents of a text/markdown file into the description"
              >
                {descLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <FileUp className="h-2.5 w-2.5" />}
                <span>Load from file…</span>
              </button>
              {EXTERNAL_SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setLoadSource(s.id);
                    // Jira key is usually the epic id the user already typed — prefill it.
                    setLoadRef(s.id === 'jira' ? epicId.trim() : '');
                    setLoadError(null);
                  }}
                  disabled={!hasWorkflows}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] hover:bg-accent hover:text-foreground disabled:opacity-50',
                    loadSource === s.id ? 'bg-accent text-foreground' : 'text-muted-foreground',
                  )}
                  title={`Load the requirement from ${s.label} (via Claude's MCP integration)`}
                >
                  <DownloadCloud className="h-2.5 w-2.5" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>}
          </div>
          {loadSource && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={loadRef}
                autoFocus
                onChange={(e) => setLoadRef(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadFromSource(); } }}
                placeholder={EXTERNAL_SOURCES.find((s) => s.id === loadSource)?.placeholder}
                className="flex-1 rounded-md border border-border bg-input/50 px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={loadFromSource}
                disabled={loadingExternal || !loadRef.trim()}
                className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-40"
              >
                {loadingExternal ? <Loader2 className="h-3 w-3 animate-spin" /> : <DownloadCloud className="h-3 w-3" />}
                <span>{loadingExternal ? 'Loading…' : 'Load'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setLoadSource(null); setLoadError(null); }}
                className="rounded px-1.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
          {loadingExternal && (
            <div className="mb-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
              <span>Fetching from {loadingSource ?? 'source'} via Claude… (~{loadElapsed}s)</span>
              <button
                type="button"
                onClick={() => { clearLoad(); setLoadError(null); }}
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
          {loadError && (
            <div className="mb-1.5 text-[10px] text-destructive">{loadError}</div>
          )}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Paste a requirement / PRD, or load it from a file. The text is snapshotted into the epic at submit time."
            rows={5}
            disabled={!hasWorkflows || Boolean(existingChange)}
            className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
          />
          {descLoadInfo && (
            <div
              className={cn(
                'mt-1 text-[10px]',
                descLoadInfo.kind === 'loaded' ? 'text-muted-foreground' : 'text-destructive',
              )}
            >
              {descLoadInfo.text}
            </div>
          )}
        </div>

        {capabilities.length > 0 && (
          <div>
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Capability inputs
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({capabilities.length} from pipeline)
              </span>
            </div>
            <div className="space-y-2">
              {capabilities.map((cap) => {
                const meta = CAPABILITY_PROMPTS[cap];
                return (
                  <div key={cap}>
                    <div className="mb-0.5 flex items-baseline gap-1.5">
                      <span className="font-mono text-[10.5px] font-medium text-primary">{cap}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {meta?.prompt ?? `Value for capability \`${cap}\``}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={inputs[cap] ?? ''}
                      onChange={(e) => setInputs((cur) => ({ ...cur, [cap]: e.target.value }))}
                      placeholder={meta?.placeholder ?? 'Value, or leave blank to skip'}
                      className="w-full rounded-md border border-border bg-input/50 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!existingChange && <div>
          <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            What next
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'start-epic' as const, label: 'Start Epic', detail: 'Run a pipeline now' },
                { id: 'explore' as const, label: 'Explore in Discover', detail: 'Shape it before committing' },
                { id: 'save' as const, label: 'Save for later', detail: 'Just capture it' },
              ]
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setNextAction(option.id)}
                data-tour-id={option.id === 'start-epic' ? 'change-route-start-epic' : option.id === 'explore' ? 'change-route-explore' : undefined}
                className={cn(
                  'rounded-md border px-2.5 py-2 text-left transition-colors',
                  nextAction === option.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50',
                )}
              >
                <div className="text-[11px] font-semibold text-foreground">{option.label}</div>
                <div className="text-[10px] text-muted-foreground">{option.detail}</div>
              </button>
            ))}
          </div>
        </div>}
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton
          onClick={submit}
          label={existingChange ? 'Start linked Epic' : nextAction === 'start-epic' ? 'Create & start' : nextAction === 'explore' ? 'Create & explore' : 'Save change'}
          disabled={!!error}
        />
      </ModalFooter>
    </Modal>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-border/50 bg-muted/30 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
  );
}

function WorkflowRow({
  id, active, badge, stepCount, steps, onClick,
}: {
  id: string;
  active: boolean;
  badge?: string;
  stepCount: number;
  steps: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2.5 py-1.5 text-left last:border-b-0',
        active ? 'bg-primary/10' : 'hover:bg-accent/40',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-medium text-foreground">{id}</span>
        {badge && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            {badge}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {stepCount} step{stepCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="truncate text-[10.5px] text-muted-foreground">{steps.join(' → ')}</div>
    </button>
  );
}

function NoPipelines({ onClose, projectPath }: { onClose: () => void; projectPath?: string }) {
  const loadPreset = () => {
    if (projectPath) {
      // No folder open yet — open the selected project first, then ensure CoFoFo.
      postMessage({ type: 'openProjectAndEnsureCofofo', folderPath: projectPath });
    } else {
      postMessage({ type: 'ensureCofofoDefault' });
    }
  };
  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span>No pipelines yet. Prepare the default CoFoFo workflow or create your own.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadPreset}
          title="Prepare the project-local CoFoFo pipelines and assets. No separate installation is required."
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-primary/25"
        >
          <Sparkles className="h-3 w-3" />
          Prepare CoFoFo workflow
        </button>
        <button
          type="button"
          onClick={() => {
            postMessage({ type: 'openAddPipeline' });
            onClose();
          }}
          title="Open the Add-pipeline form to build a custom workflow"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Plus className="h-3 w-3" />
          Create new pipeline
        </button>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) { return `${n} B`; }
  if (n < 1024 * 1024) { return `${(n / 1024).toFixed(1)} KB`; }
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
