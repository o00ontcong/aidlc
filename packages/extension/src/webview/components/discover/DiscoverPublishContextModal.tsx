/**
 * In-webview publish dialog for Discover Context — replaces VS Code
 * InputBox, which renders as a command-palette bar and is easy to miss
 * over a webview panel. This is the primary entry for Publish Context
 * history; per-entity history elsewhere is a reference only.
 */

import { History } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import type { DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { useHostAction } from '@/hooks/useHostAction';
import { Modal, ModalCancelButton, ModalConfirmButton } from '../Modal';

type PublishHistoryEntry = NonNullable<DiscoverSummary['context']['publishHistory']>[number];
type PublishDiff = NonNullable<DiscoverSummary['context']['publishDiff']>;

function changeTone(change: string): string {
  if (change === 'added' || change === 'created') { return 'border-success/40 bg-success/10 text-success'; }
  if (change === 'removed' || change === 'deprecated') { return 'border-destructive/40 bg-destructive/10 text-destructive'; }
  return 'border-warning/40 bg-warning/10 text-warning';
}

function shortCommit(commit: string | null): string {
  return commit ? commit.slice(0, 8) : '—';
}

function DiffSection({
  label,
  emptyLabel,
  children,
  count,
}: {
  label: string;
  emptyLabel: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="rounded bg-muted px-1 py-px font-mono text-[10px] text-foreground">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-[11px] text-muted-foreground/80">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">{children}</ul>
      )}
    </div>
  );
}

function PublishDiffPanel({
  diff,
  pm,
}: {
  diff: PublishDiff;
  pm: ReturnType<typeof discoverCopy>['publishContextModal'];
}) {
  const vsLabel = diff.hasPrevious
    ? (diff.previousTitle || diff.previousRevision || '')
    : '';

  return (
    <div className="mb-4 max-h-72 space-y-3 overflow-y-auto rounded-md border border-border bg-background/40 p-3">
      <div className="space-y-1">
        <p className="text-[11.5px] font-semibold text-foreground">{pm.diffTitle}</p>
        {!diff.hasPrevious ? (
          <p className="text-[11px] text-muted-foreground">{pm.diffFirstPublish}</p>
        ) : diff.unchanged ? (
          <p className="text-[11px] text-muted-foreground">{pm.diffUnchanged}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{pm.diffVs(vsLabel)}</p>
        )}
      </div>

      <DiffSection label={pm.diffDocuments} emptyLabel={pm.diffEmptySection} count={diff.documents.length}>
        {diff.documents.map((doc) => (
          <li key={doc.path} className="flex items-start gap-2 rounded border border-border/60 bg-popover px-2 py-1.5">
            <span className={`mt-0.5 shrink-0 rounded border px-1 py-px text-[9px] font-semibold uppercase ${changeTone(doc.change)}`}>
              {pm.changeLabel(doc.change)}
            </span>
            <code className="break-all font-mono text-[11px] text-foreground">{doc.path}</code>
          </li>
        ))}
      </DiffSection>

      <DiffSection label={pm.diffEntities} emptyLabel={pm.diffEmptySection} count={diff.entities.length}>
        {diff.entities.map((entity) => (
          <li key={entity.id} className="rounded border border-border/60 bg-popover px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`shrink-0 rounded border px-1 py-px text-[9px] font-semibold uppercase ${changeTone(entity.change)}`}>
                {pm.changeLabel(entity.change)}
              </span>
              <code className="font-mono text-[11px] font-semibold text-foreground">{entity.id}</code>
              <span className="text-[10px] text-muted-foreground">{entity.kind}</span>
              {entity.changedFields.length > 0 && entity.changedFields[0] !== '*' ? (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {entity.changedFields.join(', ')}
                </span>
              ) : null}
            </div>
            {entity.beforeTitle && entity.beforeTitle !== entity.title ? (
              <p className="mt-1 space-y-0.5 text-[11px]">
                <span className="block text-muted-foreground line-through">{entity.beforeTitle}</span>
                <span className="block text-foreground">{entity.title}</span>
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-foreground">{entity.title}</p>
            )}
          </li>
        ))}
      </DiffSection>

      <DiffSection label={pm.diffRules} emptyLabel={pm.diffEmptySection} count={diff.rules.length}>
        {diff.rules.map((rule) => (
          <li key={rule.id} className="rounded border border-border/60 bg-popover px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`shrink-0 rounded border px-1 py-px text-[9px] font-semibold uppercase ${changeTone(rule.change)}`}>
                {pm.changeLabel(rule.change)}
              </span>
              <code className="font-mono text-[11px] font-semibold text-foreground">{rule.id}</code>
            </div>
            {rule.beforeText && rule.text && rule.beforeText !== rule.text ? (
              <p className="mt-1 space-y-0.5 text-[11px]">
                <span className="block text-muted-foreground line-through">{rule.beforeText}</span>
                <span className="block text-foreground">{rule.text}</span>
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">{rule.text || rule.beforeText || ''}</p>
            )}
          </li>
        ))}
      </DiffSection>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{pm.diffSource}</span>
          <span className={`rounded border px-1 py-px text-[9px] font-semibold uppercase ${diff.source.changed ? changeTone('updated') : 'border-border bg-muted text-muted-foreground'}`}>
            {diff.source.changed ? pm.changeLabel('updated') : pm.diffEmptySection}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground">{shortCommit(diff.source.previousCommit)}</span>
          {' → '}
          <span className="font-mono text-foreground">{shortCommit(diff.source.currentCommit)}</span>
          {' · '}
          {diff.source.dirty ? pm.diffSourceDirty : pm.diffSourceClean}
        </p>
        {diff.source.changedPaths.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">{pm.diffSourcePaths(diff.source.changedPaths.length)}</p>
            <ul className="max-h-24 space-y-0.5 overflow-y-auto rounded border border-border/60 bg-popover px-2 py-1.5">
              {diff.source.changedPaths.slice(0, 40).map((filePath) => (
                <li key={filePath} className="truncate font-mono text-[10.5px] text-foreground">{filePath}</li>
              ))}
              {diff.source.changedPaths.length > 40 ? (
                <li className="text-[10px] text-muted-foreground">… +{diff.source.changedPaths.length - 40}</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DiscoverPublishContextModal({
  language,
  history = [],
  publishDiff,
  onClose,
}: {
  language: DiscoverLanguage;
  history?: PublishHistoryEntry[];
  publishDiff?: PublishDiff;
  onClose: () => void;
}) {
  const copy = discoverCopy(language);
  const pm = copy.publishContextModal;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const { pending, run } = useHostAction({ onSettled: onClose });

  const submit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || pending) { return; }
    run(() => {
      postMessage({
        type: 'publishDiscoverContext',
        title: trimmedTitle,
        description: description.trim(),
      });
    });
  };

  return (
    <Modal
      title={pm.title}
      subtitle={pm.subtitle}
      maxWidth="max-w-xl"
      onClose={onClose}
      onSubmit={submit}
      closeOnBackdrop={false}
      busy={pending}
    >
      {publishDiff ? <PublishDiffPanel diff={publishDiff} pm={pm} /> : null}

      {showHistory && (
        <div className="mb-4 space-y-2">
          <p className="text-[11px] font-medium text-foreground">{pm.historyTitle}</p>
          {history.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
              {pm.historyEmpty}
            </p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-border bg-background/40 p-2">
              {history.map((entry) => (
                <li
                  key={entry.discoverRevision}
                  className="rounded-md border border-border/70 bg-popover px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11.5px] font-semibold text-foreground">
                      {entry.title}
                    </span>
                    {entry.isCurrent && (
                      <span className="rounded border border-primary/40 bg-primary/10 px-1 py-px text-[9px] font-semibold text-primary">
                        {pm.historyCurrent}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(entry.publishedAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.description ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{entry.description}</p>
                  ) : null}
                  <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground/70">{pm.historyRevision}:</span>{' '}
                      <span className="font-mono">{entry.discoverRevision}</span>
                    </p>
                    {entry.parentRevision ? (
                      <p>
                        <span className="font-medium text-foreground/70">{pm.historyParent}:</span>{' '}
                        <span className="font-mono">{entry.parentRevision}</span>
                      </p>
                    ) : null}
                    <p>
                      {pm.historyEvents(entry.eventCount)}
                      {entry.entityIds.length ? ` · ${entry.entityIds.join(', ')}` : ''}
                      {entry.sourceCommit ? ` · ${entry.sourceCommit.slice(0, 8)}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-foreground">{pm.titleLabel}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={pm.titlePlaceholder}
            autoFocus
            disabled={pending}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-40"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-foreground">{pm.descriptionLabel}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={pm.descriptionPlaceholder}
            rows={3}
            disabled={pending}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-40"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowHistory((open) => !open)}
          disabled={pending}
          className="mr-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-muted-foreground hover:border-border/80 hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <History className="h-3 w-3" />
          {showHistory ? pm.historyHide : pm.historyCta}
          {!showHistory && history.length > 0 ? (
            <span className="rounded bg-muted px-1 text-[10px] font-semibold text-foreground">
              {history.length}
            </span>
          ) : null}
        </button>
        <ModalCancelButton onClick={onClose} disabled={pending} />
        <ModalConfirmButton
          onClick={submit}
          label={pm.confirm}
          disabled={!title.trim()}
          loading={pending}
          loadingLabel="Publishing…"
        />
      </div>
    </Modal>
  );
}
