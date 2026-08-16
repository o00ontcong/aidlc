/**
 * Native multi-image picker / paste-writer for the resolve-bugs report.
 * Images land under docs/epics/<runId>/artifacts/bug-screenshots/ so the
 * agent can Read them; the webview only gets filenames + small previews.
 */
import * as path from 'path';
import * as vscode from 'vscode';

import {
  MAX_BUG_IMAGE_BYTES,
  MAX_BUG_IMAGES,
  writeBugScreenshot,
} from './providerRunLogic';

const MAX_PREVIEW_BYTES = 1.5 * 1024 * 1024;

export interface BugImagePick {
  fileName: string;
  relativePath: string;
  byteLength: number;
  previewDataUrl?: string;
}

export interface PickBugImagesReply {
  requestId: string;
  images?: BugImagePick[];
  error?: string;
  cancelled?: boolean;
}

export async function pickBugImages(opts: {
  requestId: string;
  root: string;
  runId: string;
  remaining?: number;
}): Promise<PickBugImagesReply> {
  const remaining = Math.max(0, opts.remaining ?? MAX_BUG_IMAGES);
  if (remaining === 0) {
    return { requestId: opts.requestId, error: 'Đã đạt giới hạn số ảnh.' };
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: false,
    canSelectFiles: true,
    canSelectMany: true,
    openLabel: 'Chèn ảnh',
    filters: {
      Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    },
  });
  if (!picked || picked.length === 0) {
    return { requestId: opts.requestId, cancelled: true };
  }
  try {
    const images: BugImagePick[] = [];
    for (const uri of picked.slice(0, remaining)) {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_BUG_IMAGE_BYTES) {
        return {
          requestId: opts.requestId,
          error: `${path.basename(uri.fsPath)} is ${formatBytes(stat.size)} — limit is ${formatBytes(MAX_BUG_IMAGE_BYTES)} each.`,
        };
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      images.push(toPick(writeBugScreenshot(
        opts.root,
        opts.runId,
        path.basename(uri.fsPath),
        bytes,
      ), bytes));
    }
    return { requestId: opts.requestId, images };
  } catch (err) {
    return { requestId: opts.requestId, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function savePastedBugImage(opts: {
  requestId: string;
  root: string;
  runId: string;
  fileName: string;
  mime: string;
  base64: string;
}): Promise<PickBugImagesReply> {
  try {
    const bytes = Buffer.from(opts.base64, 'base64');
    if (bytes.byteLength === 0) {
      return { requestId: opts.requestId, error: 'Empty image data.' };
    }
    if (bytes.byteLength > MAX_BUG_IMAGE_BYTES) {
      return {
        requestId: opts.requestId,
        error: `Image is ${formatBytes(bytes.byteLength)} — limit is ${formatBytes(MAX_BUG_IMAGE_BYTES)}.`,
      };
    }
    const ext = extForMime(opts.mime);
    const name = opts.fileName.trim() || `paste.${ext}`;
    const saved = writeBugScreenshot(opts.root, opts.runId, name, bytes);
    const previewDataUrl = bytes.byteLength <= MAX_PREVIEW_BYTES
      ? `data:${opts.mime || 'image/png'};base64,${opts.base64}`
      : undefined;
    return {
      requestId: opts.requestId,
      images: [{
        fileName: saved.fileName,
        relativePath: saved.relativePath,
        byteLength: bytes.byteLength,
        previewDataUrl,
      }],
    };
  } catch (err) {
    return { requestId: opts.requestId, error: err instanceof Error ? err.message : String(err) };
  }
}

function toPick(
  saved: { fileName: string; relativePath: string },
  bytes: Uint8Array,
): BugImagePick {
  return {
    fileName: saved.fileName,
    relativePath: saved.relativePath,
    byteLength: bytes.byteLength,
    previewDataUrl: bytes.byteLength <= MAX_PREVIEW_BYTES
      ? dataUrlFor(saved.fileName, bytes)
      : undefined,
  };
}

function dataUrlFor(fileName: string, bytes: Uint8Array): string {
  const ext = path.extname(fileName).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.gif' ? 'image/gif'
    : ext === '.webp' ? 'image/webp'
    : 'image/png';
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') { return 'jpg'; }
  if (mime === 'image/gif') { return 'gif'; }
  if (mime === 'image/webp') { return 'webp'; }
  return 'png';
}

function formatBytes(n: number): string {
  if (n < 1024) { return `${n} B`; }
  if (n < 1024 * 1024) { return `${(n / 1024).toFixed(1)} KB`; }
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
