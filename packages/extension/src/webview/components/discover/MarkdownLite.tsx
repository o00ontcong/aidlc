/* A deliberately small Markdown renderer for the reading view.
 *
 * It covers exactly what the Discover docs contain — headings, bullets with
 * one level of nesting, ordered lists, `**bold**`, `` `code` ``, fenced blocks
 * (including mermaid `flowchart TD`) — and renders anything it does not
 * recognize as plain text. A full Markdown engine would be a dependency and a
 * security surface for output the app itself generates.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import mermaid from 'mermaid';
import { usePanelFullscreen } from '@/hooks/usePanelFullscreen';
import { useSvgDiagramViewport } from '@/hooks/useSvgDiagramViewport';

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

function FenceBlock({ source, lang }: { source: string; lang: string }) {
  if (lang === 'mermaid') { return <MermaidBlock source={source} />; }
  return (
    <pre className="my-2 whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
      {source}
    </pre>
  );
}

const btnClass =
  'inline-flex h-6 min-w-6 items-center justify-center rounded border border-border px-1.5 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';

export function MermaidBlock({
  source,
  title,
  embedded,
  fullscreenLabel = 'Toàn màn hình',
  exitFullscreenLabel = 'Thoát toàn màn hình (Esc)',
}: {
  source: string;
  title?: string;
  /** Parent already draws the card chrome (border / radius). */
  embedded?: boolean;
  fullscreenLabel?: string;
  exitFullscreenLabel?: string;
}) {
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const reactId = useId().replace(/:/g, '');
  const { fullscreen, toggle } = usePanelFullscreen();
  const {
    zoom, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut,
    viewportRef, canvasRef, panHandlers,
  } = useSvgDiagramViewport(svg, fullscreen);
  useEffect(() => {
    let active = true;
    setError(undefined);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
      flowchart: { htmlLabels: false, nodeSpacing: 40, rankSpacing: 40 },
    });
    void mermaid.render(`discover-md-${reactId}`, source)
      .then((result) => { if (active) setSvg(result.svg); })
      .catch((reason: unknown) => {
        if (active) {
          setSvg(undefined);
          setError(reason instanceof Error ? reason.message : 'Không render được Mermaid.');
        }
      });
    return () => { active = false; };
  }, [reactId, source]);
  if (error) {
    return (
      <pre className="my-2 whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2.5 font-mono text-[10.5px] leading-relaxed text-destructive">
        {error}
      </pre>
    );
  }
  if (!svg) {
    return (
      <pre className="my-2 whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {source}
      </pre>
    );
  }
  return (
    <div
      onWheel={fullscreen ? (event) => event.stopPropagation() : undefined}
      className={
        fullscreen
          ? 'fixed inset-0 z-50 flex min-h-0 flex-col bg-background'
          : embedded
            ? 'flex min-h-[220px] flex-col'
            : 'my-2 flex min-h-[220px] flex-col rounded-md border border-border bg-card'
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-secondary/40 px-2 py-1">
        {title
          ? <p className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
          : <span />}
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" title="Thu nhỏ graph" onClick={zoomOut} disabled={!canZoomOut} className={btnClass}>{'\u2212'}</button>
          <button type="button" title="Reset zoom 100% và về giữa. Zoom: Ctrl + lăn chuột" onClick={resetZoom} className={btnClass}>{zoom}%</button>
          <button type="button" title="Phóng to graph" onClick={zoomIn} disabled={!canZoomIn} className={btnClass}>+</button>
          <button
            type="button"
            title={fullscreen ? exitFullscreenLabel : fullscreenLabel}
            aria-label={fullscreen ? exitFullscreenLabel : fullscreenLabel}
            aria-pressed={fullscreen}
            onClick={toggle}
            className={btnClass}
          >
            {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        {...panHandlers}
        className="min-h-0 flex-1 cursor-grab overflow-hidden select-none"
        style={{ minHeight: fullscreen ? 0 : 200 }}
      >
        <div
          ref={canvasRef}
          className="flex min-h-full min-w-full items-center justify-center p-3"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}

export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { text: string; depth: number }[] = [];
  let fence: string[] | null = null;
  let fenceLang = '';

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
  const flushFence = () => {
    if (fence === null) { return; }
    const key = `f${blocks.length}`;
    blocks.push(<FenceBlock key={key} source={fence.join('\n')} lang={fenceLang} />);
    fence = null;
    fenceLang = '';
  };

  for (const line of lines) {
    if (fence !== null) {
      if (/^\s*(```|~~~)/.test(line)) { flushFence(); } else { fence.push(line); }
      continue;
    }
    const open = /^\s*(```|~~~)\s*([^\s`]*)/.exec(line);
    if (open) {
      flushAll();
      fence = [];
      fenceLang = (open[2] ?? '').trim().toLowerCase();
      continue;
    }

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
  flushFence();
  flushAll();

  return <div className="pb-4">{blocks}</div>;
}
