import { useState, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Bot,
  GitBranch,
  Zap,
  Layers,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Beaker,
  FileCode2,
  X,
  Sparkles,
  Diamond,
  RefreshCw,
  Plug,
  Loader2,
  HelpCircle,
  ListTree,
  Github,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SidebarState,
  RecentEpicRef,
  TemplateRef,
  McpServerInfo,
} from '@/lib/types';
import { ConfirmModal } from './ConfirmModal';
import { SavePresetModal } from './SavePresetModal';
import { LoadDemoModal } from './LoadDemoModal';
import { ThemeToggle } from './ThemeToggle';
import { postMessage, getPersistedUi, setPersistedUi } from '@/lib/bridge';
import { I18nProvider, useI18n } from '@/lib/i18n';

interface CollapseState {
  recentEpics: boolean;
  workflows: boolean;
  mcpServers: boolean;
}

interface PersistedUi {
  collapsed?: Partial<CollapseState>;
}

const DEFAULT_COLLAPSED: CollapseState = {
  recentEpics: false,
  workflows: false,
  mcpServers: true,
};

export function AppSidebar({ state }: { state: SidebarState | null }) {
  const seed = (getPersistedUi<PersistedUi>() ?? {});
  const [collapsed, setCollapsed] = useState<CollapseState>({
    ...DEFAULT_COLLAPSED,
    ...(seed.collapsed ?? {}),
  });
  const persist = useCallback(
    (next: { collapsed?: CollapseState }) => {
      const merged: PersistedUi = {
        collapsed: next.collapsed ?? collapsed,
      };
      setPersistedUi(merged);
    },
    [collapsed],
  );

  const toggleSection = (key: keyof CollapseState) => {
    const next = { ...collapsed, [key]: !collapsed[key] };
    setCollapsed(next);
    persist({ collapsed: next });
  };

  if (!state) {
    return (
      <I18nProvider lang="en">
        <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            <LoadingLabel />
          </div>
        </aside>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider lang={state.language}>
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <SidebarHeader />

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <AskButton />
        {!state.hasFolder ? (
          <EmptyNoFolder demoProjectExists={state.demoProjectExists} />
        ) : (
          <>
            <ProjectBar workspaceName={state.workspaceName} configExists={state.configExists} extraProjects={state.extraProjects} />
            {state.configExists && (
              <OpenYamlButton />
            )}

            {!state.configExists && (
              <NoWorkspaceYamlNote />
            )}

            {/* Analyze Requirements — always visible when a folder is open */}
            <AnalyzeRequirementsButton />

            {state.configExists && (
              <>
                <OpenWorkspaceButton />

                <StatsGrid state={state} />

                {state.recentEpics.length > 0 && (
                  <RecentEpicsSection
                    epics={state.recentEpics}
                    epicsCount={state.epicsCount}
                    collapsed={collapsed.recentEpics}
                    onToggle={() => toggleSection('recentEpics')}
                  />
                )}
              </>
            )}

            <WorkflowsSection
              builtins={state.builtinTemplates}
              project={state.projectTemplates}
              configExists={state.configExists}
              workspaceName={state.workspaceName}
              autopilotEnabled={state.autopilotEnabled}
              collapsed={collapsed.workflows}
              onToggle={() => toggleSection('workflows')}
            />

            <McpServersSection
              servers={state.mcpServers}
              loading={state.mcpLoading}
              error={state.mcpError}
              collapsed={collapsed.mcpServers}
              onToggle={() => toggleSection('mcpServers')}
            />
          </>
        )}
      </div>

      <Footer hasFolder={state.hasFolder} />

    </aside>
    </I18nProvider>
  );
}

function LoadingLabel() {
  const t = useI18n();
  return <>{t.sidebar.loading}</>;
}

function SidebarHeader() {
  const t = useI18n();
  return (
    <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <BrandIcon />
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold tracking-widest uppercase">{t.sidebar.brandTitle}</h2>
          <p className="truncate text-[10px] text-muted-foreground">{t.sidebar.brandSubtitle}</p>
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
}

function OpenYamlButton() {
  const t = useI18n();
  return (
    <button
      type="button"
      onClick={() => postMessage({ type: 'openYaml' })}
      className="flex w-full items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <FileCode2 className="h-3.5 w-3.5" />
      <span>{t.sidebar.openWorkspaceYaml}</span>
    </button>
  );
}

function NoWorkspaceYamlNote() {
  const t = useI18n();
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/50 p-3 text-[11px] text-muted-foreground leading-relaxed">
      {t.sidebar.noWorkspaceYamlNotePrefix}<code className="rounded bg-primary/10 px-1 py-0.5 font-mono text-primary">workspace.yaml</code>{t.sidebar.noWorkspaceYamlNoteSuffix}
    </div>
  );
}

function AnalyzeRequirementsButton() {
  const t = useI18n();
  return (
    <button
      type="button"
      onClick={() => postMessage({ type: 'openAnalyzeView' })}
      className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{t.sidebar.analyzeRequirements}</span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />
    </button>
  );
}

function OpenWorkspaceButton() {
  const t = useI18n();
  return (
    <button
      type="button"
      onClick={() => postMessage({ type: 'openWorkspace' })}
      className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <Layers className="h-3.5 w-3.5" />
      <span>{t.sidebar.openWorkspace}</span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />
    </button>
  );
}

function AskButton() {
  // Always visible — the whole point is helping users understand the
  // extension and how to set it up, which matters most *before* a workspace
  // exists. Routes to the host `aidlc.ask` command (prompts → claude → preview).
  const t = useI18n();
  return (
    <button
      type="button"
      onClick={() => postMessage({ type: 'askAidlc' })}
      title={t.sidebar.askAidlcTooltip}
      className="flex w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      <span>{t.sidebar.askAidlc}</span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />
    </button>
  );
}

function BrandIcon() {
  const uri = typeof window !== 'undefined' ? window.BRAND_ICON_URI : undefined;
  if (uri) {
    return (
      <img
        src={uri}
        alt="AIDLC"
        className="h-7 w-7 shrink-0 rounded-md object-cover shadow-md shadow-primary/20"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
      <Bot className="h-3.5 w-3.5" />
    </div>
  );
}

function ProjectBar({
  workspaceName,
  configExists,
  extraProjects,
}: {
  workspaceName: string;
  configExists: boolean;
  extraProjects?: Array<{ type: string; ref: string; label: string; mode?: string }>;
}) {
  const t = useI18n();
  const hasExtras = extraProjects && extraProjects.length > 0;
  return (
    <div className="space-y-1">
      {hasExtras && (
        <div className="px-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          {t.sidebar.aidlcWorkspaceLabel}
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => postMessage({ type: 'openBuilder' })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            postMessage({ type: 'openBuilder' });
          }
        }}
        className="group flex cursor-pointer items-center gap-2 rounded-md border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 px-3 py-2 transition-all hover:border-primary/40 hover:from-primary/20 hover:to-primary/10"
        title={t.sidebar.clickToOpenBuilder}
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold tracking-wide text-primary">{workspaceName}</div>
          {!configExists && (
            <div className="text-[10px] text-muted-foreground">{t.sidebar.noWorkspaceYaml}</div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            postMessage({ type: 'openProject' });
          }}
          title={t.sidebar.switchProject}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-primary/20 hover:text-primary"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            postMessage({ type: 'closeProject' });
          }}
          title={t.sidebar.closeProject}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {hasExtras && extraProjects.map((p, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5 text-[10.5px]">
          {p.type === 'github'
            ? <Github className="h-3 w-3 shrink-0 text-muted-foreground" />
            : <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={p.ref}>{p.label}</span>
          <span className={cn(
            'shrink-0 rounded-full px-1 py-0.5 text-[7px] font-bold uppercase',
            p.mode === 'workspace' ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : p.mode === 'clone' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
              : 'bg-muted text-muted-foreground',
          )}>
            {p.mode === 'workspace' ? 'ws' : p.mode === 'clone' ? 'clone' : 'ref'}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyNoFolder({ demoProjectExists }: { demoProjectExists: boolean }) {
  const t = useI18n();
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const onLoadDemo = () => {
    if (demoProjectExists) {
      // Pop the inline picker — replaces the VS Code notification chrome
      // that the host would otherwise show when the dir already exists.
      setDemoModalOpen(true);
    } else {
      // Fresh install — just create + open. No prompt needed.
      postMessage({ type: 'loadDemoProject' });
    }
  };
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/50 p-4 text-center">
      <h3 className="mb-1.5 text-xs font-bold tracking-wide">{t.sidebar.noProjectOpenTitle}</h3>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        {t.sidebar.noProjectOpenBody}
      </p>
      <button
        type="button"
        onClick={() => postMessage({ type: 'openProject' })}
        className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        <span>{t.sidebar.openProject}</span>
        <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />
      </button>
      <button
        type="button"
        onClick={onLoadDemo}
        className="mt-2 flex w-full items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Beaker className="h-3.5 w-3.5" />
        <span>{t.sidebar.loadDemoProject}</span>
      </button>
      {demoModalOpen && (
        <LoadDemoModal
          onChoose={(mode) => postMessage({ type: 'loadDemoProject', mode })}
          onClose={() => setDemoModalOpen(false)}
        />
      )}
    </div>
  );
}

function StatsGrid({ state }: { state: SidebarState }) {
  const t = useI18n();
  // Each tile doubles as navigation: Agents/Skills/Flows deep-link into the
  // matching Builder tab, while Epics opens the dedicated top-level Epics view
  // (the Builder no longer has an Epics tab).
  const stats: { label: string; value: number; onClick: () => void }[] = [
    {
      label: t.sidebar.statsAgents,
      value: state.agentsCount,
      onClick: () => postMessage({ type: 'openBuilderTab', tab: 'agents' }),
    },
    {
      label: t.sidebar.statsSkills,
      value: state.skillsCount,
      onClick: () => postMessage({ type: 'openBuilderTab', tab: 'skills' }),
    },
    {
      label: t.sidebar.statsFlows,
      value: state.pipelinesCount,
      onClick: () => postMessage({ type: 'openBuilderTab', tab: 'workflows' }),
    },
    {
      label: t.sidebar.statsEpics,
      value: state.epicsCount,
      onClick: () => postMessage({ type: 'openEpicsList' }),
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {stats.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={s.onClick}
          title={`${t.sidebar.statsOpenPrefix}${s.label}`}
          className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-card/50 px-1 py-2 transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="font-mono text-base font-bold tabular-nums text-primary leading-none">
            {s.value}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {s.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function SectionHeader({
  label,
  collapsed,
  onToggle,
  trailing,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', collapsed && '-rotate-90')}
        />
        <span>{label}</span>
      </button>
      {trailing}
    </div>
  );
}

function RecentEpicsSection({
  epics,
  epicsCount,
  collapsed,
  onToggle,
}: {
  epics: RecentEpicRef[];
  epicsCount: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useI18n();
  return (
    <div>
      <SectionHeader
        label={t.sidebar.recentEpics}
        collapsed={collapsed}
        onToggle={onToggle}
        trailing={
          <button
            type="button"
            onClick={() => postMessage({ type: 'openEpicsList' })}
            className="text-[10px] text-muted-foreground hover:text-primary"
          >
            {t.sidebar.all} {epicsCount} →
          </button>
        }
      />
      {!collapsed && (
        <div className="mt-1.5 space-y-1">
          {epics.map((e) => (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => postMessage({ type: 'openEpicState', path: e.statePath })}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  postMessage({ type: 'openEpicState', path: e.statePath });
                }
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-[11px] transition-colors hover:bg-accent"
            >
              <EpicDot status={e.status} />
              <span className="font-mono text-[10px] font-bold text-primary truncate">{e.id}</span>
              {e.title && (
                <span className="truncate text-muted-foreground">· {e.title}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EpicDot({ status }: { status: string }) {
  const cls = (() => {
    switch (status) {
      case 'in_progress':
        return 'bg-warning shadow-[0_0_4px_var(--color-warning)]';
      case 'done':
        return 'bg-success';
      case 'failed':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground/40';
    }
  })();
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cls)} />;
}

function McpServersSection({
  servers,
  loading,
  error,
  collapsed,
  onToggle,
}: {
  servers: McpServerInfo[] | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useI18n();
  // Show counts in the header so users can glance the connected total
  // without expanding. servers === null means the list hasn't loaded yet.
  const total = servers?.length ?? 0;
  const connected = servers?.filter((s) => s.status === 'connected').length ?? 0;
  return (
    <div>
      <SectionHeader
        label={t.sidebar.mcpServers}
        collapsed={collapsed}
        onToggle={onToggle}
        trailing={
          <div className="flex items-center gap-1.5">
            {servers && (
              <span className="text-[10px] text-muted-foreground">
                {connected}/{total}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                postMessage({ type: 'refreshMcp' });
              }}
              title={t.sidebar.reRunMcpList}
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </button>
          </div>
        }
      />
      {!collapsed && (
        <div className="mt-1.5 space-y-1">
          {error && (
            <div className="rounded border-l-2 border-destructive bg-destructive/5 px-2 py-1.5 text-[10px] text-muted-foreground">
              {error}
            </div>
          )}
          {servers === null && !error && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t.sidebar.queryingMcp}</span>
            </div>
          )}
          {servers && servers.length === 0 && !error && (
            <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground">
              {t.sidebar.noMcpConfigured}
            </div>
          )}
          {servers?.map((s) => <McpRow key={s.name} server={s} />)}
        </div>
      )}
    </div>
  );
}

const MCP_DOT: Record<McpServerInfo['status'], string> = {
  connected: 'bg-success shadow-[0_0_4px_var(--color-success)]',
  needs_auth: 'bg-warning',
  failed: 'bg-destructive',
  unknown: 'bg-muted-foreground/40',
};

function McpRow({ server }: { server: McpServerInfo }) {
  const titleParts = [server.statusText];
  if (server.transport) { titleParts.push(server.transport); }
  if (server.endpoint) { titleParts.push(server.endpoint); }
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-[11px]"
      title={titleParts.join(' · ')}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', MCP_DOT[server.status])} />
      <Plug className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium text-foreground">{server.name}</span>
      <span className="ml-auto shrink-0 truncate text-[9px] uppercase tracking-wider text-muted-foreground">
        {server.status === 'needs_auth' ? 'auth' : server.status}
      </span>
    </div>
  );
}


function WorkflowsSection({
  builtins,
  project,
  configExists,
  workspaceName,
  autopilotEnabled,
  collapsed,
  onToggle,
}: {
  builtins: TemplateRef[];
  project: TemplateRef[];
  configExists: boolean;
  workspaceName: string;
  autopilotEnabled: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useI18n();
  const [saveOpen, setSaveOpen] = useState(false);
  const [pendingApply, setPendingApply] = useState<TemplateRef | null>(null);

  if (builtins.length === 0 && project.length === 0 && !configExists) { return null; }

  const onApplyClick = (template: TemplateRef) => {
    if (configExists) {
      setPendingApply(template);
    } else {
      postMessage({ type: 'applyTemplate', id: template.id, skipConfirm: true });
    }
  };

  return (
    <div>
      <SectionHeader label={t.sidebar.workflows} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && (
        <div className="mt-1.5 space-y-1.5">
          {configExists && (
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Diamond className="h-3 w-3" />
              <span>{t.sidebar.saveCurrentAsTemplate}</span>
            </button>
          )}
          {builtins.length > 0 && (
            <>
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t.sidebar.common}
              </div>
              {builtins.map((item) => (
                <TemplateRow key={item.id} template={item} builtin onApply={onApplyClick} />
              ))}
              <AutopilotRow enabled={autopilotEnabled} />
            </>
          )}
          {project.length > 0 && (
            <>
              <div className="mt-2 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t.sidebar.custom}
              </div>
              {project.map((item) => (
                <TemplateRow key={item.id} template={item} builtin={false} onApply={onApplyClick} />
              ))}
            </>
          )}
        </div>
      )}

      {saveOpen && (
        <SavePresetModal
          existingProjectIds={project.map((p) => p.id)}
          builtinIds={builtins.map((b) => b.id)}
          defaultId={workspaceName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')}
          defaultName={workspaceName}
          onSubmit={(draft) => postMessage({ type: 'savePresetInline', draft })}
          onClose={() => setSaveOpen(false)}
        />
      )}
      {pendingApply && (
        <ConfirmModal
          title="Apply template"
          danger
          confirmLabel="Overwrite & apply"
          message={
            <>
              This project already has <span className="font-mono">.aidlc/workspace.yaml</span>.
              Overwrite matching pipelines/agents from template{' '}
              <span className="font-mono">{pendingApply.id}</span>?
              {' '}(e.g. upgrade stale <span className="font-mono">project-context</span> steps.)
              Other custom pipelines are kept.
            </>
          }
          secondaryLabel={pendingApply.hasGuide ? 'View guide' : undefined}
          onSecondary={
            pendingApply.hasGuide
              ? () => postMessage({ type: 'openTemplateGuide', id: pendingApply.id })
              : undefined
          }
          onConfirm={() =>
            postMessage({ type: 'applyTemplate', id: pendingApply.id, skipConfirm: true })
          }
          onClose={() => setPendingApply(null)}
        />
      )}
    </div>
  );
}

// Lightweight hover tooltip. Native `title` tooltips are unreliable / slow in
// the VS Code webview, so we render our own: on hover we anchor a fixed-
// position card to the row's rect (fixed → escapes the sidebar's overflow
// clipping), clamped to the viewport.
function useTooltip() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const onMouseEnter = (e: ReactMouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(r.left, window.innerWidth - 312)),
      y: r.bottom + 6,
    });
  };
  const onMouseLeave = () => setPos(null);
  return { pos, onMouseEnter, onMouseLeave };
}

function Tooltip({ pos, text }: { pos: { x: number; y: number }; text: string }) {
  return (
    <div
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999, maxWidth: 300 }}
      className="pointer-events-none whitespace-pre-line rounded-md border border-border bg-card px-3 py-2 text-[11px] leading-relaxed text-foreground shadow-lg"
    >
      {text}
    </div>
  );
}

function TemplateRow({
  template,
  builtin,
  onApply,
}: {
  template: TemplateRef;
  builtin: boolean;
  onApply: (template: TemplateRef) => void;
}) {
  const t = useI18n();
  const Icon = builtin ? Sparkles : Diamond;
  const tip = useTooltip();
  const tipText = template.description
    ? `${template.name}\n\n${template.description}\n\n${t.sidebar.clickToApply}`
    : `${t.sidebar.applyTemplatePrefix}${template.id}`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onApply(template)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onApply(template);
        }
      }}
      onMouseEnter={tip.onMouseEnter}
      onMouseLeave={tip.onMouseLeave}
      className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-[11px] transition-colors hover:bg-accent"
    >
      <Icon className="h-3 w-3 shrink-0 text-primary opacity-80" />
      <span className="shrink-0 font-semibold text-primary truncate max-w-[40%]">
        {template.name}
      </span>
      <span className="truncate text-muted-foreground">· {template.description || template.id}</span>
      {tip.pos && <Tooltip pos={tip.pos} text={tipText} />}
    </div>
  );
}

// The Epic Autopilot entry in the Common workflows. It isn't a template you
// apply — it's a behavior gated by the `aidlc.autopilot.enabled` setting — so
// the row mirrors that setting: "Coming soon" (disabled look) when off, "On"
// (active look) when enabled. Clicking either state deep-links to the setting
// so the user can flip it. The shared concept blurb frames the feature.
function AutopilotRow({ enabled }: { enabled: boolean }) {
  const t = useI18n();
  const tip = useTooltip();
  const tipText = t.sidebar.autopilotConcept + (enabled ? t.sidebar.autopilotOnSuffix : t.sidebar.autopilotOffSuffix);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => postMessage({ type: 'openAutopilotSetting' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          postMessage({ type: 'openAutopilotSetting' });
        }
      }}
      onMouseEnter={tip.onMouseEnter}
      onMouseLeave={tip.onMouseLeave}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
        enabled
          ? 'border-border bg-card/50 hover:bg-accent'
          : 'border-dashed border-border bg-card/30 opacity-60 hover:opacity-100',
      )}
    >
      <Zap className={cn('h-3 w-3 shrink-0', enabled ? 'text-primary opacity-80' : 'text-muted-foreground')} />
      <span className={cn('shrink-0 truncate font-semibold max-w-[40%]', enabled ? 'text-primary' : 'text-muted-foreground')}>
        {t.sidebar.epicAutopilot}
      </span>
      <span className="truncate text-muted-foreground">· {t.sidebar.autopilotDesc}</span>
      <span
        className={cn(
          'ml-auto shrink-0 rounded-sm border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider',
          enabled
            ? 'border-primary/40 text-primary'
            : 'border-border text-muted-foreground',
        )}
      >
        {enabled ? t.sidebar.on : t.sidebar.comingSoon}
      </span>
      {tip.pos && <Tooltip pos={tip.pos} text={tipText} />}
    </div>
  );
}

function Footer({ hasFolder }: { hasFolder: boolean }) {
  const t = useI18n();
  const v = typeof window !== 'undefined' ? window.EXTENSION_VERSION : undefined;
  return (
    <div className="border-t border-sidebar-border px-3 py-2 text-center text-[10px] text-muted-foreground">
      {v && <span className="font-mono">v{v}</span>}
      {v && hasFolder && <span className="mx-1.5">·</span>}
      {hasFolder ? (
        <>
          <button
            type="button"
            onClick={() => postMessage({ type: 'openBuilder' })}
            className="hover:text-primary"
          >
            {t.sidebar.builder}
          </button>
          <span className="mx-1.5">·</span>
          <button
            type="button"
            onClick={() => postMessage({ type: 'refresh' })}
            className="hover:text-primary"
          >
            <RefreshCw className="inline h-2.5 w-2.5 align-text-bottom" /> {t.sidebar.refresh}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => postMessage({ type: 'openProject' })}
          className="hover:text-primary"
        >
          {t.sidebar.openProject}
        </button>
      )}
    </div>
  );
}

// Suppress unused-import warning when GitBranch / Zap are not directly used
// (they may be used by future stat icons; keeping references to avoid churn).
const _ICON_REFS = { GitBranch, Zap };
void _ICON_REFS;
