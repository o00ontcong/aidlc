import { useMemo, useState } from 'react';
import { FileDiff, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Raw REVIEW-DIFF.md (or similar) text. */
  diffText?: string | null;
  /** Patterns from `.aidlc/diffignore` (minimatch-ish prefix/glob roots). */
  diffIgnore?: string[];
  stepLabel?: string;
}

function shouldIgnore(file: string, patterns: string[]): boolean {
  const f = file.replaceAll('\\', '/');
  for (const raw of patterns) {
    const p = raw.trim().replaceAll('\\', '/');
    if (!p || p.startsWith('#')) continue;
    const root = p.replace(/\*\*?.*$/, '').replace(/\/$/, '');
    if (!root) continue;
    if (f === root || f.startsWith(`${root}/`) || f.includes(p.replace(/\*\*/g, ''))) return true;
  }
  return false;
}

function extractFiles(text: string): string[] {
  const files = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const bullet = line.trim().match(/^[-*]\s+`?([^`\s]+)`?\s*$/);
    if (bullet) files.add(bullet[1]);
  }
  return [...files];
}

/**
 * Minimal diff pane for humanReview steps that touch code.
 * Shows REVIEW-DIFF summary; honors `.aidlc/diffignore` for display only.
 */
export function DiffPane({ diffText, diffIgnore = [], stepLabel }: Props) {
  const [showIgnored, setShowIgnored] = useState(false);

  const { visible, ignored, body } = useMemo(() => {
    if (!diffText?.trim()) {
      return { visible: [] as string[], ignored: [] as string[], body: '' };
    }
    const files = extractFiles(diffText);
    const vis: string[] = [];
    const ign: string[] = [];
    for (const f of files) {
      if (shouldIgnore(f, diffIgnore)) ign.push(f);
      else vis.push(f);
    }
    return { visible: vis, ignored: ign, body: diffText };
  }, [diffText, diffIgnore]);

  if (!diffText?.trim()) {
    return (
      <div className="mx-5 mb-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium">
          <FileDiff className="h-3.5 w-3.5" />
          Diff review
          {stepLabel ? <span className="font-normal opacity-70">· {stepLabel}</span> : null}
        </div>
        <p className="mt-1">No REVIEW-DIFF.md yet — approve after the agent produces a real git diff.</p>
      </div>
    );
  }

  const files = showIgnored ? [...visible, ...ignored] : visible;

  return (
    <div className="mx-5 mb-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <FileDiff className="h-3.5 w-3.5" />
          Diff review
          {stepLabel ? <span className="font-normal text-muted-foreground">· {stepLabel}</span> : null}
        </div>
        {ignored.length > 0 && (
          <button
            type="button"
            onClick={() => setShowIgnored((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent',
            )}
          >
            {showIgnored ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showIgnored ? 'Hide ignored' : `Show ignored (${ignored.length})`}
          </button>
        )}
      </div>
      {files.length > 0 && (
        <ul className="mb-2 space-y-0.5 font-mono text-[10px] text-muted-foreground">
          {files.map((f) => (
            <li key={f} className={cn(ignored.includes(f) && 'opacity-50')}>
              {f}
            </li>
          ))}
        </ul>
      )}
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border/60 bg-card/60 p-2 text-[10px] text-muted-foreground">
        {body}
      </pre>
    </div>
  );
}
