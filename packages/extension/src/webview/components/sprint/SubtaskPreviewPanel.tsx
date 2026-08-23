/**
 * Subtask preview — the only place subtasks get created.
 *
 * The panel's job is to show *exactly* what will be written to Jira before
 * anything is written. That is why each draft expands into the five template
 * sections rather than a summary line: the interesting failure mode of a
 * generated ticket is not "it failed", it is "it was created and says the wrong
 * thing".
 *
 * Three states a draft can be in, each visually distinct because each needs a
 * different response: creatable (tick it), already on Jira (nothing to do), and
 * blocked (fix the template or the project). A blocked draft states the field
 * that blocked it, because "required field missing" without the name is a dead end.
 */

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, X } from 'lucide-react';

import type { SubtaskCreateOutcome, SubtaskDraft, SubtaskPlan, SubtaskSection } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface SubtaskPreviewPanelProps {
  ticketKey: string;
  plan: SubtaskPlan | null;
  result: SubtaskCreateOutcome | null;
  /** Creation is gated by `aidlc.jira.subtasks.enabled`. */
  enabled: boolean;
  busy: boolean;
  onCreate: (domains: string[]) => void;
  onEnable: () => void;
  onImportTemplate: () => void;
  onOpenExternal: (url: string) => void;
  onClose: () => void;
}

export function SubtaskPreviewPanel({
  ticketKey, plan, result, enabled, busy, onCreate, onEnable, onImportTemplate,
  onOpenExternal, onClose,
}: SubtaskPreviewPanelProps) {
  // Ticks start from the planner's suggestion, then follow the user.
  const [ticked, setTicked] = useState<Record<string, boolean> | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const drafts = plan?.drafts ?? [];
  const isTicked = (draft: SubtaskDraft) =>
    ticked?.[draft.domain] ?? (draft.selected && creatable(draft));
  const selectedDomains = drafts.filter((draft) => creatable(draft) && isTicked(draft))
    .map((draft) => draft.domain);

  const toggle = (domain: string) => setTicked((prev) => {
    const base = prev ?? Object.fromEntries(
      drafts.map((draft) => [draft.domain, draft.selected && creatable(draft)]),
    );
    return { ...base, [domain]: !base[domain] };
  });

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">
              Subtask cho <span className="font-mono">{ticketKey}</span>
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Theo mẫu <code className="font-mono">.aidlc/jira-subtask-template.yaml</code>
              {plan?.issueTypeName && <> · issue type <b>{plan.issueTypeName}</b></>}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onImportTemplate}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              ↻ Import lại từ Confluence
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {plan?.error && (
          <Banner tone="error">
            <b>Không lập được danh sách subtask.</b> {plan.error}
          </Banner>
        )}

        {!enabled && !plan?.error && (
          <Banner tone="warn">
            Tạo subtask đang <b>tắt</b> — xem trước được, chưa ghi được lên Jira.{' '}
            <button type="button" onClick={onEnable} className="underline hover:no-underline">
              Bật cho project này
            </button>
          </Banner>
        )}

        {(plan?.notices ?? []).map((notice) => (
          <Banner key={notice} tone="info">{notice}</Banner>
        ))}

        {!plan && !busy && (
          <div className="px-4 py-8 text-center text-[11.5px] text-muted-foreground">
            Đang chuẩn bị…
          </div>
        )}
        {busy && !plan && (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-[11.5px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Đang đọc mẫu và metadata project…
          </div>
        )}

        {drafts.length > 0 && (
          <div className="grid gap-2 px-4 py-3">
            {drafts.map((draft) => (
              <DraftRow
                key={draft.domain}
                draft={draft}
                ticked={isTicked(draft)}
                expanded={expanded === draft.domain}
                disabled={!enabled}
                onToggle={() => toggle(draft.domain)}
                onExpand={() => setExpanded(expanded === draft.domain ? null : draft.domain)}
              />
            ))}
          </div>
        )}

        {plan && drafts.length === 0 && !plan.error && (
          <div className="px-4 py-8 text-center text-[11.5px] text-muted-foreground">
            Mẫu không đề xuất subtask nào cho ticket này.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface/40 px-4 py-3">
          <button
            type="button"
            disabled={!enabled || busy || selectedDomains.length === 0}
            onClick={() => onCreate(selectedDomains)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold',
              !enabled || busy || selectedDomains.length === 0
                ? 'cursor-not-allowed border border-border bg-secondary text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Tạo {selectedDomains.length} subtask
          </button>
          <button
            type="button"
            onClick={() => setTicked(Object.fromEntries(drafts.map((d) => [d.domain, false])))}
            className="rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Bỏ chọn hết
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Ghi lên Jira của team — bấm là tạo thật, không có bản nháp.
          </span>
        </div>

        {result && <ResultStrip result={result} onOpenExternal={onOpenExternal} />}
      </div>
    </div>
  );
}

/** Creatable = not already on Jira and not blocked. */
function creatable(draft: SubtaskDraft): boolean {
  return !draft.existingKey && draft.blockedBy.length === 0;
}

function DraftRow({ draft, ticked, expanded, disabled, onToggle, onExpand }: {
  draft: SubtaskDraft;
  ticked: boolean;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const blocked = draft.blockedBy.length > 0;
  const done = Boolean(draft.existingKey);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        done && 'border-border bg-background opacity-70',
        blocked && 'border-destructive/40 bg-destructive/10',
        !done && !blocked && (expanded ? 'border-primary/40 bg-card' : 'border-border bg-card'),
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {done ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <input
            type="checkbox"
            checked={ticked && !blocked}
            disabled={blocked || disabled}
            onChange={onToggle}
            aria-label={`Chọn ${draft.domain}`}
            className="h-3.5 w-3.5 shrink-0 accent-[var(--color-primary)] disabled:opacity-40"
          />
        )}
        <span className={cn('min-w-0 flex-1 truncate text-[11.5px]', done && 'text-muted-foreground')}>
          {draft.summary}
        </span>
        {draft.fromSteps.length > 0 && !done && !blocked && (
          <span className="hidden shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:inline">
            {draft.fromSteps.join(' · ')}
          </span>
        )}
        {done && (
          <span className="shrink-0 rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 font-mono text-[9.5px] text-primary">
            đã tạo · {draft.existingKey}
          </span>
        )}
        {blocked && (
          <span className="shrink-0 rounded border border-destructive/40 px-1.5 py-0.5 font-mono text-[9.5px] text-destructive">
            bị chặn
          </span>
        )}
        {!done && (
          <button
            type="button"
            onClick={onExpand}
            aria-label={expanded ? 'Thu gọn' : 'Xem nội dung'}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {blocked && (
        <div className="border-t border-destructive/30 px-3 py-2 pl-9 text-[11px] leading-relaxed text-destructive">
          {draft.blockedBy.join(' ')}
        </div>
      )}

      {expanded && !blocked && (
        <div className="grid gap-2.5 border-t border-border bg-background/60 px-3 py-3">
          {draft.sections.filter((s) => s.lines.some((l) => l.trim())).map((section, index) => (
            <div key={section.heading}>
              {index > 0 && <div className="mb-2.5 h-px bg-border" />}
              <SectionBody section={section} />
            </div>
          ))}
          {draft.labels.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Labels áp lên issue: {draft.labels.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SectionBody({ section }: { section: SubtaskSection }) {
  const lines = section.lines.filter((line) => line.trim());
  return (
    <>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {section.heading}
        {section.kind === 'taskList' && (
          <span className="ml-2 normal-case tracking-normal opacity-80">
            — ra checkbox thật trên Jira
          </span>
        )}
      </div>
      {section.kind === 'prose' && (
        <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted-foreground">
          {lines.join('\n')}
        </p>
      )}
      {section.kind === 'bulletList' && (
        <ul className="m-0 list-none space-y-0.5 p-0 text-[11.5px] text-muted-foreground">
          {lines.map((line) => <li key={line}>• {line}</li>)}
        </ul>
      )}
      {section.kind === 'taskList' && (
        <ul className="m-0 list-none space-y-0.5 p-0 text-[11.5px] text-muted-foreground">
          {lines.map((line) => <li key={line}>☐ {line}</li>)}
        </ul>
      )}
      {section.kind === 'inlineCode' && (
        <div className="flex flex-wrap gap-1">
          {lines.map((line) => (
            <span
              key={line}
              className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Per-draft outcome. Jira's bulk create succeeds partially, so this reports what
 * landed and what did not — one aggregate error would hide the fact that
 * retrying could duplicate the successes.
 */
function ResultStrip({ result, onOpenExternal }: {
  result: SubtaskCreateOutcome;
  onOpenExternal: (url: string) => void;
}) {
  const total = result.created.length + result.failed.length;
  return (
    <div className="border-t border-border bg-surface/40 px-4 py-3">
      <Banner tone={result.failed.length > 0 ? 'warn' : 'info'}>
        <b>Tạo {result.created.length}/{total}.</b>{' '}
        {result.created.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => onOpenExternal(entry.key)}
            className="mr-2 inline-flex items-center gap-1 font-mono underline hover:no-underline"
          >
            {entry.key} [{entry.domain}]
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        ))}
        {result.failed.map((entry) => (
          <span key={`${entry.domain}-${entry.message}`} className="mr-2 block text-destructive">
            {entry.domain ? `[${entry.domain}] ` : ''}{entry.message}
          </span>
        ))}
      </Banner>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'warn' | 'error'; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3">
      <div
        className={cn(
          'flex gap-2.5 rounded-lg border p-2.5 text-[11px] leading-relaxed',
          tone === 'info' && 'border-info/40 bg-info/10 text-info',
          tone === 'warn' && 'border-warning/40 bg-warning/10 text-warning',
          tone === 'error' && 'border-destructive/40 bg-destructive/10 text-destructive',
        )}
      >
        {tone !== 'info' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
