/* Editing the Markdown file itself — including sections the spec does not
 * know about.
 */

import { useEffect, useState } from 'react';
import type { DiscoverDoc } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';

export function RawMarkdownPane({
  doc, revision, copy, readOnly,
}: { doc: DiscoverDoc; revision: number; copy: DiscoverCopy; readOnly?: boolean }) {
  const [draft, setDraft] = useState(doc.raw);
  useEffect(() => { setDraft(doc.raw); }, [doc.path, doc.raw]);
  const dirty = draft !== doc.raw;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <textarea
        value={draft}
        readOnly={readOnly}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        title={copy.hints.rawEditor}
        className="min-h-[320px] flex-1 resize-none rounded-md border border-border bg-background p-3 font-mono text-[11.5px] leading-relaxed text-foreground"
      />
      <div className="mt-2 flex items-center gap-2">
        <p className="text-[10px] text-muted-foreground">{copy.rawHint}</p>
        {dirty && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">{copy.unsaved}</span>}
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={!dirty}
            onClick={() => setDraft(doc.raw)}
            title={copy.hints.discardRaw}
            className="rounded border border-border px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            disabled={!dirty || readOnly}
            onClick={() => postMessage({ type: 'saveDiscoverDoc', docPath: doc.path, content: draft, revision })}
            title={copy.hints.saveRaw}
            className="rounded bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {copy.save}
          </button>
        </span>
      </div>
    </div>
  );
}
