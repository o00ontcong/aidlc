import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Cpu, RefreshCw, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderConfig, ProviderInfo } from '@/lib/types';
import {
  applyDefaultProvider,
  applyProvider,
  defaultProviderInfo,
  mapModelForProvider,
  MOCK_PROVIDER_CONFIG,
  providerStatusTone,
} from '@/lib/providers';
import { postMessage } from '@/lib/bridge';

const STATUS_DOT: Record<'ok' | 'warn' | 'err', string> = {
  ok: 'bg-success shadow-[0_0_4px_var(--color-success)]',
  warn: 'bg-warning',
  err: 'bg-destructive',
};

interface ProviderSectionProps {
  /** Host-supplied config; falls back to mock for harness / pre-host. */
  providerConfig?: ProviderConfig;
}

export function ProviderSection({ providerConfig }: ProviderSectionProps) {
  const seed = providerConfig ?? MOCK_PROVIDER_CONFIG;
  const [config, setConfig] = useState<ProviderConfig>(seed);
  const [expanded, setExpanded] = useState(false);
  const [mappingsOpen, setMappingsOpen] = useState(false);

  useEffect(() => {
    setConfig(providerConfig ?? MOCK_PROVIDER_CONFIG);
  }, [providerConfig]);

  const active = useMemo(() => defaultProviderInfo(config), [config]);
  const activeTone = providerStatusTone(active.diagnostic);

  const patch = useCallback((next: ProviderConfig) => {
    setConfig(next);
  }, []);

  const onSetDefault = (providerId: string) => {
    const next = applyDefaultProvider(config, providerId);
    patch(next);
    postMessage({ type: 'setDefaultProvider', providerId });
  };

  const onApply = (providerId: string) => {
    const next = applyProvider(config, providerId);
    if (next === config) { return; }
    patch(next);
    postMessage({ type: 'applyProvider', providerId });
  };

  const onSetDefaultModel = (providerId: string, model: string) => {
    const trimmed = model.trim();
    if (!trimmed) { return; }
    patch({
      ...config,
      providers: config.providers.map((provider) => (
        provider.id === providerId ? { ...provider, model: trimmed } : provider
      )),
    });
    postMessage({ type: 'setProviderDefaultModel', providerId, model: trimmed });
  };

  const mappingRows = useMemo(() => {
    const mappings = config.modelMappings ?? {};
    const providerId = config.defaultProvider;
    return Object.entries(mappings).map(([canonical, byProvider]) => ({
      canonical,
      mapped: byProvider[providerId] ?? canonical,
    }));
  }, [config.defaultProvider, config.modelMappings]);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        title={expanded ? 'Thu gọn danh sách provider' : 'Mở rộng danh sách provider'}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0">Agent Provider</span>
        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
          {active.displayName}
        </span>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[activeTone])} />
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
          {expanded ? 'Thu gọn' : 'Mở rộng'}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
      </button>

      {!expanded && (
        <p className="px-1 text-[10px] text-muted-foreground">
          {active.cli} · {active.diagnostic.message}
        </p>
      )}

      {expanded && (
        <div className="space-y-1 rounded-md border border-border bg-card/40 p-2">
          {config.providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              onSetDefault={() => onSetDefault(p.id)}
              onApply={() => onApply(p.id)}
              onSetDefaultModel={(model) => onSetDefaultModel(p.id, model)}
              onRefreshModels={() => postMessage({ type: 'refreshProviderModels', providerId: p.id })}
            />
          ))}

          <div className="flex gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => postMessage({ type: 'openAgentTerminal' })}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card/50 px-2 py-1.5 text-[10px] font-medium text-foreground hover:bg-accent"
            >
              <Terminal className="h-3 w-3" />
              Open terminal
            </button>
            <button
              type="button"
              title="Refresh CLI diagnostics"
              onClick={() => postMessage({ type: 'refreshProviderDiagnostics' })}
              className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMappingsOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', !mappingsOpen && '-rotate-90')} />
            Model mappings
          </button>

          {mappingsOpen && (
            <div className="max-h-32 overflow-y-auto rounded border border-border/60 bg-surface/80 text-[10px]">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 border-b border-border/60 px-2 py-1 font-semibold uppercase tracking-wider text-muted-foreground">
                <span>canonical</span>
                <span>→</span>
                <span>{active.displayName}</span>
              </div>
              {mappingRows.map(({ canonical, mapped }) => (
                <div
                  key={canonical}
                  className="grid grid-cols-[1fr_auto_1fr] gap-x-2 border-b border-border/40 px-2 py-1 last:border-0"
                >
                  <span className="truncate font-mono text-muted-foreground">{canonical}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="truncate font-mono text-foreground">{mapped}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderRow({
  provider,
  onSetDefault,
  onApply,
  onSetDefaultModel,
  onRefreshModels,
}: {
  provider: ProviderInfo;
  onSetDefault: () => void;
  onApply: () => void;
  onSetDefaultModel: (model: string) => void;
  onRefreshModels: () => void;
}) {
  const tone = providerStatusTone(provider.diagnostic);
  const applied = provider.enabled;
  const [model, setModel] = useState(provider.model ?? '');

  useEffect(() => { setModel(provider.model ?? ''); }, [provider.model]);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]',
        provider.isDefault ? 'border-primary/40 bg-primary/5' : 'border-border bg-card/50',
        !applied && 'opacity-80',
      )}
    >
      <button
        type="button"
        title={applied ? 'Default provider' : 'Set as default (Apply to sync commands)'}
        onClick={onSetDefault}
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px]',
          provider.isDefault
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-transparent hover:border-primary/50',
        )}
      >
        ✓
      </button>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onSetDefault}
        title="Set as default provider"
      >
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[tone])} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-foreground">{provider.displayName}</div>
          <div className="truncate text-[9px] text-muted-foreground">
            {provider.cli} · {provider.diagnostic.message}
          </div>
        </div>
      </button>
      {applied ? (
        <span
          className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary"
          title="Commands synced for this provider — cannot be undone"
        >
          Applied
        </span>
      ) : (
        <button
          type="button"
          onClick={onApply}
          title="Sync slash commands for this provider (one-time)"
          className="shrink-0 rounded border border-border bg-card px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground hover:border-primary/50 hover:text-primary"
        >
          Apply
        </button>
      )}
      <label className="flex min-w-0 basis-full items-center gap-1.5 pl-6 text-[9px] text-muted-foreground">
        <span className="shrink-0">Default model</span>
        <select
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
            onSetDefaultModel(event.target.value);
          }}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[9px] text-foreground outline-none focus:border-primary"
          aria-label={`${provider.displayName} default model`}
        >
          {[...new Set([model, ...(provider.models ?? [])].filter(Boolean))].map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <button
          type="button"
          title="Refresh provider models"
          onClick={onRefreshModels}
          className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border hover:border-primary/50 hover:text-primary"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </label>
    </div>
  );
}

/** Preview helper for harness — map a canonical model using current default. */
export function previewMappedModel(canonical: string, config: ProviderConfig): string {
  return mapModelForProvider(
    canonical,
    config.defaultProvider,
    config.modelMappings,
  );
}
