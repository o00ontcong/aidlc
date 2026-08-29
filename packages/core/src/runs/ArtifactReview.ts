/**
 * Content-addressed review bundles for Canvas gates.
 *
 * A step that declares `review: { mode: 'canvas', artifacts: [...] }` presents
 * exactly those files to a human. This module turns that declaration into a
 * **bundle**: each artifact resolved to a real path inside the workspace and
 * hashed, plus one digest over the whole ordered set. A verdict is later bound
 * to that digest, so "was this approved, and is it still the thing that was
 * approved?" is answerable without keeping any file body around.
 *
 * ## Why the path handling is strict
 *
 * The declared templates come from `workspace.yaml`, but two things widen the
 * surface at resolution time: `{placeholder}` values come from mutable run
 * context, and the resolved paths are handed to a loopback review server that
 * will read them. This module is therefore the last place that can establish
 * every path is a *regular file inside the workspace* — so it refuses
 * traversal, absolute paths, directories, and symlinks rather than following
 * them. `fs.lstat` (not `stat`) is deliberate: a symlink must be rejected, not
 * resolved to whatever it points at.
 *
 * Nothing here mutates state. {@link buildReviewBundle} throws on an unusable
 * declaration so a malformed gate fails loudly; {@link checkBundleCurrent}
 * reports drift so the caller can fail the gate closed.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_EPICS_DIR, resolveArtifactPath } from './RunState';

/** Most files one gate may present. Keeps a review session humanly reviewable. */
export const MAX_REVIEW_ARTIFACTS = 20;

/** Largest single artifact, in bytes. Review documents, not build logs. */
export const MAX_REVIEW_ARTIFACT_BYTES = 1024 * 1024;

/** Largest whole bundle, in bytes. */
export const MAX_REVIEW_TOTAL_BYTES = 4 * 1024 * 1024;

/** Why a declaration could not be turned into a bundle. */
export type ArtifactReviewErrorCode =
  /** A declared artifact does not exist on disk. */
  | 'missing'
  /** The resolved path is absolute, or escapes the workspace root. */
  | 'path-escape'
  /** The path exists but is a directory, symlink, or other non-regular file. */
  | 'not-a-file'
  /** More artifacts than {@link MAX_REVIEW_ARTIFACTS}, or none at all. */
  | 'too-many'
  /** An artifact or the bundle exceeds its byte cap. */
  | 'too-large';

export class ArtifactReviewError extends Error {
  constructor(
    message: string,
    public readonly code: ArtifactReviewErrorCode,
    /** The offending paths, workspace-relative where one could be resolved. */
    public readonly paths: string[] = [],
  ) {
    super(message);
    this.name = 'ArtifactReviewError';
  }
}

/** One reviewed file, hashed at bundle time. */
export interface ReviewArtifact {
  /** The declaration as written in `review.artifacts`, placeholders intact. */
  template: string;
  /** Workspace-relative path after epics-root rewrite and placeholder substitution. */
  path: string;
  /** `sha256:<hex>` over the file's bytes. */
  hash: string;
  bytes: number;
}

/**
 * The exact set of artifacts presented at one Canvas gate.
 *
 * The binding fields matter as much as the hashes: a bundle built for
 * `stepRevision: 1` must not close a gate that has since been rerun into
 * revision 2, and `reviewRevision` separates successive review rounds on the
 * same revision (each `request_changes` opens a new one).
 */
export interface ReviewBundle {
  runId: string;
  stepIdx: number;
  stepRevision: number;
  reviewRevision: number;
  /** ISO-8601 timestamp. Deliberately outside `bundleHash`. */
  builtAt: string;
  artifacts: ReviewArtifact[];
  /**
   * `sha256:<hex>` over the ordered `(path, hash)` pairs. Order-sensitive, so
   * two artifacts whose contents were swapped produce a different digest.
   */
  bundleHash: string;
}

/** An artifact that no longer matches what was bundled. */
export interface StaleArtifact {
  path: string;
  reason:
    /** Content differs from the bundled hash. */
    | 'changed'
    /** Deleted since bundling. */
    | 'missing'
    /** Still present but no longer a readable regular file (e.g. now a symlink). */
    | 'unreadable';
  expectedHash: string;
  /** Present only for `changed` — there is nothing to hash otherwise. */
  actualHash?: string;
}

function sha256(buf: Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
}

/**
 * Digest over the ordered `(path, hash)` pairs.
 *
 * Excludes `builtAt` so rebuilding an unchanged bundle yields the same digest —
 * otherwise every rebuild would read as a content change. Includes the path and
 * is order-sensitive, so neither reordering nor swapping two files' contents
 * collides.
 */
function computeBundleHash(artifacts: ReviewArtifact[]): string {
  const digest = crypto.createHash('sha256');
  for (const artifact of artifacts) {
    digest.update(artifact.path);
    digest.update('\0');
    digest.update(artifact.hash);
    digest.update('\n');
  }
  return `sha256:${digest.digest('hex')}`;
}

/** True when `abs` is `root` itself or lies beneath it. */
function contains(root: string, abs: string): boolean {
  return abs === root || abs.startsWith(root + path.sep);
}

/**
 * Resolve one declared template to an absolute path, refusing anything that
 * leaves the workspace. Returns the workspace-relative path alongside it so
 * errors and bundles always speak in relative terms.
 */
function resolveInsideWorkspace(
  workspaceRoot: string,
  template: string,
  context: Record<string, string>,
  epicsDir: string,
): { rel: string; abs: string } {
  const rel = resolveArtifactPath(template, context, epicsDir);
  const root = path.resolve(workspaceRoot);

  if (path.isAbsolute(rel)) {
    throw new ArtifactReviewError(
      `Review artifact "${template}" resolved to an absolute path (${rel}); only workspace-relative paths are reviewable.`,
      'path-escape',
      [rel],
    );
  }

  const abs = path.resolve(root, rel);
  if (!contains(root, abs)) {
    throw new ArtifactReviewError(
      `Review artifact "${template}" resolved outside the workspace (${rel}).`,
      'path-escape',
      [rel],
    );
  }
  return { rel, abs };
}

/**
 * Read one artifact, establishing that it is a regular file inside the
 * workspace. `lstat` refuses a symlink rather than following it, and the
 * post-`realpath` containment re-check catches a symlinked *intermediate*
 * directory that `path.resolve` alone cannot see through.
 */
function readArtifact(
  workspaceRoot: string,
  template: string,
  rel: string,
  abs: string,
): ReviewArtifact {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(abs);
  } catch {
    throw new ArtifactReviewError(
      `Review artifact "${rel}" does not exist — the step must produce it before its gate can open.`,
      'missing',
      [rel],
    );
  }

  if (!stat.isFile()) {
    throw new ArtifactReviewError(
      `Review artifact "${rel}" is not a regular file (symlinks and directories are not reviewable).`,
      'not-a-file',
      [rel],
    );
  }

  if (stat.size > MAX_REVIEW_ARTIFACT_BYTES) {
    throw new ArtifactReviewError(
      `Review artifact "${rel}" is ${stat.size} bytes, over the ${MAX_REVIEW_ARTIFACT_BYTES}-byte cap.`,
      'too-large',
      [rel],
    );
  }

  // A symlinked directory anywhere in the path would otherwise smuggle the
  // leaf out of the tree. Both sides are realpath'd so a workspace root that
  // itself sits behind a symlink still compares equal.
  const realRoot = fs.realpathSync(path.resolve(workspaceRoot));
  const realAbs = fs.realpathSync(abs);
  if (!contains(realRoot, realAbs)) {
    throw new ArtifactReviewError(
      `Review artifact "${rel}" resolves outside the workspace through a symlinked directory.`,
      'path-escape',
      [rel],
    );
  }

  return { template, path: rel, hash: sha256(fs.readFileSync(abs)), bytes: stat.size };
}

/**
 * Build the bundle for one Canvas gate.
 *
 * Throws {@link ArtifactReviewError} on any unusable declaration — a gate that
 * cannot be built must not silently open. File bodies are hashed and dropped;
 * the returned bundle is safe to persist in run state.
 */
export function buildReviewBundle(args: {
  workspaceRoot: string;
  runId: string;
  stepIdx: number;
  stepRevision: number;
  reviewRevision: number;
  /** Declared `review.artifacts` templates, in display order. */
  artifacts: string[];
  /** Run context, for `{placeholder}` substitution. */
  context: Record<string, string>;
  /** Workspace's active epics root. Defaults to the conventional one. */
  epicsDir?: string;
  builtAt?: string;
}): ReviewBundle {
  const {
    workspaceRoot,
    runId,
    stepIdx,
    stepRevision,
    reviewRevision,
    artifacts: templates,
    context,
    epicsDir = DEFAULT_EPICS_DIR,
    builtAt = new Date().toISOString(),
  } = args;

  if (templates.length === 0) {
    throw new ArtifactReviewError('A Canvas gate must review at least one artifact.', 'too-many');
  }
  if (templates.length > MAX_REVIEW_ARTIFACTS) {
    throw new ArtifactReviewError(
      `A Canvas gate may review at most ${MAX_REVIEW_ARTIFACTS} artifacts; ${templates.length} were declared.`,
      'too-many',
    );
  }

  const artifacts: ReviewArtifact[] = [];
  let total = 0;
  for (const template of templates) {
    const { rel, abs } = resolveInsideWorkspace(workspaceRoot, template, context, epicsDir);
    const artifact = readArtifact(workspaceRoot, template, rel, abs);
    total += artifact.bytes;
    if (total > MAX_REVIEW_TOTAL_BYTES) {
      throw new ArtifactReviewError(
        `Review bundle exceeds the ${MAX_REVIEW_TOTAL_BYTES}-byte cap at "${rel}".`,
        'too-large',
        [rel],
      );
    }
    artifacts.push(artifact);
  }

  return {
    runId,
    stepIdx,
    stepRevision,
    reviewRevision,
    builtAt,
    artifacts,
    bundleHash: computeBundleHash(artifacts),
  };
}

/**
 * Re-hash a bundle's artifacts and report every one that no longer matches.
 *
 * Returns an empty array when the bundle is still current. Callers treat a
 * non-empty result as fail-closed: an approval recorded against a stale bundle
 * approved something the human never saw.
 */
export function checkBundleCurrent(workspaceRoot: string, bundle: ReviewBundle): StaleArtifact[] {
  const root = path.resolve(workspaceRoot);
  let realRoot: string;
  try { realRoot = fs.realpathSync(root); }
  catch { return bundle.artifacts.map((artifact) => ({ path: artifact.path, reason: 'unreadable', expectedHash: artifact.hash })); }
  const stale: StaleArtifact[] = [];

  for (const artifact of bundle.artifacts) {
    const abs = path.resolve(root, artifact.path);

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(abs);
    } catch {
      stale.push({ path: artifact.path, reason: 'missing', expectedHash: artifact.hash });
      continue;
    }

    // A regular file replaced by a symlink is drift, not a hash mismatch —
    // reading through it would hash whatever the link now points at.
    if (!stat.isFile()) {
      stale.push({ path: artifact.path, reason: 'unreadable', expectedHash: artifact.hash });
      continue;
    }

    // Re-check the complete path at verdict time. A parent directory can be
    // swapped for a symlink after bundling while the leaf still lstats as a
    // regular file; hashing it would otherwise approve bytes outside the
    // workspace.
    try {
      const realAbs = fs.realpathSync(abs);
      if (!contains(realRoot, realAbs)) {
        stale.push({ path: artifact.path, reason: 'unreadable', expectedHash: artifact.hash });
        continue;
      }
    } catch {
      stale.push({ path: artifact.path, reason: 'unreadable', expectedHash: artifact.hash });
      continue;
    }

    let actualHash: string;
    try {
      actualHash = sha256(fs.readFileSync(abs));
    } catch {
      stale.push({ path: artifact.path, reason: 'unreadable', expectedHash: artifact.hash });
      continue;
    }

    if (actualHash !== artifact.hash) {
      stale.push({
        path: artifact.path,
        reason: 'changed',
        expectedHash: artifact.hash,
        actualHash,
      });
    }
  }

  return stale;
}
