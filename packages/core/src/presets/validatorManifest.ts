/**
 * Shared manifest plumbing for `.aidlc/validators/` (auto-review runner
 * modules) plus the human-facing reconciliation API for pending
 * `<name>.aidlc-new` conflicts.
 *
 * `writeBuiltinAutoReviewValidators` (builtinWorkflows.ts) uses the
 * load/save/hash helpers to decide whether an installed validator can be
 * silently upgraded or needs a `.aidlc-new` sidecar written for a human to
 * reconcile. `listValidatorConflicts` / `resolveValidatorConflict` are the
 * other side of that same mechanism: they let the CLI and the VS Code
 * extension ask the human directly (keep mine / accept bundled) instead of
 * leaving `.aidlc-new` files for manual filesystem surgery.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Prefix of the error emitted when a provider-managed task lacks validators
 * when conflicts are pending. The CLI and extension match on this to offer a
 * "resolve validator conflicts" action instead of just surfacing raw text.
 */
export const VALIDATOR_RECONCILIATION_ERROR_PREFIX = 'Validator upgrades need human reconciliation';

export interface ValidatorManifestEntry {
  installedHash: string;
  bundledHash: string;
  customized?: boolean;
}

export interface ValidatorManifest {
  schemaVersion: 1;
  files: Record<string, ValidatorManifestEntry>;
}

export function validatorsDirFor(root: string): string {
  return path.join(root, '.aidlc', 'validators');
}

export function validatorManifestPath(validatorsDir: string): string {
  return path.join(validatorsDir, '.aidlc-validator-manifest.json');
}

export function hashValidatorContent(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

/** Load the manifest for a `.aidlc/validators/` dir, or a fresh empty one. */
export function loadValidatorManifest(validatorsDir: string): ValidatorManifest {
  const manifestPath = validatorManifestPath(validatorsDir);
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ValidatorManifest;
      if (parsed.schemaVersion === 1 && parsed.files && typeof parsed.files === 'object') return parsed;
    } catch { /* fall through to a fresh manifest */ }
  }
  return { schemaVersion: 1, files: {} };
}

export function saveValidatorManifest(validatorsDir: string, manifest: ValidatorManifest): void {
  fs.mkdirSync(validatorsDir, { recursive: true });
  const manifestPath = validatorManifestPath(validatorsDir);
  const temp = `${manifestPath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, manifestPath);
}

/** One pending `<name>.aidlc-new` conflict awaiting human reconciliation. */
export interface ValidatorConflict {
  /** Path relative to `.aidlc/validators/`, e.g. `ship.mjs`. */
  rel: string;
  /** Currently-installed validator content — what actually runs today. */
  installed: string;
  /** Bundled replacement offered for reconciliation. */
  proposed: string;
  /** Absolute path to the installed file. */
  installedPath: string;
  /** Absolute path to the `.aidlc-new` sidecar file. */
  conflictPath: string;
}

/**
 * List every pending validator reconciliation in a workspace — i.e. every
 * `.aidlc/validators/<name>.aidlc-new` sidecar that `writeBuiltinAutoReviewValidators`
 * wrote because the installed file diverged from its bundled replacement.
 * Read-only. Provider-managed task validation blocks execution when
 * execution while this list is non-empty; the CLI/extension use it to ask
 * the human which side to keep.
 */
export function listValidatorConflicts(root: string): ValidatorConflict[] {
  const validatorsDir = validatorsDirFor(root);
  if (!fs.existsSync(validatorsDir)) return [];
  return fs.readdirSync(validatorsDir)
    .filter((name) => name.endsWith('.aidlc-new'))
    .map((name) => {
      const conflictPath = path.join(validatorsDir, name);
      const installedPath = conflictPath.slice(0, -'.aidlc-new'.length);
      return {
        rel: path.relative(validatorsDir, installedPath).split(path.sep).join('/'),
        installed: fs.existsSync(installedPath) ? fs.readFileSync(installedPath, 'utf8') : '',
        proposed: fs.readFileSync(conflictPath, 'utf8'),
        installedPath,
        conflictPath,
      };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * Resolve one pending conflict once a human has decided:
 *   - `'keep'`   — discard the bundled suggestion, keep the installed file.
 *                  Recorded as a reviewed customization so this exact
 *                  bundled revision won't be re-offered; a future bundle
 *                  change surfaces a fresh conflict.
 *   - `'accept'` — overwrite the installed file with the bundled content and
 *                  clear the customization flag, matching a fresh install.
 * No-op if there is no pending conflict for `rel`.
 */
export function resolveValidatorConflict(
  root: string,
  rel: string,
  resolution: 'keep' | 'accept',
): void {
  const validatorsDir = validatorsDirFor(root);
  const installedPath = path.join(validatorsDir, rel);
  const conflictPath = `${installedPath}.aidlc-new`;
  if (!fs.existsSync(conflictPath)) return;
  const proposed = fs.readFileSync(conflictPath, 'utf8');
  const bundledHash = hashValidatorContent(proposed);
  const manifest = loadValidatorManifest(validatorsDir);

  if (resolution === 'accept') {
    fs.writeFileSync(installedPath, proposed, 'utf8');
    manifest.files[rel] = { installedHash: bundledHash, bundledHash };
  } else {
    const installedHash = hashValidatorContent(
      fs.existsSync(installedPath) ? fs.readFileSync(installedPath, 'utf8') : '',
    );
    manifest.files[rel] = { installedHash, bundledHash, customized: true };
  }
  fs.unlinkSync(conflictPath);
  saveValidatorManifest(validatorsDir, manifest);
}
