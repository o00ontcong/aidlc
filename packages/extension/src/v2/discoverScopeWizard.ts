/**
 * Asks the user, once, what shape their repo tree is — so a Discover scan can
 * stop guessing.
 *
 * A scan is only as good as its idea of "the codebase". On a real machine that
 * is not obvious: a parent repo can own the docs while the code sits in child
 * repos with their own remotes and their own stacks, and every repo carries AI
 * scaffolding (`.aidlc/`, `.claude/`, `.cursor/`) that reads like source but
 * describes the tooling. Guessing wrong produces a blueprint about the wrong
 * product, which is worse than no blueprint at all — so the layout is declared
 * here, written into `.aidlc/discover/index.json`, and reused by every later
 * scan until the user re-declares it.
 *
 * `core/discover/sourceScope.ts` proposes; this wizard only confirms.
 */

import * as path from 'path';
import * as vscode from 'vscode';

import {
  guessRepoKind,
  probeRepoLayout,
  type DiscoverScope,
  type DiscoverSourceRepo,
  type RepoCandidate,
} from '@aidlc/core';

type Lang = 'en' | 'vi';

interface Copy {
  layoutTitle: string;
  single: [string, string];
  parent: [string, string];
  child: [string, string];
  suggested: string;
  pickChildren: string;
  pickChildrenEmpty: string;
  browse: string;
  browseTitle: string;
  kindPrompt: (name: string) => string;
  kindHint: string;
  kindEmpty: string;
  parentPrompt: string;
  detected: string;
  noChildren: string;
  outsideRoot: string;
  saved: (summary: string) => string;
}

const COPY: Record<Lang, Copy> = {
  vi: {
    layoutTitle: 'Repo này có cấu trúc thế nào? (quyết định vùng code mà scan được đọc)',
    single: ['Một repo duy nhất', 'Code của sản phẩm nằm ngay trong repo này'],
    parent: ['Repo cha quản lý nhiều repo con', 'Repo này giữ tài liệu, code nằm trong các repo con'],
    child: ['Repo con của một repo cha', 'Repo này là một phần hiện thực; tài liệu sản phẩm ở repo cha'],
    suggested: 'đề xuất',
    pickChildren: 'Chọn các repo con chứa code (bỏ chọn thứ không phải sản phẩm)',
    pickChildrenEmpty: 'Chưa chọn repo con nào — scan sẽ không có code để đối chiếu.',
    browse: '$(folder-opened) Chọn folder khác…',
    browseTitle: 'Chọn folder repo con',
    kindPrompt: (name) => `"${name}" là loại repo gì?`,
    kindHint: 'backend / frontend / mobile / infra / …',
    kindEmpty: 'Nhập một nhãn, ví dụ backend.',
    parentPrompt: 'Repo cha nằm ở đâu?',
    detected: 'phát hiện tự động',
    noChildren: 'Không tìm thấy repo con nào bên trong workspace — chọn folder thủ công.',
    outsideRoot: 'Folder này nằm ngoài workspace; đường dẫn sẽ được lưu tương đối (..).',
    saved: (summary) => `AIDLC Discover: đã lưu cấu trúc repo — ${summary}`,
  },
  en: {
    layoutTitle: 'How is this repo laid out? (decides what source a scan may read)',
    single: ['A single repo', 'The product\'s code lives in this repo'],
    parent: ['A parent repo over several child repos', 'This repo holds the docs; the code lives in child repos'],
    child: ['A child of a parent repo', 'This repo is one implementation; product docs live in the parent'],
    suggested: 'suggested',
    pickChildren: 'Pick the child repos that hold code (uncheck anything that is not the product)',
    pickChildrenEmpty: 'No child repo picked — a scan would have no code to reconcile against.',
    browse: '$(folder-opened) Pick another folder…',
    browseTitle: 'Pick a child repo folder',
    kindPrompt: (name) => `What kind of repo is "${name}"?`,
    kindHint: 'backend / frontend / mobile / infra / …',
    kindEmpty: 'Enter a label, e.g. backend.',
    parentPrompt: 'Where is the parent repo?',
    detected: 'auto-detected',
    noChildren: 'No child repo found inside the workspace — pick a folder by hand.',
    outsideRoot: 'That folder is outside the workspace; its path is stored relative (..).',
    saved: (summary) => `AIDLC Discover: repo layout saved — ${summary}`,
  },
};

type ScopeDraft = Omit<DiscoverScope, 'declaredAt'>;

interface LayoutItem extends vscode.QuickPickItem { layout: DiscoverScope['layout'] }
interface RepoItem extends vscode.QuickPickItem { candidate?: RepoCandidate; browse?: true }

/**
 * Run the wizard. Resolves `undefined` when the user escapes at any point —
 * the caller must then start no run: a scan with a half-declared scope is the
 * exact failure this exists to prevent.
 */
export async function promptForDiscoverScope(
  root: string,
  lang: Lang,
  existing?: DiscoverScope,
): Promise<ScopeDraft | undefined> {
  const t = COPY[lang];
  const probe = probeRepoLayout(root);
  const preferred = existing?.layout ?? probe.suggested;

  const layoutItems: LayoutItem[] = (['single', 'parent', 'child'] as const).map((layout) => {
    const [label, detail] = t[layout];
    return {
      layout,
      label: layout === preferred ? `${label} $(star-full)` : label,
      description: layout === preferred ? t.suggested : undefined,
      detail,
    };
  });
  // The suggestion first, so Enter takes it.
  layoutItems.sort((a, b) => Number(b.layout === preferred) - Number(a.layout === preferred));

  const layoutPick = await vscode.window.showQuickPick(layoutItems, {
    placeHolder: t.layoutTitle,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  if (!layoutPick) { return undefined; }

  const excludes = existing?.excludes ?? [];
  switch (layoutPick.layout) {
    case 'single': {
      const kind = guessRepoKind(root).kind || 'app';
      return { layout: 'single', repos: [{ path: '.', kind, name: path.basename(root) }], excludes };
    }
    case 'child': {
      const parentPath = await pickParentPath(root, t, existing?.parentPath ?? probe.parentPath);
      if (parentPath === undefined) { return undefined; }
      const kind = await askKind(t, path.basename(root), existing?.repos[0]?.kind ?? guessRepoKind(root).kind);
      if (!kind) { return undefined; }
      return { layout: 'child', parentPath, repos: [{ path: '.', kind, name: path.basename(root) }], excludes };
    }
    case 'parent': {
      const repos = await pickChildRepos(root, t, probe.children, existing);
      if (!repos) { return undefined; }
      return { layout: 'parent', repos, excludes };
    }
  }
}

/**
 * Multi-select the child repos, then label each one. The label is not
 * decoration: with several children in one blueprint it is the only thing
 * keeping an iOS stack decision apart from a Go one.
 */
async function pickChildRepos(
  root: string,
  t: Copy,
  candidates: RepoCandidate[],
  existing?: DiscoverScope,
): Promise<DiscoverSourceRepo[] | undefined> {
  const declared = new Set((existing?.repos ?? []).map((r) => r.path));
  const items: RepoItem[] = candidates.map((candidate) => ({
    candidate,
    label: `${candidate.isRepo ? '$(repo)' : '$(folder)'} ${candidate.path}`,
    description: [candidate.kind, candidate.isRepo ? 'git' : undefined, candidate.hasBlueprint ? 'blueprint' : undefined]
      .filter(Boolean).join(' · '),
    detail: candidate.manifests.length > 0 ? candidate.manifests.join(', ') : undefined,
    // Re-declaring keeps the previous answer; a first run pre-checks the
    // nested git repos, which are the ones that are almost certainly children.
    picked: declared.size > 0 ? declared.has(candidate.path) : candidate.isRepo,
  }));
  items.push({ browse: true, label: t.browse, alwaysShow: true });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: candidates.length > 0 ? t.pickChildren : t.noChildren,
    canPickMany: true,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });
  if (!picked) { return undefined; }

  const paths: { path: string; name: string; guess: string }[] = [];
  for (const item of picked) {
    if (item.candidate) {
      paths.push({ path: item.candidate.path, name: item.candidate.name, guess: item.candidate.kind });
    }
  }
  if (picked.some((item) => item.browse)) {
    const extra = await browseForRepos(root, t);
    if (extra === undefined) { return undefined; }
    paths.push(...extra);
  }

  const unique = paths.filter((entry, i) => paths.findIndex((p) => p.path === entry.path) === i);
  if (unique.length === 0) {
    void vscode.window.showWarningMessage(t.pickChildrenEmpty);
    return undefined;
  }

  const repos: DiscoverSourceRepo[] = [];
  for (const entry of unique) {
    const previous = existing?.repos.find((r) => r.path === entry.path)?.kind;
    const kind = await askKind(t, entry.name, previous ?? entry.guess);
    if (!kind) { return undefined; }
    repos.push({ path: entry.path, kind, name: entry.name });
  }
  return repos;
}

async function browseForRepos(root: string, t: Copy): Promise<{ path: string; name: string; guess: string }[] | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: true,
    defaultUri: vscode.Uri.file(root),
    openLabel: t.browseTitle,
    title: t.browseTitle,
  });
  if (!picked || picked.length === 0) { return undefined; }
  return picked.map((uri) => {
    const relative = path.relative(root, uri.fsPath).split(path.sep).join('/');
    if (relative.startsWith('..')) { void vscode.window.showInformationMessage(t.outsideRoot); }
    return {
      path: relative === '' ? '.' : relative,
      name: path.basename(uri.fsPath),
      guess: guessRepoKind(uri.fsPath).kind,
    };
  });
}

async function pickParentPath(root: string, t: Copy, suggested?: string): Promise<string | undefined> {
  const items: RepoItem[] = [];
  if (suggested) {
    items.push({ label: `$(repo) ${suggested}`, description: t.detected, candidate: undefined });
  }
  items.push({ browse: true, label: t.browse, alwaysShow: true });

  const picked = await vscode.window.showQuickPick(items, { placeHolder: t.parentPrompt, ignoreFocusOut: true });
  if (!picked) { return undefined; }
  if (!picked.browse && suggested) { return suggested; }

  const chosen = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(path.dirname(root)),
    openLabel: t.parentPrompt,
    title: t.parentPrompt,
  });
  if (!chosen || chosen.length === 0) { return undefined; }
  return path.relative(root, chosen[0].fsPath).split(path.sep).join('/') || '.';
}

async function askKind(t: Copy, name: string, prefill: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    prompt: t.kindPrompt(name),
    placeHolder: t.kindHint,
    value: prefill,
    ignoreFocusOut: true,
    validateInput: (input) => (input.trim() === '' ? t.kindEmpty : undefined),
  });
  return value?.trim() || undefined;
}

/** One line for the toast after a layout is saved. */
export function describeScope(scope: ScopeDraft, lang: Lang): string {
  const repos = scope.repos.map((r) => `${r.path} (${r.kind})`).join(', ');
  const layout = COPY[lang][scope.layout][0];
  return scope.layout === 'child' && scope.parentPath
    ? `${layout} · ${repos} · parent: ${scope.parentPath}`
    : `${layout} · ${repos}`;
}

export const scopeSavedMessage = (scope: ScopeDraft, lang: Lang): string =>
  COPY[lang].saved(describeScope(scope, lang));
