/* Status-aware preview for Discover steps 3, 4 and 6.
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

/** Prefer the shared parent folder when several files match; otherwise the first path. */
function revealTarget(files: string[]): string | undefined {
  if (files.length === 0) { return undefined; }
  if (files.length === 1) { return files[0]; }
  const parent = (p: string) => p.replace(/[/\\][^/\\]+$/, '');
  const dirs = files.map(parent).filter(Boolean);
  if (dirs.length > 0 && dirs.every((d) => d === dirs[0])) { return dirs[0]; }
  return files[0];
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

function Counts({ items, copy }: { items: DiscoverCoveredItem[]; copy: DiscoverCopy }) {
  const inCode = items.filter((i) => i.status === 'in-code').length;
  const missing = items.filter((i) => i.status === 'missing').length;
  const stale = items.filter((i) => i.status === 'stale').length;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[10.5px] text-muted-foreground">
      <span>{copy.status.counts(inCode, missing, stale)}</span>
      <Badge copy={copy} status="in-code" />
      <Badge copy={copy} status="missing" />
      <Badge copy={copy} status="stale" />
    </div>
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
      <div className="space-y-2 border-b border-border/70 bg-secondary/40 px-3 py-2">
        <input
          type="search"
          value={queryRaw}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.status.searchPlaceholder}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={filter === 'all'} label={`${copy.status.filterAll} · ${items.length}`} onClick={() => setFilter('all')} />
          <FilterChip active={filter === 'in-code'} label={`${copy.status.inCode} · ${inCode}`} tone="in-code" onClick={() => setFilter('in-code')} />
          <FilterChip active={filter === 'missing'} label={`${copy.status.missing} · ${missing}`} tone="missing" onClick={() => setFilter('missing')} />
          <FilterChip active={filter === 'stale'} label={`${copy.status.stale} · ${stale}`} tone="stale" onClick={() => setFilter('stale')} />
        </div>
        <p className="text-[10.5px] text-muted-foreground">{copy.status.matcherNote}</p>
      </div>
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
  const detailItems: DiscoverDetailTarget[] = [
    ...features.map((item) => ({ id: item.id, text: item.text, detail: item.detail })),
    ...(discover.itemCoverage?.items ?? []).filter((item) => item.kind === 'fr').map((item) => ({ id: item.id, text: item.text, detail: item.detail })),
  ];
  if (features.length === 0) { return <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.status.empty}</p>; }
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border/70 bg-secondary/40">
          <Counts items={features} copy={copy} />
        </div>
        <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{copy.status.tree}</p>
        <FeatureTree features={features} copy={copy} detailItems={detailItems} />
      </section>
      <section className="rounded-lg border border-border bg-card">
        <MermaidBlock
          source={featureTreeMermaid(features)}
          title={copy.status.diagram}
          embedded
          fullscreenLabel={copy.status.fullscreen}
          exitFullscreenLabel={copy.status.exitFullscreen}
        />
      </section>
    </div>
  );
}

function CompactRecordEntry({ record, copy }: { record: DiscoverRecord; copy: DiscoverCopy }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const title = record.title.trim() || copy.untitled;
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-b-0">
        <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium leading-snug text-foreground">
          {record.id} — {title}
        </p>
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
  if (stepId === 'plan') { return <CompactRecordsStatus doc={doc} copy={copy} sectionKey="phases" />; }
  return null;
}

export function stepHasStatusView(stepId: string): boolean {
  return stepId === 'requirements' || stepId === 'features' || stepId === 'usecases' || stepId === 'userflows' || stepId === 'plan';
}
