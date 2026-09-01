/* The document-centric half of the tab.
 *
 * Same data as Pipeline mode, organised by file instead of by step — for when
 * you are looking after the docs themselves (what exists, what is stale, what
 * links to what) rather than working through the pipeline.
 */

import { useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import type { DiscoverDoc, DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { allEntries, extractIds, issuesFor, shortTime } from './lib';
import { MarkdownLite } from './MarkdownLite';
import { RawMarkdownPane } from './RawMarkdownPane';

type Pane = 'read' | 'raw';

export function DocsMode({ discover, copy }: { discover: DiscoverSummary; copy: DiscoverCopy }) {
  const [selected, setSelected] = useState(discover.docs[0]?.path ?? '');
  const [pane, setPane] = useState<Pane>('read');
  const doc = discover.docs.find((d) => d.path === selected) ?? discover.docs[0];

  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: 'clamp(160px, 18vw, 230px) minmax(0,1fr) clamp(180px, 20vw, 250px)' }}>
      <Tree discover={discover} selected={selected} copy={copy} onSelect={setSelected} />

      <div className="flex min-h-0 flex-col overflow-y-auto px-4 py-3">
        {doc && (
          <>
            <header className="mb-2 flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-bold text-foreground">{doc.title}</h2>
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {discover.docsRoot}/{doc.path}
              </code>
            </header>
            <div className="mb-2 flex gap-1">
              <Tab on={pane === 'read'} onClick={() => setPane('read')}>{copy.viewPreview}</Tab>
              <Tab on={pane === 'raw'} onClick={() => setPane('raw')}>{copy.viewMarkdown}</Tab>
              <button
                type="button"
                onClick={() => postMessage({ type: 'openDiscoverDoc', docPath: doc.path })}
                className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="h-2.5 w-2.5" />{copy.openInEditor}
              </button>
            </div>
            {pane === 'read'
              ? <div className="rounded-md border border-border bg-card px-3 py-1"><MarkdownLite source={doc.raw} /></div>
              : <RawMarkdownPane doc={doc} revision={discover.revision} copy={copy} />}
          </>
        )}
      </div>

      {doc && <FileInfo discover={discover} doc={doc} copy={copy} />}
    </div>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[10.5px] transition ${
        on ? 'border-border bg-secondary font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function Tree({
  discover, selected, copy, onSelect,
}: { discover: DiscoverSummary; selected: string; copy: DiscoverCopy; onSelect: (path: string) => void }) {
  const folders = new Map<string, DiscoverDoc[]>();
  for (const doc of discover.docs) {
    const dir = doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : '';
    folders.set(dir, [...(folders.get(dir) ?? []), doc]);
  }
  const adrDir = Object.entries(discover.extraFiles).find(([, files]) => files.length > 0);

  return (
    <nav className="h-full overflow-y-auto border-r border-border px-2 py-3">
      <p className="px-1.5 pb-2 font-mono text-[9.5px] font-bold tracking-wide text-muted-foreground">
        {discover.docsRoot}/
      </p>
      {[...folders].map(([dir, docs]) => (
        <div key={dir} className="mb-2">
          <p className="px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{dir}/</p>
          {docs.map((doc) => {
            const stale = discover.issues.some((i) => i.code === 'stale-doc' && i.file === doc.path);
            return (
              <button
                key={doc.path}
                type="button"
                onClick={() => onSelect(doc.path)}
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition ${
                  selected === doc.path ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <span className="truncate">{doc.path.slice(dir.length + 1)}</span>
                <span className={`ml-auto shrink-0 text-[10px] ${stale ? 'text-warning' : doc.exists ? 'text-success' : 'text-muted-foreground/50'}`}>
                  {stale ? '⚠' : doc.exists ? '✓' : '○'}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      {adrDir && (
        <div className="mb-2">
          <p className="px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{adrDir[0]}/</p>
          {adrDir[1].map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => postMessage({ type: 'openDiscoverFile', relPath: `${adrDir[0]}/${file}` })}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <span className="truncate">{file}</span>
              <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">development/</p>
        {discover.devDocs.map((dev) => (
          <button
            key={dev.path}
            type="button"
            onClick={() => postMessage({ type: 'openDiscoverFile', relPath: dev.path })}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <span className="truncate">{dev.path.split('/').pop()}</span>
            <span className={`ml-auto shrink-0 text-[10px] ${dev.exists ? 'text-success' : 'text-muted-foreground/50'}`}>
              {dev.exists ? '✓' : '○'}
            </span>
          </button>
        ))}
        <p className="px-1.5 pt-1 text-[9.5px] text-muted-foreground/70">{copy.devDocs}</p>
      </div>
    </nav>
  );
}

function FileInfo({ discover, doc, copy }: { discover: DiscoverSummary; doc: DiscoverDoc; copy: DiscoverCopy }) {
  const step = discover.steps.find((s) => s.id === doc.step);
  const entries = allEntries(discover);
  const declared = doc.sections.flatMap((s) => [
    ...s.items.map((i) => ({ id: i.id, text: i.text })),
    ...s.records.map((r) => ({ id: r.id, text: r.title })),
  ]);
  const known = new Set(entries.map((e) => e.id));
  const issues = issuesFor(discover, doc.path);

  return (
    <aside className="h-full overflow-y-auto border-l border-border px-3 py-3">
      <p className="text-[9.5px] font-bold tracking-[0.09em] text-muted-foreground">{copy.fileInfo}</p>

      <section className="mt-2 rounded-lg border border-border bg-card p-2.5">
        <h4 className="truncate text-[11.5px] font-semibold text-foreground">{doc.path.split('/').pop()}</h4>
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          {copy.belongsTo}: {step?.order} · {step?.label}
        </p>
        <p className="text-[10.5px] text-muted-foreground">
          {doc.exists ? `${copy.lastEdited}: ${shortTime(doc.updatedAt) || '—'}${doc.lastRunId ? ` · ${doc.lastRunId}` : ''}` : copy.neverWritten}
        </p>
      </section>

      <section className="mt-2 rounded-lg border border-border bg-card p-2.5">
        <h4 className="text-[11px] font-semibold text-foreground">{copy.trace}</h4>
        {declared.length === 0 && <p className="mt-1 text-[10.5px] text-muted-foreground">{copy.noTrace}</p>}
        <ul className="mt-1 space-y-1">
          {declared.slice(0, 14).map((entry) => {
            const citedBy = entries.filter((e) => e.id !== entry.id && extractIds(e.text).includes(entry.id));
            const dangling = extractIds(entry.text).filter((ref) => ref !== entry.id && !known.has(ref));
            return (
              <li key={entry.id} className="text-[10.5px] leading-snug">
                <code className="rounded bg-secondary px-1 font-mono text-[9.5px] text-muted-foreground">{entry.id}</code>
                {citedBy.length > 0 && (
                  <span className="text-muted-foreground"> → {citedBy.slice(0, 3).map((c) => c.id).join(', ')}</span>
                )}
                {citedBy.length === 0 && dangling.length === 0 && (
                  <span className="text-muted-foreground/60"> · —</span>
                )}
                {dangling.length > 0 && (
                  <span className="text-warning"> · {copy.dangling}: {dangling.join(', ')}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {issues.length > 0 && (
        <section className="mt-2 rounded-lg border border-border bg-card p-2.5">
          <h4 className="text-[11px] font-semibold text-foreground">{copy.checks} · {issues.length}</h4>
          <ul className="mt-1 space-y-0.5">
            {issues.slice(0, 8).map((issue, idx) => (
              <li key={`${issue.code}-${idx}`} className={`text-[10.5px] ${issue.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => postMessage({ type: 'openDiscoverDoc', docPath: doc.path })}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <FileText className="h-3 w-3" /> {copy.openInEditor}
      </button>
    </aside>
  );
}
