import * as fs from 'fs';
import * as path from 'path';

import {
  InstalledAssetsManifestSchema,
  type InstalledAssetsManifest,
  type StackProfile,
} from './contracts';
import {
  builtinCofofoCatalogRoot,
  selectCatalog,
  type CofofoCatalogSelection,
} from './Catalog';
import { hashFile } from './hash';
import { resolveInside, writeAtomic } from './paths';

const MANIFEST_PATH = '.aidlc/discover/runtime/ecc-assets.json';
const INSTALL_ROOT = '.aidlc/cofofo/vendor/ecc';
const TRANSACTION_ROOT = '.aidlc/cofofo/transactions';
const BACKUP_ROOT = '.aidlc/cofofo/backups';

interface RollbackEntry {
  installedPath: string;
  backupPath?: string;
  created: boolean;
}

interface RollbackTransaction {
  schemaVersion: 1;
  token: string;
  entries: RollbackEntry[];
}

export class CofofoInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CofofoInstallError';
  }
}

export interface CatalogInstallPreview {
  stackId: string;
  catalogRevision: string;
  assets: Array<{
    id: string;
    sourcePath: string;
    installedPath: string;
    action: 'create' | 'replace' | 'unchanged';
    sourceHash: string;
    currentHash?: string;
  }>;
  issues: string[];
}

function token(revision: number): string {
  return `foundation-${revision}-${Date.now().toString(36)}`;
}

function existingManifest(root: string): InstalledAssetsManifest | null {
  const file = path.join(root, MANIFEST_PATH);
  if (!fs.existsSync(file)) return null;
  try { return InstalledAssetsManifestSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { throw new CofofoInstallError(`Existing ${MANIFEST_PATH} is invalid; repair or roll it back before installing.`); }
}

function verifySource(catalogRoot: string, sourcePath: string): string {
  if (!sourcePath.endsWith('.md')) {
    throw new CofofoInstallError(`Executable or non-Markdown catalog asset rejected: ${sourcePath}`);
  }
  const absolute = resolveInside(catalogRoot, sourcePath, true);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new CofofoInstallError(`Catalog asset must be a regular Markdown file: ${sourcePath}`);
  }
  return absolute;
}

/** Read-only install plan used before a reviewer authorizes catalog mutation. */
export function previewCatalogInstall(args: {
  workspaceRoot: string;
  profile: StackProfile;
  catalogRoot?: string;
}): CatalogInstallPreview {
  const root = fs.realpathSync(path.resolve(args.workspaceRoot));
  const selection = selectCatalog(args.profile);
  if (!selection) {
    throw new CofofoInstallError(`CoFoFo catalog selection requires a single detected stack; got ${args.profile.stack?.id ?? args.profile.repositoryKind}.`);
  }
  const catalogRoot = args.catalogRoot ?? builtinCofofoCatalogRoot();
  const ids = new Set<string>();
  const issues: string[] = [];
  const assets: CatalogInstallPreview['assets'] = [];
  for (const asset of selection.assets) {
    if (ids.has(asset.id)) issues.push(`duplicate catalog asset id: ${asset.id}`);
    ids.add(asset.id);
    try {
      const source = verifySource(catalogRoot, asset.sourcePath);
      const installedPath = `${INSTALL_ROOT}/${asset.sourcePath}`;
      const target = resolveInside(root, installedPath);
      const sourceHash = hashFile(source);
      const currentHash = fs.existsSync(target) ? hashFile(target) : undefined;
      assets.push({
        id: asset.id,
        sourcePath: asset.sourcePath,
        installedPath,
        action: currentHash === undefined ? 'create' : currentHash === sourceHash ? 'unchanged' : 'replace',
        sourceHash,
        currentHash,
      });
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const attribution of ['NOTICE.md', 'LICENSE']) {
    try {
      const source = resolveInside(catalogRoot, attribution, true);
      if (!fs.lstatSync(source).isFile()) issues.push(`${attribution}: not a regular attribution file`);
    } catch (error) {
      issues.push(`${attribution}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { stackId: selection.stackId, catalogRevision: selection.revision, assets, issues };
}

export function installCatalog(args: {
  workspaceRoot: string;
  profile: StackProfile;
  foundationRevision: number;
  force?: boolean;
  catalogRoot?: string;
  now?: string;
  /** Optional post-install hook; publish composes workspace from the binding. */
  onInstalled?: (manifest: InstalledAssetsManifest) => void;
}): InstalledAssetsManifest {
  const root = fs.realpathSync(path.resolve(args.workspaceRoot));
  const preview = previewCatalogInstall({
    workspaceRoot: root,
    profile: args.profile,
    catalogRoot: args.catalogRoot,
  });
  if (preview.issues.length) {
    throw new CofofoInstallError(`Catalog audit failed:\n- ${preview.issues.join('\n- ')}`);
  }
  const selection = selectCatalog(args.profile);
  if (!selection) {
    throw new CofofoInstallError(`CoFoFo catalog selection requires a single detected stack; got ${args.profile.stack?.id ?? args.profile.repositoryKind}.`);
  }
  const manifest = installSelection(root, selection, args.foundationRevision, {
    force: args.force,
    catalogRoot: args.catalogRoot ?? builtinCofofoCatalogRoot(),
    now: args.now ?? new Date().toISOString(),
  });
  args.onInstalled?.(manifest);
  return manifest;
}

function installSelection(
  root: string,
  selection: CofofoCatalogSelection,
  foundationRevision: number,
  options: { force?: boolean; catalogRoot: string; now: string },
): InstalledAssetsManifest {
  const previous = existingManifest(root);
  const oldHashes = new Map(previous?.assets.map((asset) => [asset.installedPath, asset.sha256]) ?? []);
  const rollbackToken = token(foundationRevision);
  const entries: RollbackEntry[] = [];
  const installed: InstalledAssetsManifest['assets'] = [];

  for (const asset of selection.assets) {
    const source = verifySource(options.catalogRoot, asset.sourcePath);
    const installedPath = `${INSTALL_ROOT}/${asset.sourcePath}`;
    const target = resolveInside(root, installedPath);
    const created = !fs.existsSync(target);

    if (!created) {
      const previousHash = oldHashes.get(installedPath);
      const currentHash = hashFile(target);
      if (previousHash && currentHash !== previousHash && !options.force) {
        throw new CofofoInstallError(
          `Managed asset drift detected at ${installedPath}. Re-run with force only after reviewing the local edit; a backup will be kept.`,
        );
      }
      const backupPath = `${BACKUP_ROOT}/${rollbackToken}/${installedPath}`;
      const backup = resolveInside(root, backupPath);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(target, backup);
      entries.push({ installedPath, backupPath, created: false });
    } else {
      entries.push({ installedPath, created: true });
    }

    writeAtomic(target, fs.readFileSync(source, 'utf8'));
    installed.push({
      id: asset.id,
      kind: asset.kind,
      sourcePath: asset.sourcePath,
      installedPath,
      sha256: hashFile(target),
      sourceRevision: selection.revision,
      license: selection.license,
      modified: asset.modified,
    });
  }

  const attributionFiles = [
    { sourcePath: 'NOTICE.md', installedPath: `${INSTALL_ROOT}/NOTICE.md` },
    { sourcePath: 'LICENSE', installedPath: `${INSTALL_ROOT}/LICENSE` },
  ];
  for (const attribution of attributionFiles) {
    const source = resolveInside(options.catalogRoot, attribution.sourcePath, true);
    const target = resolveInside(root, attribution.installedPath);
    const created = !fs.existsSync(target);
    if (!created) {
      const backupPath = `${BACKUP_ROOT}/${rollbackToken}/${attribution.installedPath}`;
      const backup = resolveInside(root, backupPath);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(target, backup);
      entries.push({ installedPath: attribution.installedPath, backupPath, created: false });
    } else {
      entries.push({ installedPath: attribution.installedPath, created: true });
    }
    writeAtomic(target, fs.readFileSync(source, 'utf8'));
  }

  const transaction: RollbackTransaction = { schemaVersion: 1, token: rollbackToken, entries };
  writeAtomic(resolveInside(root, `${TRANSACTION_ROOT}/${rollbackToken}.json`), `${JSON.stringify(transaction, null, 2)}\n`);

  const manifest = InstalledAssetsManifestSchema.parse({
    schemaVersion: 1,
    foundationRevision,
    catalogRevision: selection.revision,
    installedAt: options.now,
    rollbackToken,
    assets: installed,
    attribution: {
      noticePath: `${INSTALL_ROOT}/NOTICE.md`,
      noticeHash: hashFile(resolveInside(root, `${INSTALL_ROOT}/NOTICE.md`, true)),
      licensePath: `${INSTALL_ROOT}/LICENSE`,
      licenseHash: hashFile(resolveInside(root, `${INSTALL_ROOT}/LICENSE`, true)),
    },
  });
  writeAtomic(resolveInside(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyInstalledAssets(workspaceRoot: string, manifest?: InstalledAssetsManifest): string[] {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const value = manifest ?? existingManifest(root);
  if (!value) return [`${MANIFEST_PATH}: missing`];
  const issues: string[] = [];
  for (const asset of value.assets) {
    try {
      const file = resolveInside(root, asset.installedPath, true);
      if (!file.endsWith('.md')) issues.push(`${asset.installedPath}: executable/non-Markdown asset`);
      else if (hashFile(file) !== asset.sha256) issues.push(`${asset.installedPath}: hash mismatch`);
      if (asset.sourceRevision !== value.catalogRevision) issues.push(`${asset.installedPath}: catalog revision mismatch`);
    } catch (error) {
      issues.push(`${asset.installedPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const [label, relative, expected] of [
    ['NOTICE', value.attribution.noticePath, value.attribution.noticeHash],
    ['LICENSE', value.attribution.licensePath, value.attribution.licenseHash],
  ] as const) {
    try {
      if (hashFile(resolveInside(root, relative, true)) !== expected) issues.push(`${label}: hash mismatch`);
    } catch { issues.push(`${label}: missing or unsafe`); }
  }
  return issues;
}

export function rollbackCatalog(workspaceRoot: string, rollbackToken: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(rollbackToken)) throw new CofofoInstallError('Invalid rollback token.');
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const transactionPath = resolveInside(root, `${TRANSACTION_ROOT}/${rollbackToken}.json`, true);
  const transaction = JSON.parse(fs.readFileSync(transactionPath, 'utf8')) as RollbackTransaction;
  if (transaction.schemaVersion !== 1 || transaction.token !== rollbackToken || !Array.isArray(transaction.entries)) {
    throw new CofofoInstallError('Invalid rollback transaction.');
  }
  for (const entry of [...transaction.entries].reverse()) {
    const target = resolveInside(root, entry.installedPath);
    if (entry.created) {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } else if (entry.backupPath) {
      const backup = resolveInside(root, entry.backupPath, true);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(backup, target);
    }
  }
}

export { MANIFEST_PATH as COFOFO_INSTALLED_ASSETS_PATH };
