/**
 * In-webview repo layout dialog for Discover scans.
 *
 * VS Code QuickPick does not reliably appear above a focused webview panel, so
 * scope configuration lives here — same pattern as JiraConfigPanel and the
 * other workspace modals.
 */

import { useMemo, useState } from 'react';
import { FolderGit2, FolderOpen, FolderTree, Star } from 'lucide-react';

import { pickChildRepoFolders } from '@/lib/pickFile';
import type { DiscoverScopeDraft, DiscoverScopeModalOpen, DiscoverScopeSummary, RepoCandidateUi } from '@/lib/types';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import { postMessage } from '@/lib/bridge';
import { cn } from '@/lib/utils';
import { Modal, ModalCancelButton, ModalConfirmButton, ModalFooter } from '../Modal';

type WizardStep = 'confirm' | 'layout' | 'children' | 'parentPath' | 'kinds';

interface RepoPick {
  path: string;
  name: string;
  guess: string;
}

function describeScope(
  scope: Pick<DiscoverScopeSummary, 'layout' | 'parentPath' | 'repos'>,
  copy: ReturnType<typeof discoverCopy>,
): string {
  const repos = scope.repos.map((r) => `${r.path} (${r.kind})`).join(', ');
  if (scope.layout === 'parent') { return `${copy.repoLayout({ layout: 'parent', repos: scope.repos, excludes: [], declaredAt: '' })} · ${repos}`; }
  if (scope.layout === 'child') {
    return scope.parentPath ? `${copy.repoLayout({ layout: 'child', repos: scope.repos, excludes: [], declaredAt: '' })} · parent: ${scope.parentPath}` : repos;
  }
  return repos;
}

function initialChildren(probe: DiscoverScopeModalOpen['probe'], existing?: DiscoverScopeModalOpen['existing']): Set<string> {
  if (existing?.repos.length) { return new Set(existing.repos.map((r) => r.path)); }
  return new Set(probe.children.filter((c) => c.isRepo).map((c) => c.path));
}

export function DiscoverScopeModal({
  open,
  language,
  onClose,
}: {
  open: DiscoverScopeModalOpen;
  language: DiscoverLanguage;
  onClose: () => void;
}) {
  const copy = discoverCopy(language);
  const sm = copy.scopeModal;
  const [step, setStep] = useState<WizardStep>(() => (open.mode === 'confirm' && open.existing ? 'confirm' : 'layout'));
  const [layout, setLayout] = useState<DiscoverScopeDraft['layout']>(open.existing?.layout ?? open.probe.suggested);
  const [parentPath, setParentPath] = useState(open.existing?.parentPath ?? open.probe.parentPath ?? '');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => initialChildren(open.probe, open.existing));
  const [extraRepos, setExtraRepos] = useState<RepoPick[]>(() => {
    if (!open.existing) { return []; }
    const known = new Set(open.probe.children.map((c) => c.path));
    return open.existing.repos
      .filter((r) => !known.has(r.path))
      .map((r) => ({ path: r.path, name: r.name ?? r.path, guess: r.kind }));
  });
  const [kinds, setKinds] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of open.existing?.repos ?? []) { map[r.path] = r.kind; }
    return map;
  });

  const childCandidates = useMemo(() => {
    const byPath = new Map(open.probe.children.map((c) => [c.path, c]));
    for (const extra of extraRepos) {
      if (!byPath.has(extra.path)) {
        byPath.set(extra.path, {
          path: extra.path,
          name: extra.name,
          kind: extra.guess,
          isRepo: true,
          hasBlueprint: false,
          manifests: [],
        });
      }
    }
    return [...byPath.values()];
  }, [open.probe.children, extraRepos]);

  const selectedRepos = useMemo((): RepoPick[] => {
    if (layout === 'single') {
      return [{ path: '.', name: open.probe.self.name, guess: open.probe.self.kind || 'app' }];
    }
    if (layout === 'child') {
      return [{ path: '.', name: open.probe.self.name, guess: open.probe.self.kind || open.existing?.repos[0]?.kind || 'app' }];
    }
    return childCandidates
      .filter((c) => selectedPaths.has(c.path))
      .map((c) => ({ path: c.path, name: c.name, guess: c.kind || 'app' }));
  }, [layout, childCandidates, selectedPaths, open.probe.self, open.existing?.repos]);

  const toggleChild = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); }
      return next;
    });
  };

  const browseFolders = async () => {
    const picked = await pickChildRepoFolders();
    if (!picked?.length) { return; }
    setExtraRepos((prev) => {
      const seen = new Set(prev.map((p) => p.path));
      return [...prev, ...picked.filter((p) => !seen.has(p.path)).map((p) => ({ path: p.path, name: p.name, guess: 'app' }))];
    });
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const p of picked) { next.add(p.path); }
      return next;
    });
  };

  const buildDraft = (): DiscoverScopeDraft | undefined => {
    const excludes = open.existing?.excludes ?? [];
    if (layout === 'single') {
      const kind = kinds['.']?.trim() || open.probe.self.kind || 'app';
      return { layout: 'single', repos: [{ path: '.', kind, name: open.probe.self.name }], excludes };
    }
    if (layout === 'child') {
      const kind = kinds['.']?.trim();
      if (!kind) { return undefined; }
      if (!parentPath.trim()) { return undefined; }
      return {
        layout: 'child',
        parentPath: parentPath.trim(),
        repos: [{ path: '.', kind, name: open.probe.self.name }],
        excludes,
      };
    }
    if (selectedRepos.length === 0) { return undefined; }
    const repos = selectedRepos.map((r) => {
      const kind = kinds[r.path]?.trim();
      if (!kind) { return undefined; }
      return { path: r.path, kind, name: r.name };
    });
    if (repos.some((r) => !r)) { return undefined; }
    return { layout: 'parent', repos: repos as DiscoverScopeDraft['repos'], excludes };
  };

  const submitDraft = () => {
    const draft = buildDraft();
    if (!draft) { return; }
    postMessage({ type: 'submitDiscoverScope', intent: open.intent, scope: draft });
    onClose();
  };

  const useSaved = () => {
    postMessage({ type: 'useDiscoverScopeSaved', intent: open.intent });
    onClose();
  };

  const goKinds = () => {
    const defaults: Record<string, string> = { ...kinds };
    for (const repo of selectedRepos) {
      if (!defaults[repo.path]?.trim()) {
        defaults[repo.path] = repo.guess || open.existing?.repos.find((r) => r.path === repo.path)?.kind || 'app';
      }
    }
    setKinds(defaults);
    setStep('kinds');
  };

  const onLayoutNext = () => {
    if (layout === 'single') {
      const kind = kinds['.']?.trim() || open.probe.self.kind || 'app';
      const draft: DiscoverScopeDraft = {
        layout: 'single',
        repos: [{ path: '.', kind, name: open.probe.self.name }],
        excludes: open.existing?.excludes ?? [],
      };
      postMessage({ type: 'submitDiscoverScope', intent: open.intent, scope: draft });
      onClose();
      return;
    }
    if (layout === 'child') {
      setStep('parentPath');
      return;
    }
    setStep('children');
  };

  const title = step === 'confirm'
    ? sm.confirmTitle
    : step === 'layout'
      ? sm.layoutTitle
      : step === 'children'
        ? sm.pickChildren
        : step === 'parentPath'
          ? sm.parentPrompt
          : sm.kindTitle;

  const canConfirm = step === 'kinds' ? Boolean(buildDraft()) : step === 'children' ? selectedPaths.size > 0 : step === 'parentPath' ? Boolean(parentPath.trim()) : true;

  return (
    <Modal
      title={title}
      maxWidth="max-w-lg"
      onClose={() => { postMessage({ type: 'cancelDiscoverScope' }); onClose(); }}
      closeOnBackdrop={false}
      onSubmit={step === 'kinds' ? submitDraft : undefined}
    >
      {step === 'confirm' && open.existing && (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{describeScope(open.existing, copy)}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={useSaved}
              className="rounded-md bg-primary px-3 py-2 text-left text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {sm.useSaved(describeScope(open.existing, copy))}
            </button>
            <button
              type="button"
              onClick={() => setStep('layout')}
              className="rounded-md border border-border px-3 py-2 text-left text-xs text-foreground hover:bg-accent"
            >
              {sm.editSaved}
            </button>
          </div>
        </div>
      )}

      {step === 'layout' && (
        <div className="space-y-2">
          {(['single', 'parent', 'child'] as const).map((value) => {
            const labels = { single: [sm.single, sm.singleDetail], parent: [sm.parent, sm.parentDetail], child: [sm.child, sm.childDetail] } as const;
            const [label, detail] = labels[value];
            const suggested = value === open.probe.suggested;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setLayout(value)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                  layout === value ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50',
                )}
              >
                <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    {label}
                    {suggested && (
                      <span title={sm.suggested}>
                        <Star className="h-3 w-3 fill-warning text-warning" />
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 'children' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{childCandidates.length > 0 ? sm.pickChildren : sm.pickChildrenEmpty}</span>
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">
              {sm.selected(selectedPaths.size)}
            </span>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {childCandidates.map((candidate) => (
              <CandidateRow
                key={candidate.path}
                candidate={candidate}
                checked={selectedPaths.has(candidate.path)}
                onToggle={() => toggleChild(candidate.path)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void browseFolders()}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
          >
            <FolderOpen className="h-3.5 w-3.5" />{sm.browse}
          </button>
        </div>
      )}

      {step === 'parentPath' && (
        <div className="space-y-3">
          {open.probe.parentPath && (
            <button
              type="button"
              onClick={() => setParentPath(open.probe.parentPath!)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs',
                parentPath === open.probe.parentPath ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50',
              )}
            >
              <FolderGit2 className="h-4 w-4 text-primary" />
              <span className="font-mono">{open.probe.parentPath}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{sm.detected}</span>
            </button>
          )}
          <label className="block text-[11px] text-muted-foreground">{sm.parentManual}</label>
          <input
            value={parentPath}
            onChange={(e) => setParentPath(e.target.value)}
            placeholder="../parent-repo"
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
          />
        </div>
      )}

      {step === 'kinds' && (
        <div className="space-y-3">
          {selectedRepos.map((repo) => (
            <label key={repo.path} className="block space-y-1">
              <span className="text-[11px] font-medium text-foreground">{sm.kindPrompt(repo.name)}</span>
              <input
                value={kinds[repo.path] ?? ''}
                onChange={(e) => setKinds((k) => ({ ...k, [repo.path]: e.target.value }))}
                placeholder={sm.kindHint}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </label>
          ))}
        </div>
      )}

      {step !== 'confirm' && (
        <ModalFooter>
          <ModalCancelButton onClick={() => { postMessage({ type: 'cancelDiscoverScope' }); onClose(); }} />
          {step === 'layout' && (
            <ModalConfirmButton onClick={onLayoutNext} label={sm.next} disabled={false} />
          )}
          {step === 'children' && (
            <ModalConfirmButton onClick={goKinds} label={sm.next} disabled={selectedPaths.size === 0} />
          )}
          {step === 'parentPath' && (
            <ModalConfirmButton onClick={goKinds} label={sm.next} disabled={!parentPath.trim()} />
          )}
          {step === 'kinds' && (
            <ModalConfirmButton onClick={submitDraft} label={sm.ok} disabled={!canConfirm} />
          )}
        </ModalFooter>
      )}
    </Modal>
  );
}

function CandidateRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: RepoCandidateUi;
  checked: boolean;
  onToggle: () => void;
}) {
  const desc = [candidate.kind, candidate.isRepo ? 'git' : undefined, candidate.hasBlueprint ? 'blueprint' : undefined]
    .filter(Boolean).join(' · ');
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2',
        checked ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-accent/40',
      )}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-xs text-foreground">{candidate.path}</span>
        {desc && <span className="block text-[10px] text-muted-foreground">{desc}</span>}
        {candidate.manifests.length > 0 && (
          <span className="block text-[10px] text-muted-foreground/80">{candidate.manifests.join(', ')}</span>
        )}
      </span>
    </label>
  );
}
