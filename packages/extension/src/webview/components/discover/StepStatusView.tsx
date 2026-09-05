/* Status-aware preview for Discover steps 3 (requirements), 4 (features),
 * 6 (user flows / screens via coverage), and 11 (plan phases).
 * Same lens as the wireframe: one “already-has-code” reading; a new project
 * is just every item sitting in “not built”.
 */

import { useMemo, useRef, useState } from 'react';
import type {
  DiscoverCoveredItem,
  DiscoverDoc,
  DiscoverItemCoverageStatus,
  DiscoverRecord,
  DiscoverSummary,
} from '@/lib/types';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { postMessage } from '@/lib/bridge';
import { MermaidBlock } from './MarkdownLite';
import { DiscoverItemDetailDialog, type DiscoverDetailTarget } from './DiscoverItemDetailDialog';
import { DiscoverRecordDetailDialog } from './DiscoverRecordDetailDialog';

type StatusFilter = 'all' | DiscoverItemCoverageStatus;

const BADGE: Record<DiscoverItemCoverageStatus | 'mix', string> = {
  'in-code': 'border-success/40 bg-success/10 text-success',
  missing: 'border-warning/50 bg-warning/10 text-warning',
  stale: 'border-destructive/40 bg-destructive/10 text-destructive',
  mix: 'border-border bg-secondary/60 text-muted-foreground',
};

const MERMAID_CLASS = [
  'classDef inCode fill:#ecfdf5,stroke:#059669,color:#065f46',
  'classDef missing fill:#fffbeb,stroke:#d97706,color:#92400e',
  'classDef stale fill:#fef2f2,stroke:#dc2626,color:#991b1b',
  'classDef mix fill:#f8fafc,stroke:#64748b,color:#334155',
].join('\n');

function mermaidClass(status: DiscoverItemCoverageStatus | 'mix'): string {
  if (status === 'in-code') { return 'inCode'; }
  if (status === 'stale') { return 'stale'; }
  if (status === 'mix') { return 'mix'; }
  return 'missing';
}

function statusLabel(copy: DiscoverCopy, status: DiscoverItemCoverageStatus | 'mix'): string {
  if (status === 'in-code') { return copy.status.inCode; }
  if (status === 'stale') { return copy.status.stale; }
  if (status === 'mix') { return copy.status.mix; }
  return copy.status.missing;
}

function revealItemSource(item: DiscoverCoveredItem): void {
  const target = revealTarget(item.matchedFiles);
  if (!target) { return; }
  postMessage({ type: 'revealDiscoverSource', path: target });
}

/** Prefer the shared feature folder; never the repo root or a walk-order first file. */
function asDir(path: string): string {
  const n = path.replace(/\\/g, '/').replace(/\/$/, '');
  if (/\.(ts|tsx|js|jsx|swift|kt|java|go|rs|py|rb|cs|php|dart|m|mm|c|cc|cpp|h|vue|svelte)$/i.test(n)) {
    return n.replace(/\/[^/]+$/, '');
  }
  return n;
}

function revealTarget(files: string[]): string | undefined {
  const uniq = [...new Set(files.map((f) => f.replace(/\\/g, '/')))].filter(Boolean);
  if (uniq.length === 0) { return undefined; }
  if (uniq.length === 1) { return uniq[0]; }
  const parts = uniq.map((f) => asDir(f).split('/').filter(Boolean));
  const minLen = Math.min(...parts.map((p) => p.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const seg = parts[0]![i];
    if (seg && parts.every((p) => p[i] === seg)) { common.push(seg); }
    else { break; }
  }
  if (common.length >= 2) { return common.join('/'); }
  return uniq[0];
}

function matchesQuery(item: { id: string; text: string; description?: string; coveringFeatureIds?: string[]; coveredFrIds?: string[]; matchedFiles?: string[] }, query: string): boolean {
  if (!query) { return true; }
  const hay = [
    item.id,
    item.text,
    item.description ?? '',
    ...(item.coveringFeatureIds ?? []),
    ...(item.coveredFrIds ?? []),
    ...(item.matchedFiles ?? []),
  ].join(' ').toLowerCase();
  return hay.includes(query);
}

function matchesRecordQuery(record: DiscoverRecord, query: string): boolean {
  if (!query) { return true; }
  const hay = [
    record.id,
    record.title,
    ...record.fields.flatMap((field) => [field.label, field.value, ...field.items]),
  ].join(' ').toLowerCase();
  return hay.includes(query);
}

/** Ids like F-VIDEO-01 / FR-01 mentioned in free text — same shape as core extractIds. */
function extractIds(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,})\b/g)) {
    out.add(match[1]!);
  }
  return [...out];
}

function recordHaystack(record: DiscoverRecord): string {
  return [record.id, record.title, ...record.fields.flatMap((f) => [f.value, ...f.items])].join('\n');
}

function statusFromCitedFeatures(
  citedFeatureIds: string[],
  featuresById: Map<string, DiscoverCoveredItem>,
): DiscoverItemCoverageStatus {
  const covering = citedFeatureIds
    .map((id) => featuresById.get(id))
    .filter((item): item is DiscoverCoveredItem => Boolean(item));
  if (covering.length === 0) { return 'missing'; }
  if (covering.every((f) => f.status === 'in-code')) { return 'in-code'; }
  if (covering.some((f) => f.status === 'stale')) { return 'stale'; }
  return 'missing';
}

function coverageCounts(items: { status: DiscoverItemCoverageStatus }[]): { inCode: number; missing: number; stale: number } {
  return {
    inCode: items.filter((i) => i.status === 'in-code').length,
    missing: items.filter((i) => i.status === 'missing').length,
    stale: items.filter((i) => i.status === 'stale').length,
  };
}

function CoverageFilterBar({
  copy,
  queryRaw,
  onQuery,
  filter,
  onFilter,
  total,
  inCode,
  missing,
  stale,
}: {
  copy: DiscoverCopy;
  queryRaw: string;
  onQuery: (value: string) => void;
  filter: StatusFilter;
  onFilter: (value: StatusFilter) => void;
  total: number;
  inCode: number;
  missing: number;
  stale: number;
}) {
  return (
    <div className="space-y-2 border-b border-border/70 bg-secondary/40 px-3 py-2">
      <input
        type="search"
        value={queryRaw}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={copy.status.searchPlaceholder}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={filter === 'all'} label={`${copy.status.filterAll} · ${total}`} onClick={() => onFilter('all')} />
        <FilterChip active={filter === 'in-code'} label={`${copy.status.inCode} · ${inCode}`} tone="in-code" onClick={() => onFilter('in-code')} />
        <FilterChip active={filter === 'missing'} label={`${copy.status.missing} · ${missing}`} tone="missing" onClick={() => onFilter('missing')} />
        <FilterChip active={filter === 'stale'} label={`${copy.status.stale} · ${stale}`} tone="stale" onClick={() => onFilter('stale')} />
      </div>
      <p className="text-[10.5px] text-muted-foreground">{copy.status.matcherNote}</p>
    </div>
  );
}

function Badge({
  copy, status, onClick, title,
}: {
  copy: DiscoverCopy;
  status: DiscoverItemCoverageStatus | 'mix';
  onClick?: () => void;
  title?: string;
}) {
  const className = `shrink-0 rounded-full border px-1.5 py-px text-[9.5px] font-semibold ${BADGE[status]}`;
  if (onClick) {
    return (
      <button type="button" title={title} onClick={onClick} className={`${className} cursor-pointer hover:underline`}>
        {statusLabel(copy, status)}
      </button>
    );
  }
  return <span className={className}>{statusLabel(copy, status)}</span>;
}

function rollup(statuses: DiscoverItemCoverageStatus[]): DiscoverItemCoverageStatus | 'mix' {
  if (statuses.length === 0) { return 'missing'; }
  if (statuses.every((s) => s === statuses[0])) { return statuses[0]!; }
  return 'mix';
}

function titleCase(group: string): string {
  if (!group) { return 'Other'; }
  return group.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function nodeId(text: string): string {
  const id = text.replace(/[^A-Za-z0-9]+/g, '');
  return id.length > 0 ? id : 'Node';
}

function unwrapMermaid(prose: string): string {
  const fence = /```mermaid\s*([\s\S]*?)```/i.exec(prose);
  return (fence?.[1] ?? prose).trim();
}

function featureTreeMermaid(features: DiscoverCoveredItem[]): string {
  const groups = groupFeatures(features);
  const lines = ['flowchart TB', '  App[App]'];
  const classLines: string[] = [];
  const appStatus = rollup(features.map((f) => f.status));
  classLines.push(`  class App ${mermaidClass(appStatus)}`);
  for (const group of groups) {
    const gid = nodeId(group.name);
    lines.push(`  ${gid}[${group.name}]`);
    lines.push(`  App --> ${gid}`);
    classLines.push(`  class ${gid} ${mermaidClass(group.status)}`);
    for (const item of group.items) {
      const fid = nodeId(item.id);
      const label = `${item.id}\\n${item.text.replace(/["[\](){}]/g, "'").slice(0, 42)}`;
      lines.push(`  ${fid}["${label}"]`);
      lines.push(`  ${gid} --> ${fid}`);
      classLines.push(`  class ${fid} ${mermaidClass(item.status)}`);
    }
  }
  return `${lines.join('\n')}\n${MERMAID_CLASS}\n${classLines.join('\n')}`;
}

function groupFeatures(features: DiscoverCoveredItem[]): { name: string; status: DiscoverItemCoverageStatus | 'mix'; items: DiscoverCoveredItem[] }[] {
  const order: string[] = [];
  const by = new Map<string, DiscoverCoveredItem[]>();
  for (const item of features) {
    const key = item.group || 'OTHER';
    if (!by.has(key)) {
      order.push(key);
      by.set(key, []);
    }
    by.get(key)!.push(item);
  }
  return order.map((key) => {
    const items = by.get(key)!;
    return { name: titleCase(key), status: rollup(items.map((i) => i.status)), items };
  });
}

function RowMeta({ item, copy }: { item: DiscoverCoveredItem; copy: DiscoverCopy }) {
  return (
    <>
      {item.coveringFeatureIds.length > 0 && (
        <p className="font-mono text-[10px] text-muted-foreground">{copy.status.covers(item.coveringFeatureIds.join(', '))}</p>
      )}
      {item.coveredFrIds.length > 0 && (
        <p className="font-mono text-[10px] text-muted-foreground">{copy.status.covers(item.coveredFrIds.join(', '))}</p>
      )}
      {item.matchedFiles.length > 0 && (
        <p className="truncate font-mono text-[10px] text-muted-foreground/80">{item.matchedFiles.slice(0, 3).join(' · ')}</p>
      )}
    </>
  );
}

function CompactEntry({
  id,
  title,
  copy,
  badge,
  children,
  detail,
  detailItems = [],
}: {
  id: string;
  title: string;
  copy: DiscoverCopy;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  detail?: DiscoverCoveredItem['detail'];
  detailItems?: DiscoverDetailTarget[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const heading = title.trim() || copy.untitled;
  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-border/30 px-3 py-1.5 last:border-b-0">
        <code className="shrink-0 rounded border border-border bg-background px-1.5 font-mono text-[9.5px] text-muted-foreground">{id}</code>
        {badge}
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setOpen(true)}
          title={copy.hints.openDetails}
          aria-haspopup="dialog"
          className="min-w-0 flex-1 truncate text-left text-[11.5px] leading-none text-foreground"
        >
          {heading}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={copy.hints.openDetails}
          aria-haspopup="dialog"
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copy.details}
        </button>
      </div>
      {open && (
        <DiscoverItemDetailDialog
          item={{ id, text: heading, detail }}
          items={detailItems}
          onClose={() => setOpen(false)}
          returnFocus={triggerRef.current}
        />
      )}
    </>
  );
}

function ItemRow({ item, copy, detailItems }: { item: DiscoverCoveredItem; copy: DiscoverCopy; detailItems: DiscoverDetailTarget[] }) {
  const canReveal = item.status === 'in-code' && item.matchedFiles.length > 0;
  return (
    <CompactEntry
      id={item.id}
      title={item.text}
      copy={copy}
      badge={(
        <Badge
          copy={copy}
          status={item.status}
          onClick={canReveal ? () => revealItemSource(item) : undefined}
          title={canReveal ? copy.hints.revealSource : undefined}
        />
      )}
      detail={item.detail}
      detailItems={detailItems}
    >
      {item.description?.trim() && (
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">{item.description}</p>
      )}
      <RowMeta item={item} copy={copy} />
    </CompactEntry>
  );
}

function FilterChip({
  active, label, onClick, tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: DiscoverItemCoverageStatus;
}) {
  const toneClass = tone ? BADGE[tone] : 'border-border bg-secondary/50 text-muted-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClass} ${active ? 'ring-1 ring-foreground/30' : 'opacity-70 hover:opacity-100'}`}
    >
      {label}
    </button>
  );
}

function RequirementsStatus({ discover, copy }: { discover: DiscoverSummary; copy: DiscoverCopy }) {
  const items = (discover.itemCoverage?.items ?? []).filter((i) => i.kind === 'fr');
  const nfr = discover.docs
    .find((d) => d.step === 'requirements')
    ?.sections.find((s) => s.key === 'nonFunctional')
    ?.items ?? [];
  const [queryRaw, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const query = queryRaw.trim().toLowerCase();

  const filteredFr = useMemo(
    () => items.filter((item) => (filter === 'all' || item.status === filter) && matchesQuery(item, query)),
    [items, filter, query],
  );
  const filteredNfr = useMemo(
    () => (filter === 'all' ? nfr.filter((item) => matchesQuery(item, query)) : []),
    [nfr, filter, query],
  );
  const detailItems: DiscoverDetailTarget[] = [
    ...items.map((item) => ({ id: item.id, text: item.text, detail: item.detail })),
    ...nfr.map((item) => ({ id: item.id, text: item.text, detail: item.detail })),
  ];

  if (items.length === 0) { return <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>; }

  const clusters: { status: DiscoverItemCoverageStatus; label: string }[] = [
    { status: 'in-code', label: copy.status.inCode },
    { status: 'missing', label: copy.status.missing },
    { status: 'stale', label: copy.status.stale },
  ];
  const inCode = items.filter((i) => i.status === 'in-code').length;
  const missing = items.filter((i) => i.status === 'missing').length;
  const stale = items.filter((i) => i.status === 'stale').length;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <CoverageFilterBar
        copy={copy}
        queryRaw={queryRaw}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        total={items.length}
        inCode={inCode}
        missing={missing}
        stale={stale}
      />
      {filteredFr.length === 0 && filteredNfr.length === 0 && (
        <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>
      )}
      {clusters.map((cluster) => {
        const rows = filteredFr.filter((i) => i.status === cluster.status);
        if (rows.length === 0) { return null; }
        return (
          <div key={cluster.status}>
            <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{cluster.label} · {rows.length}</p>
            {rows.map((item) => <ItemRow key={item.id} item={item} copy={copy} detailItems={detailItems} />)}
          </div>
        );
      })}
      {filteredNfr.length > 0 && (
        <div className="border-t border-border/60">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{copy.status.nfr}</p>
          {filteredNfr.map((item) => (
            <CompactEntry key={item.id} id={item.id} title={item.text} copy={copy} detail={item.detail} detailItems={detailItems}>
              {item.description?.trim() && (
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">{item.description}</p>
              )}
            </CompactEntry>
          ))}
        </div>
      )}
    </section>
  );
}

function FeatureTree({ features, copy, detailItems }: { features: DiscoverCoveredItem[]; copy: DiscoverCopy; detailItems: DiscoverDetailTarget[] }) {
  const groups = groupFeatures(features);
  return (
    <ul className="space-y-1 px-2 py-2">
      {groups.map((group) => (
        <li key={group.name}>
          <div className="mb-1 flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-2 py-1">
            <span className="text-[11.5px] font-semibold text-foreground">{group.name}</span>
            <Badge copy={copy} status={group.status} />
          </div>
          <ul className="ml-3 border-l border-border">
            {group.items.map((item) => (
              <li key={item.id}>
                <ItemRow item={item} copy={copy} detailItems={detailItems} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function FeaturesStatus({ discover, copy }: { discover: DiscoverSummary; copy: DiscoverCopy }) {
  const features = (discover.itemCoverage?.items ?? []).filter((i) => i.kind === 'feature');
  const [queryRaw, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const query = queryRaw.trim().toLowerCase();
  const filtered = useMemo(
    () => features.filter((item) => (filter === 'all' || item.status === filter) && matchesQuery(item, query)),
    [features, filter, query],
  );
  const detailItems: DiscoverDetailTarget[] = [
    ...features.map((item) => ({ id: item.id, text: item.text, detail: item.detail })),
    ...(discover.itemCoverage?.items ?? []).filter((item) => item.kind === 'fr').map((item) => ({ id: item.id, text: item.text, detail: item.detail })),
  ];
  if (features.length === 0) { return <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>; }
  const { inCode, missing, stale } = coverageCounts(features);
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <CoverageFilterBar
          copy={copy}
          queryRaw={queryRaw}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          total={features.length}
          inCode={inCode}
          missing={missing}
          stale={stale}
        />
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>
        ) : (
          <>
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{copy.status.tree}</p>
            <FeatureTree features={filtered} copy={copy} detailItems={detailItems} />
          </>
        )}
      </section>
      {filtered.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <MermaidBlock
            source={featureTreeMermaid(filtered)}
            title={copy.status.diagram}
            embedded
            fullscreenLabel={copy.status.fullscreen}
            exitFullscreenLabel={copy.status.exitFullscreen}
          />
        </section>
      )}
    </div>
  );
}

function CompactRecordEntry({
  record, copy, status, revealFiles,
}: {
  record: DiscoverRecord;
  copy: DiscoverCopy;
  status?: DiscoverItemCoverageStatus;
  revealFiles?: string[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const title = record.title.trim() || copy.untitled;
  const canReveal = status === 'in-code' && (revealFiles?.length ?? 0) > 0;
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-b-0">
        <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium leading-snug text-foreground">
          {record.id} — {title}
        </p>
        {status && (
          <Badge
            copy={copy}
            status={status}
            onClick={canReveal ? () => {
              const target = revealTarget(revealFiles ?? []);
              if (target) { postMessage({ type: 'revealDiscoverSource', path: target }); }
            } : undefined}
            title={canReveal ? copy.hints.revealSource : undefined}
          />
        )}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          title={copy.hints.openDetails}
          aria-haspopup="dialog"
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copy.details}
        </button>
      </div>
      {open && (
        <DiscoverRecordDetailDialog
          record={record}
          onClose={() => setOpen(false)}
          returnFocus={triggerRef.current}
        />
      )}
    </>
  );
}

function CompactRecordsStatus({ doc, copy, sectionKey }: { doc?: DiscoverDoc; copy: DiscoverCopy; sectionKey: string }) {
  const records = doc?.sections.find((section) => section.key === sectionKey)?.records ?? [];
  if (records.length === 0) {
    return <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>;
  }
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {records.map((record) => <CompactRecordEntry key={record.id} record={record} copy={copy} />)}
    </section>
  );
}

/** Ids like F-VIDEO-01 mentioned in free text — not FR-01 / PH-11. */
function isFeatureId(id: string): boolean {
  return /^F-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2,}$/.test(id);
}

function planRecordStatus(
  record: DiscoverRecord,
  phase: DiscoverSummary['phases'][number] | undefined,
  featuresById: Map<string, DiscoverCoveredItem>,
): DiscoverItemCoverageStatus {
  if (phase?.alreadyBuilt) { return 'in-code'; }
  const cited = extractIds(recordHaystack(record)).filter(isFeatureId);
  const fromFeatures = statusFromCitedFeatures(cited, featuresById);
  if (fromFeatures !== 'missing') { return fromFeatures; }
  if ((phase?.builtFiles?.length ?? 0) > 0 && (phase?.missingFeatureIds?.length ?? 0) > 0) {
    return 'stale';
  }
  return 'missing';
}

function PlanStatus({
  discover, doc, copy,
}: {
  discover: DiscoverSummary;
  doc?: DiscoverDoc;
  copy: DiscoverCopy;
}) {
  const records = doc?.sections.find((section) => section.key === 'phases')?.records ?? [];
  const phasesById = useMemo(() => {
    const map = new Map<string, DiscoverSummary['phases'][number]>();
    for (const phase of discover.phases ?? []) { map.set(phase.id, phase); }
    return map;
  }, [discover.phases]);
  const featuresById = useMemo(() => {
    const map = new Map<string, DiscoverCoveredItem>();
    for (const item of discover.itemCoverage?.items ?? []) {
      if (item.kind === 'feature') { map.set(item.id, item); }
    }
    return map;
  }, [discover.itemCoverage?.items]);
  const rows = useMemo(
    () => records.map((record) => {
      const phase = phasesById.get(record.id);
      return {
        record,
        status: planRecordStatus(record, phase, featuresById),
        matchedFiles: phase?.builtFiles ?? [],
      };
    }),
    [records, phasesById, featuresById],
  );
  const [queryRaw, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const query = queryRaw.trim().toLowerCase();
  const filtered = useMemo(
    () => rows.filter(({ record, status }) => (filter === 'all' || status === filter) && matchesRecordQuery(record, query)),
    [rows, filter, query],
  );

  if (records.length === 0) {
    return <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>;
  }

  const { inCode, missing, stale } = coverageCounts(rows);
  const clusters: { status: DiscoverItemCoverageStatus; label: string }[] = [
    { status: 'in-code', label: copy.status.inCode },
    { status: 'missing', label: copy.status.missing },
    { status: 'stale', label: copy.status.stale },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <CoverageFilterBar
        copy={copy}
        queryRaw={queryRaw}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        total={rows.length}
        inCode={inCode}
        missing={missing}
        stale={stale}
      />
      {filtered.length === 0 ? (
        <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>
      ) : (
        clusters.map((cluster) => {
          const clusterRows = filtered.filter((row) => row.status === cluster.status);
          if (clusterRows.length === 0) { return null; }
          return (
            <div key={cluster.status}>
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {cluster.label} · {clusterRows.length}
              </p>
              {clusterRows.map(({ record, status, matchedFiles }) => (
                <CompactRecordEntry key={record.id} record={record} copy={copy} status={status} revealFiles={matchedFiles} />
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}

function ScreenFlowStatus({ copy, doc }: { copy: DiscoverCopy; doc?: DiscoverDoc }) {
  const prose = unwrapMermaid(doc?.sections.find((s) => s.key === 'screenFlow')?.prose ?? '');
  const graph = /flowchart/i.test(prose) ? prose : '';
  if (!graph) {
    return <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>;
  }
  return (
    <section className="rounded-lg border border-border bg-card">
      <MermaidBlock
        source={graph}
        title={copy.status.screenFlow}
        embedded
        fullscreenLabel={copy.status.fullscreen}
        exitFullscreenLabel={copy.status.exitFullscreen}
      />
    </section>
  );
}

export function StepStatusView({
  discover, stepId, copy, doc,
}: {
  discover: DiscoverSummary;
  stepId: string;
  copy: DiscoverCopy;
  doc?: DiscoverDoc;
}) {
  if (stepId === 'requirements') { return <RequirementsStatus discover={discover} copy={copy} />; }
  if (stepId === 'features') { return <FeaturesStatus discover={discover} copy={copy} />; }
  if (stepId === 'usecases') { return <CompactRecordsStatus doc={doc} copy={copy} sectionKey="useCases" />; }
  if (stepId === 'userflows') { return <ScreenFlowStatus copy={copy} doc={doc} />; }
  if (stepId === 'plan') { return <PlanStatus discover={discover} doc={doc} copy={copy} />; }
  return null;
}

export function stepHasStatusView(stepId: string): boolean {
  return stepId === 'requirements' || stepId === 'features' || stepId === 'usecases' || stepId === 'userflows' || stepId === 'plan';
}
