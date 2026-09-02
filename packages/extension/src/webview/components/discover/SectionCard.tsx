/* One `##` section of a Discover document, rendered as an editable card.
 *
 * Every edit here is a structured op sent to the host, never a rewrite of the
 * file: that is what keeps a person's edits and an agent's edits from
 * clobbering each other in the same Markdown file.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Flag, Pin, Plus, Trash2, X } from 'lucide-react';
import type { DiscoverItem, DiscoverRecord, DiscoverSection } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { groupsInSection } from './lib';

interface SectionProps {
  docPath: string;
  revision: number;
  section: DiscoverSection;
  copy: DiscoverCopy;
  readOnly?: boolean;
  /** Ids the reviewer should look at — rendered as a marker on the row. */
  flaggedIds?: Set<string>;
}

const send = (message: Record<string, unknown>) => postMessage(message);

export function SectionCard(props: SectionProps) {
  const { section, copy } = props;
  const count = section.kind === 'records' ? section.records.length : section.items.length;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/70 bg-secondary/40 px-3 py-1.5">
        <h3 className="text-[11.5px] font-semibold text-foreground">{section.heading}</h3>
        {(section.kind === 'items' || section.kind === 'records') && (
          <span className="text-[10.5px] text-muted-foreground">· {count} {copy.entries}</span>
        )}
        {section.kind === 'unknown' && (
          <span className="rounded border border-border px-1.5 text-[9.5px] text-muted-foreground">{copy.yourSection}</span>
        )}
        {section.stray > 0 && (
          <span className="ml-auto text-[10px] text-warning">{copy.strayLines(section.stray)}</span>
        )}
      </header>

      {section.kind === 'items' && <ItemList {...props} />}
      {section.kind === 'records' && <RecordList {...props} />}
      {(section.kind === 'prose' || section.kind === 'unknown') && <ProseBody {...props} />}
    </section>
  );
}

// ── items ──────────────────────────────────────────────────────────────────

function ItemList({ docPath, revision, section, copy, readOnly, flaggedIds }: SectionProps) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      {section.items.length === 0 && !adding && (
        <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{section.hint ?? copy.emptySection}</p>
      )}
      {section.items.map((item) => (
        <ItemRow
          key={item.id}
          docPath={docPath}
          revision={revision}
          item={item}
          copy={copy}
          readOnly={readOnly}
          flagged={item.flagged || flaggedIds?.has(item.id) === true}
        />
      ))}
      {!readOnly && (adding
        ? <AddItemRow docPath={docPath} revision={revision} section={section} copy={copy} onDone={() => setAdding(false)} />
        : (
          <button type="button" title={copy.hints.addEntry} onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground">
            <Plus className="h-3 w-3" /> {copy.addEntry}
          </button>
        ))}
    </div>
  );
}

function ItemRow({
  docPath, revision, item, copy, readOnly, flagged,
}: { docPath: string; revision: number; item: DiscoverItem; copy: DiscoverCopy; readOnly?: boolean; flagged: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setDraft(item.text); }, [item.text]);

  const save = () => {
    const text = draft.trim();
    setEditing(false);
    if (!text || text === item.text) { setDraft(item.text); return; }
    send({ type: 'applyDiscoverOps', docPath, revision, ops: [{ op: 'updateItem', id: item.id, text }] });
  };

  return (
    <div className="group flex items-start gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0">
      <code className="mt-px shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px] text-muted-foreground" title={item.id}>
        {item.id}
      </code>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          title={copy.hints.itemInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { save(); }
            if (e.key === 'Escape') { setDraft(item.text); setEditing(false); }
          }}
          className="min-w-0 flex-1 rounded border border-primary/50 bg-background px-1.5 py-0.5 text-[11.5px] text-foreground"
        />
      ) : (
        <button
          type="button"
          disabled={readOnly || item.pinned}
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 text-left text-[11.5px] leading-snug text-foreground disabled:cursor-default"
          title={item.pinned ? copy.pinnedHint : copy.editHint}
        >
          {item.text}
        </button>
      )}

      <span className="flex shrink-0 items-center gap-1">
        <Badge origin={item.origin} copy={copy} />
        {flagged && <Flag className="h-3 w-3 text-warning" aria-label={copy.flagged} />}
        {!readOnly && (
          <>
            <IconToggle
              on={item.pinned}
              title={item.pinned ? copy.unpin : copy.pin}
              onClick={() => send({ type: 'setDiscoverItemFlags', docPath, id: item.id, pinned: !item.pinned })}
            >
              <Pin className="h-3 w-3" />
            </IconToggle>
            <IconToggle
              on={item.flagged}
              title={copy.flag}
              onClick={() => send({ type: 'setDiscoverItemFlags', docPath, id: item.id, flagged: !item.flagged })}
            >
              <Flag className="h-3 w-3" />
            </IconToggle>
            <button
              type="button"
              title={confirmDelete ? copy.confirmDelete : copy.delete}
              onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return; }
                send({ type: 'applyDiscoverOps', docPath, revision, ops: [{ op: 'removeItem', id: item.id }] });
              }}
              className={`rounded p-0.5 opacity-0 transition group-hover:opacity-100 ${confirmDelete ? 'bg-destructive/15 text-destructive opacity-100' : 'text-muted-foreground hover:text-destructive'}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </span>
    </div>
  );
}

function AddItemRow({
  docPath, revision, section, copy, onDone,
}: { docPath: string; revision: number; section: DiscoverSection; copy: DiscoverCopy; onDone: () => void }) {
  const [text, setText] = useState('');
  const [group, setGroup] = useState(groupsInSection(section.items.map((i) => i.id))[0] ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    if (!text.trim()) { onDone(); return; }
    send({
      type: 'applyDiscoverOps',
      docPath,
      revision,
      ops: [{ op: 'addItem', section: section.key, text: text.trim(), group: section.grouped ? (group.trim() || 'GEN') : undefined }],
    });
    onDone();
  };

  return (
    <div className="flex items-center gap-1.5 border-t border-border/40 bg-secondary/20 px-3 py-1.5">
      {section.grouped && (
        <input
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder={copy.groupPlaceholder(section.idPrefix ?? 'ID')}
          title={copy.hints.groupInput}
          className="w-24 shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground"
        />
      )}
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { submit(); } if (e.key === 'Escape') { onDone(); } }}
        placeholder={section.hint ?? copy.newEntryPlaceholder}
        title={copy.hints.itemInput}
        className="min-w-0 flex-1 rounded border border-primary/50 bg-background px-1.5 py-0.5 text-[11.5px] text-foreground"
      />
      <button type="button" title={copy.hints.confirmAdd} aria-label={copy.hints.confirmAdd} onClick={submit} className="rounded p-1 text-primary hover:bg-accent"><Check className="h-3.5 w-3.5" /></button>
      <button type="button" title={copy.hints.cancelAdd} aria-label={copy.hints.cancelAdd} onClick={onDone} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ── records ────────────────────────────────────────────────────────────────

function RecordList({ docPath, revision, section, copy, readOnly, flaggedIds }: SectionProps) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="divide-y divide-border/40">
      {section.records.length === 0 && !adding && (
        <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{section.hint ?? copy.emptySection}</p>
      )}
      {section.records.map((record) => (
        <RecordCard
          key={record.id}
          docPath={docPath}
          revision={revision}
          section={section}
          record={record}
          copy={copy}
          readOnly={readOnly}
          flagged={record.flagged || flaggedIds?.has(record.id) === true}
        />
      ))}
      {!readOnly && (adding
        ? <RecordForm docPath={docPath} revision={revision} section={section} copy={copy} onDone={() => setAdding(false)} />
        : (
          <button type="button" title={copy.hints.addEntry} onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground">
            <Plus className="h-3 w-3" /> {copy.addEntry}
          </button>
        ))}
    </div>
  );
}

function RecordCard({
  docPath, revision, section, record, copy, readOnly, flagged,
}: {
  docPath: string; revision: number; section: DiscoverSection; record: DiscoverRecord;
  copy: DiscoverCopy; readOnly?: boolean; flagged: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (editing) {
    return <RecordForm docPath={docPath} revision={revision} section={section} record={record} copy={copy} onDone={() => setEditing(false)} />;
  }
  return (
    <div className="group px-3 py-2">
      <div className="flex items-center gap-2">
        <code className="shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px] text-muted-foreground">{record.id}</code>
        <button
          type="button"
          disabled={readOnly || record.pinned}
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left text-[11.5px] font-medium text-foreground disabled:cursor-default"
          title={record.pinned ? copy.pinnedHint : copy.editHint}
        >
          {record.title || copy.untitled}
        </button>
        <Badge origin={record.origin} copy={copy} />
        {flagged && <Flag className="h-3 w-3 shrink-0 text-warning" />}
        {!readOnly && (
          <>
            <IconToggle
              on={record.pinned}
              title={record.pinned ? copy.unpin : copy.pin}
              onClick={() => send({ type: 'setDiscoverItemFlags', docPath, id: record.id, pinned: !record.pinned })}
            >
              <Pin className="h-3 w-3" />
            </IconToggle>
            <button
              type="button"
              title={confirmDelete ? copy.confirmDelete : copy.delete}
              onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return; }
                send({ type: 'applyDiscoverOps', docPath, revision, ops: [{ op: 'removeRecord', id: record.id }] });
              }}
              className={`shrink-0 rounded p-0.5 opacity-0 transition group-hover:opacity-100 ${confirmDelete ? 'bg-destructive/15 text-destructive opacity-100' : 'text-muted-foreground hover:text-destructive'}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
      <dl className="mt-1 space-y-0.5 pl-1">
        {record.fields.map((field) => (
          <div key={field.label} className="flex gap-1.5 text-[11px] leading-snug">
            <dt className="shrink-0 text-muted-foreground">{field.label}:</dt>
            <dd className="min-w-0 flex-1 text-foreground">
              {field.items.length > 0
                ? <ol className="list-inside list-decimal">{field.items.map((entry, idx) => <li key={idx}>{entry}</li>)}</ol>
                : field.value || <span className="italic text-muted-foreground">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RecordForm({
  docPath, revision, section, record, copy, onDone,
}: {
  docPath: string; revision: number; section: DiscoverSection; record?: DiscoverRecord;
  copy: DiscoverCopy; onDone: () => void;
}) {
  const specFields = section.fields ?? [];
  const [title, setTitle] = useState(record?.title ?? '');
  const [group, setGroup] = useState(groupsInSection(section.records.map((r) => r.id))[0] ?? '');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const spec of specFields) {
      const existing = record?.fields.find((f) => f.label.toLowerCase() === spec.label.toLowerCase());
      initial[spec.label] = existing ? (existing.items.length ? existing.items.join('\n') : existing.value) : '';
    }
    return initial;
  });

  const submit = () => {
    const fields = specFields
      .filter((spec) => values[spec.label]?.trim())
      .map((spec) => (spec.list
        ? { label: spec.label, items: values[spec.label]!.split('\n').map((l) => l.trim()).filter(Boolean) }
        : { label: spec.label, value: values[spec.label]!.trim() }));
    const op = record
      ? { op: 'updateRecord', id: record.id, title: title.trim(), fields }
      : { op: 'addRecord', section: section.key, title: title.trim() || copy.untitled, fields, group: section.grouped ? (group.trim() || 'GEN') : undefined };
    send({ type: 'applyDiscoverOps', docPath, revision, ops: [op] });
    onDone();
  };

  return (
    <div className="space-y-1.5 border-l-2 border-primary/50 bg-secondary/20 px-3 py-2">
      <div className="flex gap-1.5">
        {!record && section.grouped && (
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder={copy.groupPlaceholder(section.idPrefix ?? 'ID')}
            title={copy.hints.groupInput}
            className="w-24 rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px] uppercase text-foreground"
          />
        )}
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={copy.titlePlaceholder}
          title={copy.hints.recordTitleInput}
          className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-[11.5px] font-medium text-foreground"
        />
      </div>
      {specFields.map((spec) => (
        <label key={spec.label} className="block">
          <span className="text-[10px] text-muted-foreground">
            {spec.label}{spec.required ? ' *' : ''}{spec.list ? copy.onePerLine : ''}
          </span>
          {spec.list ? (
            <textarea
              rows={2}
              value={values[spec.label] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [spec.label]: e.target.value }))}
              title={copy.hints.recordField(spec.label)}
              className="mt-0.5 w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
          ) : (
            <input
              value={values[spec.label] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [spec.label]: e.target.value }))}
              title={copy.hints.recordField(spec.label)}
              className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
          )}
        </label>
      ))}
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button type="button" title={copy.hints.cancelEdit} onClick={onDone} className="rounded border border-border px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent">{copy.cancel}</button>
        <button type="button" title={copy.hints.saveEntry} onClick={submit} className="rounded bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90">{copy.save}</button>
      </div>
    </div>
  );
}

// ── prose ──────────────────────────────────────────────────────────────────

function ProseBody({ docPath, revision, section, copy, readOnly }: SectionProps) {
  const [draft, setDraft] = useState(section.prose);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setDraft(section.prose); }, [section.prose]);

  if (section.kind === 'unknown') {
    return (
      <div className="px-3 py-2">
        <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted-foreground">{section.prose || copy.emptySection}</p>
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">{copy.yourSectionHint}</p>
      </div>
    );
  }

  if (readOnly || !editing) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className="block w-full px-3 py-2 text-left disabled:cursor-default"
        title={copy.editHint}
      >
        {section.prose
          ? <span className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-foreground">{section.prose}</span>
          : <span className="text-[11px] italic text-muted-foreground">{section.hint ?? copy.emptySection}</span>}
      </button>
    );
  }

  const save = () => {
    setEditing(false);
    if (draft === section.prose) { return; }
    send({ type: 'applyDiscoverOps', docPath, revision, ops: [{ op: 'setProse', section: section.key, value: draft }] });
  };

  return (
    <div className="px-3 py-2">
      <textarea
        autoFocus
        rows={Math.min(14, Math.max(3, draft.split('\n').length + 1))}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        title={copy.proseHint}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(section.prose); setEditing(false); } }}
        className="w-full resize-y rounded border border-primary/50 bg-background px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground"
      />
      <p className="mt-1 text-[10px] text-muted-foreground">{copy.proseHint}</p>
    </div>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────

function Badge({ origin, copy }: { origin: 'ai' | 'human'; copy: DiscoverCopy }) {
  return origin === 'ai'
    ? <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1 text-[9px] font-medium text-primary">{copy.byAi}</span>
    : <span className="shrink-0 rounded border border-border bg-secondary px-1 text-[9px] text-muted-foreground">{copy.byYou}</span>;
}

function IconToggle({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-0.5 transition ${on ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}
