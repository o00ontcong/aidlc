/**
 * `ast-graph scan` driver — runs the CLI in the background, parses its
 * stdout/stderr for the summary line, and exposes a debounced rescan
 * trigger so file saves keep the graph fresh.
 *
 * DB layout: `<workspaceFolder>/.ast-graph/graph.db` (the CLI's default,
 * kept so anyone running ast-graph manually in the workspace hits the
 * same file). We auto-append `.ast-graph/` to the workspace `.gitignore`
 * to avoid committing the binary db.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile, type ExecFileException } from 'child_process';

/** Watched source extensions — matches the languages ast-graph parses. */
const WATCH_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs,py,rs,cs,java,go}';
/** Directories we never re-scan on save (skip noise that would loop). */
const IGNORE_DIR_RE = /(^|[\\/])(node_modules|dist|out|build|target|\.next|\.git|\.ast-graph)([\\/]|$)/;

/**
 * `ast-graph scan` (CLI v0.3.0) takes no `--ignore`/`--exclude` flag and
 * doesn't reliably honor `.gitignore` for dependency directories — on a
 * real project this let `node_modules/` alone account for 92% of all
 * scanned nodes (115k/125k), burying the project's own symbols under
 * generic library internals (TypeScript, Vite, React-DOM…) badly enough
 * that `search`/`symbol` queries read as if the graph had no useful
 * content. We can't fix the scanner itself (separate upstream binary),
 * so we prune these paths out of `graph.db` after every scan instead.
 */
const VENDOR_PATH_SQL = [
  "file_path LIKE '%/node_modules/%'", "file_path LIKE 'node_modules/%'",
  "file_path LIKE '%/venv/%'", "file_path LIKE 'venv/%'",
  "file_path LIKE '%/.venv/%'", "file_path LIKE '.venv/%'",
  "file_path LIKE '%/__pycache__/%'",
].join(' OR ');

export interface ScanSummary {
  files: number;
  nodes: number;
  edges: number;
  languages: string[];
  /** Wall-clock ms for the scan. */
  durationMs: number;
  /** Unix ms when the scan finished. */
  finishedAt: number;
  /** Raw db path the CLI wrote into. */
  dbPath: string;
}

export interface ScanError {
  kind: 'scan-error';
  message: string;
}

export function dbPathFor(folder: vscode.WorkspaceFolder): string {
  return path.join(folder.uri.fsPath, '.ast-graph', 'graph.db');
}

export async function ensureGitignoreEntry(folder: vscode.WorkspaceFolder): Promise<void> {
  const gi = path.join(folder.uri.fsPath, '.gitignore');
  let body = '';
  try {
    body = await fs.promises.readFile(gi, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return;
  }
  const lines = body.split(/\r?\n/);
  if (lines.some((l) => l.trim() === '.ast-graph/' || l.trim() === '.ast-graph')) return;

  // Don't touch a tracked .gitignore that doesn't exist — only create one
  // when there's already a .git folder, otherwise we'd litter random dirs.
  const hasGit = await fs.promises
    .stat(path.join(folder.uri.fsPath, '.git'))
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!hasGit && !body) return;

  const prefix = body && !body.endsWith('\n') ? '\n' : '';
  await fs.promises.writeFile(gi, `${body}${prefix}.ast-graph/\n`, 'utf8');
}

interface ScanOpts {
  binPath: string;
  folder: vscode.WorkspaceFolder;
  clean?: boolean;
  output: vscode.OutputChannel;
}

/**
 * Run `ast-graph scan` once. Resolves with parsed stats on success;
 * rejects with a human-readable Error on failure. The CLI writes
 * progress to stderr (tracing logs) — we ignore those and parse stdout
 * for the "Graph Summary" block emitted at the end.
 */
export async function runScan(opts: ScanOpts): Promise<ScanSummary> {
  const { binPath, folder, clean, output } = opts;
  const dbPath = dbPathFor(folder);
  // The CLI assumes the db's parent directory already exists — it
  // doesn't run `mkdir -p` before SQLite opens the file, so a fresh
  // workspace fails with "unable to open database file" without this.
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });

  const args = ['--db', dbPath, 'scan'];
  if (clean) args.push('--clean');
  args.push(folder.uri.fsPath);

  output.appendLine(`ast-graph: ${binPath} ${args.join(' ')}`);

  const started = Date.now();
  return new Promise<ScanSummary>((resolve, reject) => {
    execFile(
      binPath,
      args,
      {
        timeout: 10 * 60 * 1000, // 10 min ceiling — guard against runaway scans
        maxBuffer: 32 * 1024 * 1024,
        cwd: folder.uri.fsPath,
      },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - started;
        if (err) {
          const e = err as ExecFileException;
          if (e.code === 'ENOENT') {
            reject(new Error(`ast-graph binary not found at ${binPath}`));
            return;
          }
          // Surface CLI tail so the user sees what went wrong without
          // having to dig into the Output channel.
          const tail = (stderr || stdout || '').split(/\r?\n/).slice(-6).join('\n');
          reject(new Error(`ast-graph scan failed (exit ${e.code ?? 'n/a'}): ${tail.trim()}`));
          return;
        }
        const summary = parseSummary(stdout);
        if (!summary) {
          reject(new Error('ast-graph scan: could not parse summary from stdout. Tail: ' + stdout.split(/\r?\n/).slice(-4).join(' | ')));
          return;
        }
        pruneVendorPaths(dbPath, output)
          .then(() => recomputeCountsAfterPrune(dbPath, summary))
          .then((counts) => {
            resolve({ ...summary, ...counts, durationMs, finishedAt: Date.now(), dbPath });
          });
      },
    );
  });
}

/**
 * Delete node_modules/venv/__pycache__ rows from an existing graph.db via
 * the system `sqlite3` CLI. A naive `DELETE FROM nodes WHERE …` at this
 * scale (100k+ matching rows) takes minutes, because the `nodes_fts_ad`
 * trigger re-syncs the FTS5 index once per deleted row; dropping that
 * trigger, clearing the FTS/edge rows explicitly, then recreating it
 * brings the whole pass down to ~1s (measured on a 125k-node graph).
 *
 * Best-effort: if `sqlite3` isn't on PATH, this silently no-ops (logged
 * to the output channel) rather than failing the scan — pruning improves
 * query quality, it isn't required for the scan to have succeeded.
 */
function pruneVendorPaths(dbPath: string, output: vscode.OutputChannel): Promise<void> {
  const sql = `
DROP TRIGGER IF EXISTS nodes_fts_ad;
DELETE FROM symbol_fts WHERE id IN (SELECT id FROM nodes WHERE ${VENDOR_PATH_SQL});
DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE ${VENDOR_PATH_SQL}) OR target_id IN (SELECT id FROM nodes WHERE ${VENDOR_PATH_SQL});
DELETE FROM nodes WHERE ${VENDOR_PATH_SQL};
DELETE FROM file_hashes WHERE ${VENDOR_PATH_SQL};
CREATE TRIGGER IF NOT EXISTS nodes_fts_ad AFTER DELETE ON nodes BEGIN DELETE FROM symbol_fts WHERE id = OLD.id; END;
`;
  return new Promise((resolve) => {
    const child = execFile(
      'sqlite3',
      [dbPath],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          output.appendLine(`ast-graph: vendor-path prune skipped (${err.message}${stderr ? ` — ${stderr.toString().trim()}` : ''}).`);
        }
        resolve();
      },
    );
    child.stdin?.end(sql);
  });
}

/** Files/nodes/edges shrink after pruning — re-count so the status bar and report reflect reality instead of the CLI's pre-prune numbers. */
function recomputeCountsAfterPrune(
  dbPath: string,
  fallback: { files: number; nodes: number; edges: number },
): Promise<{ files: number; nodes: number; edges: number }> {
  const sql = `.mode list
SELECT COUNT(*) FROM nodes WHERE kind = 'File';
SELECT COUNT(*) FROM nodes;
SELECT COUNT(*) FROM edges;
`;
  return new Promise((resolve) => {
    const child = execFile(
      'sqlite3',
      [dbPath],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) { resolve(fallback); return; }
        const [files, nodes, edges] = stdout
          .split(/\r?\n/)
          .filter((l) => l.length > 0)
          .map((l) => parseInt(l, 10));
        if ([files, nodes, edges].some((n) => Number.isNaN(n))) { resolve(fallback); return; }
        resolve({ files, nodes, edges });
      },
    );
    child.stdin?.end(sql);
  });
}

/** Parse the "Graph Summary:" block emitted by `ast-graph scan`. */
function parseSummary(stdout: string): Omit<ScanSummary, 'durationMs' | 'finishedAt' | 'dbPath'> | null {
  const lines = stdout.split(/\r?\n/);
  let files = 0, nodes = 0, edges = 0;
  let langs: string[] = [];
  let inSummary = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('Graph Summary')) { inSummary = true; continue; }
    if (!inSummary) continue;
    const m = /^(\w+):\s+(.+)$/.exec(line);
    if (!m) continue;
    switch (m[1]) {
      case 'Files': files = parseInt(m[2], 10) || 0; break;
      case 'Nodes': nodes = parseInt(m[2], 10) || 0; break;
      case 'Edges': edges = parseInt(m[2], 10) || 0; break;
      case 'Languages': {
        // "[TypeScript, Python]" — strip brackets, split commas.
        langs = m[2].replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
        break;
      }
    }
  }
  if (!inSummary) return null;
  return { files, nodes, edges, languages: langs };
}

interface WatcherOpts {
  folder: vscode.WorkspaceFolder;
  debounceMs: number;
  onTrigger: () => void;
}

/**
 * Create a debounced file watcher across all source languages
 * ast-graph understands. Returns a disposable that tears down the
 * watcher and pending timer.
 */
export function createSourceWatcher(opts: WatcherOpts): vscode.Disposable {
  const pattern = new vscode.RelativePattern(opts.folder, WATCH_GLOB);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  let timer: NodeJS.Timeout | null = null;

  const fire = (uri: vscode.Uri) => {
    if (IGNORE_DIR_RE.test(uri.fsPath)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      opts.onTrigger();
    }, opts.debounceMs);
  };

  watcher.onDidChange(fire);
  watcher.onDidCreate(fire);
  watcher.onDidDelete(fire);

  return {
    dispose() {
      if (timer) clearTimeout(timer);
      watcher.dispose();
    },
  };
}

// Git refs whose change means the working tree just moved to a different state:
//   HEAD       — branch switch / checkout / detach
//   ORIG_HEAD  — written before merge / rebase / reset / pull
//   MERGE_HEAD — present during a merge (incl. pull)
// A change to any of these = "code changed via git" → do a full/clean rescan
// (branch switch / merge / pull can add / remove / rename many files, which an
// incremental pass may not fully reconcile).
const GIT_WATCH_GLOB = '.git/{HEAD,ORIG_HEAD,MERGE_HEAD}';

/**
 * Watch the primary folder's git refs and fire (debounced) on branch switch,
 * merge, rebase, reset, or pull. Separate from the source watcher so these can
 * trigger a clean rescan. No-op safe when the folder isn't a git repo (the
 * watcher just never fires).
 */
export function createGitWatcher(opts: WatcherOpts): vscode.Disposable {
  const pattern = new vscode.RelativePattern(opts.folder, GIT_WATCH_GLOB);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  let timer: NodeJS.Timeout | null = null;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      opts.onTrigger();
    }, opts.debounceMs);
  };

  watcher.onDidChange(fire);
  watcher.onDidCreate(fire);
  watcher.onDidDelete(fire);

  return {
    dispose() {
      if (timer) clearTimeout(timer);
      watcher.dispose();
    },
  };
}

/**
 * Run a short auxiliary command against an existing graph (e.g.
 * `hotspots`, `stats`, `routes`) and return stdout. 20s timeout —
 * these are read-only queries that should answer near-instantly.
 */
export function runReadCommand(
  binPath: string,
  dbPath: string,
  args: string[],
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binPath,
      ['--db', dbPath, ...args],
      { timeout: 20_000, maxBuffer: 8 * 1024 * 1024, cwd },
      (err, stdout, stderr) => {
        if (err) {
          const tail = (stderr || stdout || '').split(/\r?\n/).slice(-4).join(' | ');
          reject(new Error(`ast-graph ${args.join(' ')} failed: ${tail || err.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export interface SymbolRef {
  name: string;
  kind?: string;
  file?: string;
  line?: number;
}

export interface SymbolDetail {
  name: string;
  kind: string;
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  signature?: string;
  callers: SymbolRef[];
  callees: SymbolRef[];
  members: SymbolRef[];
}

/**
 * Look up a symbol by name via `ast-graph symbol "<name>"` and parse
 * the box-drawing tree output into a structured object the webview
 * can render. Partial names are supported by the CLI (it auto-disambiguates
 * by picking the first match, or lists candidates if too many).
 */
export async function lookupSymbol(
  binPath: string,
  dbPath: string,
  name: string,
  cwd: string,
): Promise<SymbolDetail | null> {
  const stdout = await runReadCommand(binPath, dbPath, ['symbol', name], cwd);
  return parseSymbolOutput(stdout);
}

/** Exposed for tests; not part of the public surface. */
export function parseSymbolOutput(stdout: string): SymbolDetail | null {
  // Drop ANSI + tracing logs the same way the report webview does.
  const lines = stdout
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .filter((l) => !/^\d{4}-\d{2}-\d{2}T.*?(INFO|WARN|ERROR|DEBUG)/.test(l));

  const detail: SymbolDetail = {
    name: '',
    kind: '',
    callers: [],
    callees: [],
    members: [],
  };

  type Section = 'header' | 'callers' | 'callees' | 'members';
  let section: Section = 'header';
  let foundHeader = false;

  for (const raw of lines) {
    // Strip the leading box-drawing prefix once, then trim.
    const stripped = raw.replace(/^[│├└┌─\s]+/, '');
    const line = stripped.trim();
    if (!line) continue;

    if (!foundHeader) {
      // First non-blank line should be the header: `Name [Kind]`
      const m = /^(.+?)\s+\[([^\]]+)\]\s*$/.exec(line);
      if (m) {
        detail.name = m[1];
        detail.kind = m[2];
        foundHeader = true;
        continue;
      }
      // Some CLI versions print "Found N matches:" before the tree; skip those.
      continue;
    }

    // Section dividers come on the original lines (with ├─ / └─ prefix).
    const sectionMatch = /^(Callers|Calls|Members)\s*\((\d+)\)\s*:?$/i.exec(line);
    if (sectionMatch) {
      const tag = sectionMatch[1].toLowerCase();
      section = tag === 'calls' ? 'callees' : tag === 'callers' ? 'callers' : 'members';
      continue;
    }

    // Header detail lines (still in `header` section).
    if (section === 'header') {
      const fileMatch = /^File:\s+(.+?)\s+L(\d+)(?:-(\d+))?$/.exec(line);
      if (fileMatch) {
        detail.file = fileMatch[1];
        detail.lineStart = parseInt(fileMatch[2], 10);
        if (fileMatch[3]) detail.lineEnd = parseInt(fileMatch[3], 10);
        continue;
      }
      const sigMatch = /^Sig:\s+(.+)$/.exec(line);
      if (sigMatch) {
        detail.signature = sigMatch[1];
        continue;
      }
      continue;
    }

    // Data rows: callers prefixed with ←, callees with →.
    const ref = parseSymbolRef(line);
    if (!ref) continue;
    if (section === 'callers') detail.callers.push(ref);
    else if (section === 'callees') detail.callees.push(ref);
    else detail.members.push(ref);
  }

  if (!foundHeader) return null;
  return detail;
}

function parseSymbolRef(line: string): SymbolRef | null {
  // Examples:
  //   ← LoginComponent.onSubmit @ src/pages/login/login.component.ts L55
  //   → ApiService.post [Method] @ src/core/services/api.service.ts L18
  //   → ApiService.post           (sometimes no location)
  const cleaned = line.replace(/^[←→]\s*/, '').trim();
  if (!cleaned) return null;
  // Try the full form first: name [kind] @ file Lline
  let m = /^(.+?)(?:\s+\[([^\]]+)\])?(?:\s+@\s+(.+?)\s+L(\d+))?$/.exec(cleaned);
  if (!m) return null;
  return {
    name: m[1].trim(),
    kind: m[2],
    file: m[3],
    line: m[4] ? parseInt(m[4], 10) : undefined,
  };
}
