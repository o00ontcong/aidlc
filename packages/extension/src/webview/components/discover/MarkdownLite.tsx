/* A deliberately small Markdown renderer for the reading view.
 *
 * It covers exactly what the Discover docs contain — headings, bullets with
 * one level of nesting, ordered lists, `**bold**`, `` `code` ``, fenced blocks
 * — and renders anything it does not recognize as plain text. A full Markdown
 * engine would be a dependency and a security surface for output the app
 * itself generates.
 */

import type { ReactNode } from 'react';

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) { out.push(text.slice(last, match.index)); }
    const token = match[0];
    if (token.startsWith('**')) {
      out.push(<strong key={`${keyBase}-b${i}`} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else {
      out.push(<code key={`${keyBase}-c${i}`} className="rounded bg-secondary px-1 font-mono text-[10.5px]">{token.slice(1, -1)}</code>);
    }
    last = match.index + token.length;
    i += 1;
  }
  if (last < text.length) { out.push(text.slice(last)); }
  return out;
}

export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { text: string; depth: number }[] = [];
  let fence: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) { return; }
    const key = `p${blocks.length}`;
    blocks.push(<p key={key} className="my-2 text-xs leading-relaxed text-muted-foreground">{inline(paragraph.join(' '), key)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) { return; }
    const key = `l${blocks.length}`;
    blocks.push(
      <ul key={key} className="my-2 space-y-1">
        {list.map((entry, idx) => (
          <li key={`${key}-${idx}`} className="text-xs leading-relaxed text-muted-foreground" style={{ paddingLeft: entry.depth * 14 }}>
            <span className="mr-1.5 text-muted-foreground/60">•</span>
            {inline(entry.text, `${key}-${idx}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushAll = () => { flushParagraph(); flushList(); };

  for (const line of lines) {
    if (fence !== null) {
      if (/^\s*(```|~~~)/.test(line)) {
        const key = `f${blocks.length}`;
        blocks.push(
          <pre key={key} className="my-2 overflow-x-auto rounded-md border border-border bg-background p-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
            {fence.join('\n')}
          </pre>,
        );
        fence = null;
      } else { fence.push(line); }
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) { flushAll(); fence = []; continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1]!.length;
      const size = level === 1 ? 'text-sm' : level === 2 ? 'text-[13px]' : 'text-xs';
      blocks.push(
        <div key={`h${blocks.length}`} className={`mt-4 mb-1 font-bold text-foreground ${size}`}>
          {heading[2]}
        </div>,
      );
      continue;
    }

    const bullet = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push({ text: bullet[2]!, depth: Math.floor(bullet[1]!.length / 2) });
      continue;
    }

    if (line.trim() === '') { flushAll(); continue; }
    flushList();
    paragraph.push(line.trim());
  }
  if (fence !== null) {
    blocks.push(
      <pre key={`f${blocks.length}`} className="my-2 overflow-x-auto rounded-md border border-border bg-background p-2.5 font-mono text-[10.5px] text-muted-foreground">
        {fence.join('\n')}
      </pre>,
    );
  }
  flushAll();

  return <div className="pb-4">{blocks}</div>;
}
