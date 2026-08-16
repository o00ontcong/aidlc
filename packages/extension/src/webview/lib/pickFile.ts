/**
 * Webview-side wrapper for the host's `pickAndReadTextFile` helper.
 * Posts a `pickAndReadFile` request and awaits the matching reply by id.
 */
import { postMessage, onHostMessage } from './bridge';

export interface PickFileResult {
  content: string;
  fileName: string;
  byteLength: number;
}

let counter = 0;
function nextRequestId(): string {
  counter += 1;
  return `pf-${Date.now().toString(36)}-${counter}`;
}

export function pickFolder(): Promise<string | null> {
  return new Promise((resolve) => {
    const requestId = nextRequestId();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'pickFolder:reply' || msg.requestId !== requestId) { return; }
      off();
      resolve(typeof msg.folderPath === 'string' && msg.folderPath ? msg.folderPath : null);
    });
    postMessage({ type: 'pickFolder', requestId });
  });
}

export interface BugImageResult {
  fileName: string;
  relativePath: string;
  byteLength: number;
  previewDataUrl?: string;
}

function asBugImages(msg: { images?: unknown }): BugImageResult[] {
  if (!Array.isArray(msg.images)) { return []; }
  return msg.images.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') { return []; }
    const img = raw as Record<string, unknown>;
    if (typeof img.fileName !== 'string' || typeof img.relativePath !== 'string') { return []; }
    return [{
      fileName: img.fileName,
      relativePath: img.relativePath,
      byteLength: typeof img.byteLength === 'number' ? img.byteLength : 0,
      previewDataUrl: typeof img.previewDataUrl === 'string' ? img.previewDataUrl : undefined,
    }];
  });
}

/** Native multi-select image picker; copies into the epic bug-screenshots folder. */
export function pickBugImages(runId: string, remaining: number): Promise<BugImageResult[] | null> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'pickBugImages:reply' || msg.requestId !== requestId) { return; }
      off();
      if (msg.cancelled) { resolve(null); return; }
      if (typeof msg.error === 'string' && msg.error) {
        reject(new Error(msg.error));
        return;
      }
      resolve(asBugImages(msg));
    });
    postMessage({ type: 'pickBugImages', requestId, runId, remaining });
  });
}

/** Persist a pasted/dropped image and return the saved screenshot. */
export function savePastedBugImage(
  runId: string,
  fileName: string,
  mime: string,
  base64: string,
): Promise<BugImageResult> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'savePastedBugImage:reply' || msg.requestId !== requestId) { return; }
      off();
      if (typeof msg.error === 'string' && msg.error) {
        reject(new Error(msg.error));
        return;
      }
      const images = asBugImages(msg);
      if (images.length === 0) {
        reject(new Error('No image returned'));
        return;
      }
      resolve(images[0]);
    });
    postMessage({ type: 'savePastedBugImage', requestId, runId, fileName, mime, base64 });
  });
}

export function pickAndReadFile(): Promise<PickFileResult | null> {
  // null = user cancelled the dialog. Errors throw.
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'pickAndReadFile:reply' || msg.requestId !== requestId) { return; }
      off();
      if (msg.cancelled) { resolve(null); return; }
      if (typeof msg.error === 'string' && msg.error) {
        reject(new Error(msg.error));
        return;
      }
      if (typeof msg.content !== 'string') {
        reject(new Error('No file content returned'));
        return;
      }
      resolve({
        content: msg.content,
        fileName: typeof msg.fileName === 'string' ? msg.fileName : '',
        byteLength: typeof msg.byteLength === 'number' ? msg.byteLength : msg.content.length,
      });
    });
    postMessage({ type: 'pickAndReadFile', requestId });
  });
}
