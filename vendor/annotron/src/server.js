import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { renderMarkdown } from './mdRender.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileP = promisify(execFile);

// A source Markdown artifact is rendered to HTML on the fly; the .md stays the
// source of truth and is what the Save button writes back to.
const isMarkdown = (f) => /\.(md|markdown)$/i.test(f);

// --- Reviewer identity ---------------------------------------------------------
// Who is leaving comments? Prefer the GitHub login (via `gh`), then the git
// user.name/email, then the OS user@hostname. Computed once and cached — this is
// a single-user local tool. PATH is augmented so `gh`/`git` resolve even when
// the server was spawned from a GUI (Dock) with a minimal PATH.
let _identityPromise = null;
function identityEnv() {
  const home = process.env.HOME || '';
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', `${home}/.local/bin`].filter(Boolean).join(':');
  return { ...process.env, PATH: `${process.env.PATH || ''}:${extra}` };
}
async function runId(cmd, args, cwd) {
  try {
    const { stdout } = await execFileP(cmd, args, { cwd, timeout: 2500, env: identityEnv() });
    return stdout.toString().trim();
  } catch { return ''; }
}
async function computeIdentity(cwd) {
  const [gitName, gitEmail, login] = await Promise.all([
    runId('git', ['config', 'user.name'], cwd),
    runId('git', ['config', 'user.email'], cwd),
    runId('gh', ['api', 'user', '--jq', '.login'], cwd),
  ]);
  let user = '', host = '';
  try { user = os.userInfo().username; } catch {}
  try { host = os.hostname().replace(/\.local$/, ''); } catch {}
  const name = login || gitName || user || 'Reviewer';
  const userHost = user && host ? `${user}@${host}` : (host || user);
  const detail = login ? (gitEmail || userHost) : (gitEmail || userHost);
  return { name, detail, login, gitName, gitEmail, user, host };
}
function getIdentity(cwd) {
  if (!_identityPromise) _identityPromise = computeIdentity(cwd);
  return _identityPromise;
}

const PORT = parseInt(process.env.ANNOTRON_PORT || '7321', 10);
const HOST = process.env.ANNOTRON_HOST || '127.0.0.1';

// --- State ---
const sessions = new Map();   // filePath -> { hash, watchers, sseClients, pollWaiters, agentReplies }
// Formal review gates are keyed by both artifact and bundle. A single Markdown
// file can legitimately be reviewed by multiple in-flight workflow runs.
const formalSessions = new Map(); // `${file}\0${bundleHash}` -> { review }
const allowList = new Set();  // registered canonical paths

function getSession(file) {
  if (!sessions.has(file)) {
    sessions.set(file, {
      hash: null,
      sseClients: new Set(),
      pollWaiters: [],
      pendingFeedback: null,
      finalized: false,
      cancelRequested: false,
      working: false,
      remoteApprove: false,          // route permission prompts to the browser
      autoAllowTools: new Set(),      // tools the user chose "allow always" for
      permWaiters: new Map(),         // requestId -> resolve(decisionObj|null)
      pendingPerms: new Map(),        // requestId -> {tool, summary} (for reconnecting clients)
    });
  }
  return sessions.get(file);
}

// --- File watcher ---
const watchIntervals = new Map();

function watchFile(file) {
  if (watchIntervals.has(file)) return;
  let lastHash = hashFile(file);
  const iv = setInterval(() => {
    const h = hashFile(file);
    if (h && h !== lastHash) {
      lastHash = h;
      const sess = sessions.get(file);
      if (!sess) return;
      // Only trigger reload if not a programmatic finalize write
      if (sess._suppressReload) { sess._suppressReload = false; return; }
      broadcastSSE(file, 'reload', '{}');
    }
  }, 800);
  watchIntervals.set(file, iv);
}

function hashFile(file) {
  try {
    const buf = fs.readFileSync(file);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch { return null; }
}

function sidecarPath(file) {
  const ext = path.extname(file);
  return file.slice(0, -ext.length) + '.annotron.json';
}

function readSidecar(file) {
  try {
    const raw = fs.readFileSync(sidecarPath(file), 'utf8');
    return JSON.parse(raw);
  } catch { return { version: 1, annotations: [], rounds: [] }; }
}

function writeSidecar(file, data) {
  fs.writeFileSync(sidecarPath(file), JSON.stringify(data, null, 2), 'utf8');
}

// --- Formal review mode ---
//
// A session registered with `review` metadata is an approval gate, not the
// freeform annotate-and-auto-apply loop. Two things follow, and both are
// enforced here rather than in the browser, because the browser is only one of
// the clients: the reviewed bytes must not move under the reviewer, and nothing
// except a typed verdict may close the gate.
const FORMAL_REFUSAL =
  'refused: this is a formal review session — the reviewed content is read-only '
  + 'and only a /verdict can close the gate';

/** The review metadata for a formal session, or `null` for a freeform one. */
function formalReview(file) {
  if (sessions.get(file)?.review) return sessions.get(file).review;
  return [...formalSessions.entries()]
    .find(([key, session]) => key.startsWith(`${file}\0`) && session.review)?.[1]?.review ?? null;
}

function formalSessionKey(file, bundleHash) {
  return `${file}\0${bundleHash}`;
}

function getFormalSession(file, bundleHash) {
  const key = formalSessionKey(file, bundleHash);
  if (!formalSessions.has(key)) formalSessions.set(key, {});
  return formalSessions.get(key);
}

function formalReviewForGate(file, bundleHash) {
  if (bundleHash) return formalSessions.get(formalSessionKey(file, bundleHash))?.review ?? null;
  // Legacy single-gate clients did not send `gate`. Keep them working only
  // when there is no ambiguity; concurrent gates must name their bundle.
  const matches = [...formalSessions.entries()]
    .filter(([key]) => key.startsWith(`${file}\0`))
    .map(([, session]) => session.review)
    .filter(Boolean);
  // Compatibility only: modern callers must pass gate. Choose the most
  // recently registered formal session so reopening a file shows its new
  // round instead of a stale prior verdict.
  return matches.at(-1) ?? formalReview(file);
}

function sameReviewGate(left, right) {
  return !!left && !!right
    && left.runId === right.runId
    && left.stepIdx === right.stepIdx
    && left.stepRevision === right.stepRevision
    && left.reviewRevision === right.reviewRevision
    && left.bundleHash === right.bundleHash;
}

function gateSessions(review) {
  const matches = [];
  for (const [key, session] of formalSessions) {
    if (sameReviewGate(session.review, review)) {
      const file = key.slice(0, key.lastIndexOf('\0'));
      matches.push([file, session]);
    }
  }
  return matches;
}

/**
 * Prefixed content hash for review binding.
 *
 * Distinct from `hashFile` above, which returns bare hex for change detection:
 * this one carries the `sha256:` prefix the core bundle format uses, and
 * lstat-guards so a file swapped for a symlink reads as drift rather than
 * hashing whatever the link now points at.
 */
function reviewHash(file) {
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Registered artifacts that no longer hash to what was shown.
 *
 * An empty result is the only state in which an approval means anything: it
 * says the reviewer signed off on the bytes still on disk.
 */
function staleArtifacts(review) {
  const stale = [];
  for (const artifact of review.artifacts ?? []) {
    const actual = reviewHash(artifact.path);
    if (actual !== artifact.hash) {
      stale.push({ path: artifact.path, expected: artifact.hash, actual });
    }
  }
  return stale;
}

/**
 * Persist the review (and any verdict) to the sidecar.
 *
 * Memory alone is not enough: a reviewer can walk away mid-gate and this server
 * is a short-lived local process. The sidecar sits beside the artifact rather
 * than inside it, so recording a verdict never changes the hash it is bound to.
 */
function persistReview(file, review) {
  const sidecar = readSidecar(file);
  // The gate token stays in memory only. Writing it beside the artifact would
  // hand it to anything that can read the workspace, which is exactly the reach
  // it is meant to narrow.
  const { token, ...withoutToken } = review;
  sidecar.reviews = sidecar.reviews && typeof sidecar.reviews === 'object' ? sidecar.reviews : {};
  sidecar.reviews[review.bundleHash] = withoutToken;
  // Keep a representative legacy field for freeform/older consumers. Formal
  // reads use reviews[bundleHash], so one gate never overwrites another.
  sidecar.review = withoutToken;
  writeSidecar(file, sidecar);
}

/**
 * Is this request allowed to post a verdict for the gate?
 *
 * The token is a **capability handed to whoever was given the review link**, not
 * proof of identity. It stops an unrelated process on the machine from posting a
 * verdict to a port it merely found open. It does *not* defend against something
 * that can read the workspace: that can hash the artifact, register the same
 * bundle, and obtain a token. Closing that gap needs OS-level scoping — file
 * permissions, or a unix socket with peer credentials — not a shared secret in
 * an HTTP body.
 */
function verdictTokenOk(review, presented) {
  if (!review.token) { return true; }   // gate opened without one (older caller)
  return typeof presented === 'string'
    && presented.length === review.token.length
    && crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(review.token));
}

// --- SSE broadcast ---
function broadcastSSE(file, event, data) {
  const sess = sessions.get(file);
  if (!sess) return;
  const msg = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of sess.sseClients) {
    try { res.write(msg); } catch {}
  }
}

// --- Poll wake ---
function wakePoll(file, payload) {
  const sess = sessions.get(file);
  if (!sess) return;
  for (const resolve of sess.pollWaiters) resolve(payload);
  sess.pollWaiters = [];
}

// --- Hook helpers ---
// Correlate an incoming hook event (which only knows cwd) to the annotron
// session it belongs to. Prefer a session that is actively working; if several,
// disambiguate by cwd containment.
function findActiveSession(cwd) {
  const working = [];
  for (const [f, s] of sessions) if (s.working) working.push([f, s]);
  if (working.length === 0) return null;
  if (working.length === 1) return working[0];
  const norm = cwd ? cwd.replace(/\/+$/, '') + '/' : '';
  const match = norm && working.find(([f]) => f.startsWith(norm));
  return match || working[0];
}

// Like findActiveSession but also matches an idle (non-working) session under
// cwd — used for status events (idle/permission notifications) that arrive when
// the agent is between rounds.
function findSessionByCwd(cwd) {
  const active = findActiveSession(cwd);
  if (active) return active;
  const norm = cwd ? cwd.replace(/\/+$/, '') + '/' : '';
  let best = null;
  for (const [f, s] of sessions) {
    if (!norm || f.startsWith(norm)) best = [f, s];
  }
  return best;
}

// Turn a tool call into a short, CLI-like activity line.
function formatActivity(tool, input) {
  input = input || {};
  const base = p => (typeof p === 'string' ? p.split('/').pop() : '');
  const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : '');
  switch (tool) {
    case 'Read': return `Read ${base(input.file_path)}`;
    case 'Edit':
    case 'MultiEdit': return `Edit ${base(input.file_path)}`;
    case 'Write': return `Write ${base(input.file_path)}`;
    case 'NotebookEdit': return `Edit ${base(input.notebook_path || input.file_path)}`;
    case 'Bash': return `Bash: ${clip(input.command, 70)}`;
    case 'Grep': return `Search "${clip(input.pattern, 40)}"`;
    case 'Glob': return `Find ${clip(input.pattern, 40)}`;
    case 'WebFetch': return `Fetch ${clip(input.url, 50)}`;
    case 'WebSearch': return `Web search "${clip(input.query, 40)}"`;
    case 'Task': return `Delegate: ${clip(input.description, 40)}`;
    default: return tool || 'Working…';
  }
}

// Permission-decision JSON the PreToolUse hook echoes back to Claude Code.
function permJSON(decision, reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  });
}

// --- SDK injection ---
const SDK_PATH = path.join(__dirname, 'sdk.js');
const CHROME_PATH = path.join(__dirname, 'chrome.html');
const CHROME_HTML = fs.readFileSync(CHROME_PATH, 'utf8');

function injectSDK(html) {
  const sdkJs = fs.readFileSync(SDK_PATH, 'utf8');
  const tag = `<script data-annotron="1">\n${sdkJs}\n</script>`;
  if (html.includes('</body>')) return html.replace('</body>', tag + '\n</body>');
  return html + '\n' + tag;
}

// --- Request helpers ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function send(res, status, body, ct = 'application/json') {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

// --- Router ---
async function handler(req, res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method.toUpperCase();
  const pathname = u.pathname;

  // CORS preflight
  if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Annotron-Gate-Token' }); res.end(); return; }

  if (pathname === '/health' && method === 'GET') {
    return send(res, 200, { ok: true });
  }

  if (pathname === '/session' && method === 'POST') {
    const { file, review } = await readBody(req);
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) return send(res, 404, { error: 'file not found' });
    if (!abs.endsWith('.html') && !isMarkdown(abs)) return send(res, 400, { error: 'must be .html or .md' });
    allowList.add(abs);
    const sess = getSession(abs);
    let formal = null;
    /** A verdict this registration discarded because the bundle moved on. */
    let superseded = null;
    // Opt into formal review mode. Absent = the freeform preview/annotate
    // session this server has always served, unchanged.
    if (review && typeof review === 'object') {
      // Re-registering the same gate must not discard a verdict already given:
      // that is the resume path, and a caller reopening a gate to check on it
      // would otherwise silently erase the decision it came to collect. The
      // sidecar is consulted too, so a verdict also survives a restart of this
      // server. A different `bundleHash` is a genuinely different round, and
      // there the verdict *must* be cleared — it was given for other bytes.
      if (typeof review.bundleHash !== 'string' || !review.bundleHash) {
        return send(res, 400, { error: 'formal review requires bundleHash' });
      }
      // A newer rendering of the *same* workflow gate supersedes its previous
      // bundle. Separate runs retain distinct formal sessions even for the
      // same file, which is the concurrency boundary this map exists for.
      for (const [key, candidate] of formalSessions) {
        if (!key.startsWith(`${abs}\0`) || !candidate.review) continue;
        const priorGate = candidate.review;
        if (
          priorGate.bundleHash !== review.bundleHash
          && priorGate.runId === review.runId
          && priorGate.stepIdx === review.stepIdx
          && priorGate.stepRevision === review.stepRevision
          && priorGate.reviewRevision === review.reviewRevision
        ) {
          formalSessions.delete(key);
        }
      }
      formal = getFormalSession(abs, review.bundleHash);
      const sidecar = readSidecar(abs);
      const persisted = sidecar.reviews?.[review.bundleHash] ?? sidecar.review ?? null;
      const prior = formal.review ?? (sameReviewGate(persisted, review) ? persisted : null);
      const liveGate = gateSessions(review).find(([file]) => file !== abs)?.[1]?.review ?? null;
      const sameGate = sameReviewGate(prior, review);
      const shared = liveGate ?? (sameGate ? prior : null);
      formal.review = {
        ...review,
        verdict: shared?.verdict ?? null,
        // Keep the token across a re-register of the same gate, so a browser tab
        // already holding it keeps working — reopening a gate to check on it must
        // not lock out the person reviewing.
        token: shared?.token ?? (review.token ?? null),
      };
      // Report a discarded verdict rather than dropping it silently. This is the
      // "you approved it, then the content changed" case, and a caller that
      // cannot tell it apart from "nobody has decided yet" will show the user a
      // timeout for what is really a superseded decision.
      superseded = !sameGate && prior?.verdict ? prior.verdict : null;
      persistReview(abs, formal.review);
    }
    watchFile(abs);
    return send(res, 200, {
      ok: true,
      file: abs,
      formal: !!formal?.review,
      supersededVerdict: superseded,
      // The effective token, which may be one kept from an earlier register
      // rather than the one just offered.
      token: formal?.review?.token ?? null,
    });
  }

  // The only way to close a formal review gate.
  if (pathname === '/verdict' && method === 'POST') {
    const body = await readBody(req);
    if (!body.file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(body.file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });

    const review = formalReviewForGate(abs, typeof body.gate === 'string' ? body.gate : '');
    if (!review) {
      return send(res, 400, {
        error: 'not a formal review session — register with `review` metadata to open an approval gate',
      });
    }
    // Checked before anything else: an unauthorised caller should learn nothing
    // about the gate's state, not even whether it is already decided.
    if (!verdictTokenOk(review, body.token ?? req.headers['x-annotron-gate-token'])) {
      return send(res, 401, {
        error: 'missing or invalid gate token — a verdict may only be posted from the review link that opened this gate',
      });
    }
    const siblings = gateSessions(review);
    const existingVerdict = siblings.map(([, session]) => session.review?.verdict).find(Boolean);
    if (existingVerdict) {
      return send(res, 409, {
        error: `a "${existingVerdict.verdict}" verdict has already been given for review revision `
          + `${review.reviewRevision} — reopen a new round to decide again`,
      });
    }

    // Exactly two verdicts, spelled exactly one way each. A near-miss is a
    // client bug, and guessing what it meant is how a gate gets closed wrong.
    if (body.verdict !== 'approve' && body.verdict !== 'request-changes') {
      return send(res, 400, { error: 'verdict must be exactly "approve" or "request-changes"' });
    }
    const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim() : '';
    if (!reviewer) {
      return send(res, 400, { error: 'missing reviewer — a verdict must name the human who gave it' });
    }
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
    if (body.verdict === 'request-changes' && !feedback) {
      return send(res, 400, { error: 'request-changes needs feedback saying what to change' });
    }

    // An approval is bound to the bytes that were shown; asking for changes is
    // not, because that content is expected to move next.
    if (body.verdict === 'approve') {
      const stale = staleArtifacts(review);
      if (stale.length > 0) {
        return send(res, 409, {
          error: 'stale: the reviewed content changed after it was shown, so an approval would cover bytes nobody reviewed',
          stale,
        });
      }
    }

    const decided = {
      verdict: body.verdict,
      reviewer,
      at: new Date().toISOString(),
      ...(feedback ? { feedback } : {}),
    };
    // A bundle is one gate even when it renders several files. Persist the
    // decision to every registered artifact atomically in this event loop so
    // a second window cannot record a contradictory verdict.
    for (const [file, session] of siblings) {
      session.review.verdict = decided;
      persistReview(file, session.review);
      broadcastSSE(file, 'verdict', JSON.stringify(decided));
    }
    return send(res, 200, { ok: true, verdict: decided });
  }

  // Read the gate back: its identity (so the caller can bind the verdict to run
  // state) and the verdict if one has landed. `null` until a human decides.
  if (pathname === '/verdict' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const review = formalReviewForGate(abs, u.searchParams.get('gate') ?? '');
    if (!review) return send(res, 400, { error: 'not a formal review session' });
    // Never hand the token back. Reading the gate is open to anything that knows
    // the path; if that also yielded the token, holding one would mean nothing
    // and the whole capability would be decorative.
    const { token, ...safe } = review;
    return send(res, 200, { review: safe, verdict: review.verdict ?? null });
  }

  if (pathname === '/' && method === 'GET') {
    const html = fs.readFileSync(CHROME_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  if (pathname === '/sdk.js' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(SDK_PATH, 'utf8'));
    return;
  }

  if (pathname === '/artifact' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    let raw;
    try { raw = fs.readFileSync(abs, 'utf8'); } catch { return send(res, 404, { error: 'not found' }); }
    // Markdown source is rendered to HTML (with merslim diagrams) on the fly;
    // HTML artifacts are served as-is. Either way the SDK is injected.
    let html;
    if (isMarkdown(abs)) {
      try { html = await renderMarkdown(raw, { title: path.basename(abs) }); }
      catch (e) { return send(res, 500, { error: 'markdown render failed: ' + e.message }); }
    } else {
      html = raw;
    }
    const injected = injectSDK(html);
    // Never cache: the artifact changes as the agent edits it, and the injected
    // SDK changes across versions — a cached copy would serve a stale preview
    // (and stale annotation overlays) even after a reload.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(injected);
    return;
  }

  // Raw Markdown source (for the in-browser editor pane, Markdown mode only).
  if (pathname === '/source' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    if (!isMarkdown(abs)) return send(res, 400, { error: 'not a markdown file' });
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { return send(res, 404, { error: 'not found' }); }
    return send(res, 200, { file: abs, markdown: text });
  }

  // Save the edited Markdown back to the .md source. The file watcher then
  // fires a reload, re-rendering the preview (diagrams included).
  if (pathname === '/save-md' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || typeof body.markdown !== 'string') return send(res, 400, { error: 'missing file or markdown' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    if (!isMarkdown(abs)) return send(res, 400, { error: 'not a markdown file' });
    if (formalReview(abs)) return send(res, 409, { error: FORMAL_REFUSAL });
    try { fs.writeFileSync(abs, body.markdown, 'utf8'); } catch (e) { return send(res, 500, { error: 'write failed: ' + e.message }); }
    return send(res, 200, { ok: true });
  }

  // Inline edit: replace one exact run of text in the .md source with new text
  // (empty newText = delete). Used by the "Edit" affordance on a text selection
  // in Annotate mode — a direct, agent-free tweak. The client only offers Edit
  // when it can pin a single occurrence, and passes that `index`; the server
  // re-verifies the slice still equals `oldText` (falls back to a unique search
  // if the file shifted underneath) before writing, so it never edits blind.
  if (pathname === '/edit-text' && method === 'POST') {
    const body = await readBody(req);
    const { file, oldText, index } = body;
    const newText = typeof body.newText === 'string' ? body.newText : '';
    if (!file || typeof oldText !== 'string' || !oldText) return send(res, 400, { error: 'missing file or oldText' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    if (!isMarkdown(abs)) return send(res, 400, { error: 'not a markdown file' });
    if (formalReview(abs)) return send(res, 409, { error: FORMAL_REFUSAL });
    let md;
    try { md = fs.readFileSync(abs, 'utf8'); } catch { return send(res, 404, { error: 'not found' }); }
    // Prefer the client-provided index (verified), else a unique match.
    let at = -1;
    if (Number.isInteger(index) && md.slice(index, index + oldText.length) === oldText) {
      at = index;
    } else {
      const first = md.indexOf(oldText);
      if (first !== -1 && md.indexOf(oldText, first + 1) === -1) at = first; // unique only
    }
    if (at === -1) return send(res, 409, { error: 'text not found or ambiguous — file changed' });
    const updated = md.slice(0, at) + newText + md.slice(at + oldText.length);
    try { fs.writeFileSync(abs, updated, 'utf8'); } catch (e) { return send(res, 500, { error: 'write failed: ' + e.message }); }
    return send(res, 200, { ok: true });
  }

  if (pathname === '/annotations' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    return send(res, 200, readSidecar(abs));
  }

  // Who is reviewing? Used by the browser to label comment authors.
  if (pathname === '/whoami' && method === 'GET') {
    const file = u.searchParams.get('file');
    const cwd = file ? path.dirname(path.resolve(file)) : process.cwd();
    return send(res, 200, await getIdentity(cwd));
  }

  if (pathname === '/annotations' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const current = readSidecar(abs);
    current.annotations = body.annotations || current.annotations;
    if (body.rounds) current.rounds = body.rounds;
    writeSidecar(abs, current);
    return send(res, 200, { ok: true });
  }

  if (pathname === '/feedback' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // Persist annotations to sidecar, stamped with the reviewer's identity.
    if (body.items && body.items.length > 0) {
      const who = await getIdentity(path.dirname(abs));
      const now = () => new Date().toISOString();
      const humanMsg = (message) => ({ role: 'human', author: who.name, authorDetail: who.detail, message, timestamp: now() });
      const sidecar = readSidecar(abs);
      for (const item of body.items) {
        const existing = item.id ? sidecar.annotations.find(a => a.id === item.id) : null;
        if (existing) {
          // Add new message to existing thread
          if (!existing.thread) existing.thread = [];
          // A retry re-sends the original instruction (already in the thread) —
          // just clear the failed flag; don't append a duplicate human message.
          if (item.retry) delete existing.applyFailed;
          else if (item.note) existing.thread.push(humanMsg(item.note));
          if (item.kind === 'text') {
            existing.textStart = Number.isInteger(item.textStart) ? item.textStart : existing.textStart ?? null;
            existing.textEnd = Number.isInteger(item.textEnd) ? item.textEnd : existing.textEnd ?? null;
            existing.textPrefix = item.textPrefix || existing.textPrefix || null;
            existing.textSuffix = item.textSuffix || existing.textSuffix || null;
          }
        } else {
          // New annotation
          const ann = {
            id: item.id || ('ann_' + Math.random().toString(36).slice(2, 9)),
            kind: item.kind,
            selector: item.selector || null,
            label: item.label || null,
            text: item.text || null,
            textStart: Number.isInteger(item.textStart) ? item.textStart : null,
            textEnd: Number.isInteger(item.textEnd) ? item.textEnd : null,
            textPrefix: item.textPrefix || null,
            textSuffix: item.textSuffix || null,
            author: who.name,
            authorDetail: who.detail,
            thread: item.note ? [humanMsg(item.note)] : [],
            createdAt: now(),
            status: 'open',
          };
          item.id = ann.id;
          sidecar.annotations.push(ann);
        }
      }
      writeSidecar(abs, sidecar);
    }
    const sess = getSession(abs);
    sess.pendingFeedback = body;
    sess.finalized = false;
    sess.cancelRequested = false;
    sess.selectedModel = body.model || null;
    broadcastSSE(abs, 'agent-thinking', '{}');
    wakePoll(abs, { feedback: body, finalized: false });
    return send(res, 200, { ok: true });
  }

  if (pathname === '/poll' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);

    // If there's already feedback waiting, return it immediately
    if (sess.pendingFeedback) {
      const payload = { feedback: sess.pendingFeedback, finalized: sess.finalized };
      sess.pendingFeedback = null;
      sess.working = true;  // agent is now processing a round
      return send(res, 200, payload);
    }
    if (sess.finalized) {
      sess.finalized = false;
      sess.working = false;
      return send(res, 200, { finalized: true });
    }

    // Long-poll
    const timeout = setTimeout(() => {
      sess.pollWaiters = sess.pollWaiters.filter(r => r !== resolve);
      send(res, 200, { feedback: null, finalized: false });
    }, 25000);

    let resolve;
    const p = new Promise(r => { resolve = r; });
    sess.pollWaiters.push(resolve);
    const payload = await p;
    clearTimeout(timeout);
    sess.pendingFeedback = null;
    if (payload && payload.feedback) sess.working = true;   // handed a new round to the agent
    else if (payload && payload.finalized) sess.working = false;
    return send(res, 200, payload);
  }

  if (pathname === '/finalize' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.html) return send(res, 400, { error: 'missing file or html' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // Never overwrite a Markdown source with rendered HTML — use /save-md.
    if (isMarkdown(abs)) return send(res, 400, { error: 'markdown source: use Save (writes .md), not Finalize' });
    const sess = getSession(abs);
    sess._suppressReload = true;
    fs.writeFileSync(abs, body.html, 'utf8');
    sess.finalized = true;
    wakePoll(abs, { finalized: true });
    return send(res, 200, { ok: true });
  }

  if (pathname === '/done' && method === 'POST') {
    // Mark the review finished: no file is written (Save/Finalize already did
    // that) — this just ends the agent's poll loop cleanly so it can exit, and
    // tells the browser the session is over. Callers usually follow with /stop.
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // A generic "I'm finished" must not stand in for a verdict: it carries no
    // reviewer, no decision, and no binding to the content.
    if (formalReview(abs)) return send(res, 409, { error: FORMAL_REFUSAL });
    const sess = getSession(abs);
    sess.finalized = true;
    sess.working = false;
    wakePoll(abs, { finalized: true });
    broadcastSSE(abs, 'session-done', '{}');
    return send(res, 200, { ok: true });
  }

  if (pathname === '/agent-reply' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.message) return send(res, 400, { error: 'missing file or message' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // Agent is reporting back → the round is done, it's no longer actively working
    getSession(abs).working = false;
    // Persist reply into sidecar thread if annotationId given
    if (body.annotationId) {
      const sidecar = readSidecar(abs);
      const ann = sidecar.annotations.find(a => a.id === body.annotationId);
      if (ann) {
        if (!ann.thread) ann.thread = [];
        const now = new Date().toISOString();
        ann.thread.push({ role: 'agent', message: body.message, timestamp: now });
        // A comment the agent successfully acted on is considered resolved — the
        // UI moves it to the History tab, timestamped so the reviewer can track
        // it. A failed apply (body.failed) stays open and is flagged so the UI
        // can red-border it and offer a Retry.
        if (!body.failed) {
          ann.status = 'resolved';
          ann.resolvedAt = now;
          delete ann.applyFailed;
        } else {
          ann.applyFailed = true;
        }
        writeSidecar(abs, sidecar);
      }
    }
    broadcastSSE(abs, 'agent-reply', JSON.stringify({ message: body.message, annotationId: body.annotationId || null, failed: !!body.failed }));
    return send(res, 200, { ok: true });
  }

  if (pathname === '/upload' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.dataUrl) return send(res, 400, { error: 'missing file or dataUrl' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(body.dataUrl);
    if (!m) return send(res, 400, { error: 'invalid image data' });
    const mime = m[1];
    let buf;
    try { buf = Buffer.from(m[2], 'base64'); } catch { return send(res, 400, { error: 'invalid base64' }); }
    const MAX = 20 * 1024 * 1024;
    if (buf.length > MAX) return send(res, 413, { error: 'image too large (max 20MB)' });
    const extByMime = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
    const ext = extByMime[mime] || 'png';
    const dir = path.join(path.dirname(abs), '.annotron-uploads');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const rawName = (body.name || 'image').replace(/\.[^.]*$/, '');
    const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'image';
    const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeBase}.${ext}`;
    const dest = path.join(dir, fname);
    try { fs.writeFileSync(dest, buf); } catch (e) { return send(res, 500, { error: 'write failed: ' + e.message }); }
    return send(res, 200, { ok: true, path: dest, name: body.name || fname });
  }

  if (pathname === '/agent-progress' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    broadcastSSE(abs, 'agent-progress', JSON.stringify({ step: body.step || '', done: !!body.done }));
    return send(res, 200, { ok: true });
  }

  if (pathname === '/agent-metrics' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const metrics = {
      model: body.model || undefined,
      tokensUsed: body.tokensUsed || undefined,
      tokensMax: body.tokensMax || undefined,
      contextUsed: body.contextUsed || undefined,
      contextMax: body.contextMax || undefined,
    };
    Object.keys(metrics).forEach(k => metrics[k] === undefined && delete metrics[k]);
    broadcastSSE(abs, 'agent-metrics', JSON.stringify(metrics));
    return send(res, 200, { ok: true });
  }

  if (pathname === '/cancel' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    sess.cancelRequested = true;
    broadcastSSE(abs, 'agent-cancelled', '{}');
    return send(res, 200, { ok: true });
  }

  if (pathname === '/cancelled' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    return send(res, 200, { cancelled: !!sess.cancelRequested });
  }

  // Fileless check used by the `annotron check` CLI fallback: is any in-flight
  // (actively-working) session currently under a cancel request?
  if (pathname === '/cancel-check' && method === 'GET') {
    for (const [f, s] of sessions) {
      if (s.working && s.cancelRequested) return send(res, 200, { cancelled: true, file: f });
    }
    return send(res, 200, { cancelled: false });
  }

  // ── Hook ingest (Claude Code hooks POST their raw stdin JSON here) ──────────
  // PreToolUse: mirror the activity, enforce cancel, and (if remote-approve is
  // on) gate the tool on a browser Allow/Deny. Returns the exact JSON the hook
  // echoes back to Claude Code, or an empty body meaning "defer to normal flow".
  if (pathname === '/hook/pretool' && method === 'POST') {
    const body = await readBody(req);
    const tool = body.tool_name || body.tool || '';
    const input = body.tool_input || body.input || {};
    // Never gate/mirror annotron's OWN CLI calls — the agent must be able to
    // reply/poll/check even while cancelled or while remote-approve is on
    // (gating them would deadlock the poll). Detect the real command string
    // here (server-side JSON parse) rather than fuzzy-matching raw stdin.
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (tool === 'Bash' && /annotron["']?\s+(poll|progress|check|stop|help)\b/.test(cmd)) {
      return send(res, 200, '');
    }
    const found = findActiveSession(body.cwd);
    if (!found) return send(res, 200, '');       // no active review → normal flow
    const [file, sess] = found;
    broadcastSSE(file, 'agent-progress', JSON.stringify({ step: formatActivity(tool, input) }));

    if (sess.cancelRequested) {
      return send(res, 200, permJSON('deny',
        'annotron: the user cancelled the current review. Stop immediately — do not run further tools. Reply on the artifact (annotron poll <file> --reply "Stopped — cancelled by user.") then wait for new feedback.'));
    }
    if (!sess.remoteApprove) return send(res, 200, '');
    if (sess.autoAllowTools.has(tool)) return send(res, 200, permJSON('allow'));

    const requestId = 'perm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const summary = formatActivity(tool, input);
    sess.pendingPerms.set(requestId, { tool, summary });
    broadcastSSE(file, 'permission-request', JSON.stringify({ requestId, tool, summary }));
    const decision = await new Promise(resolve => {
      sess.permWaiters.set(requestId, resolve);
      setTimeout(() => {
        if (sess.permWaiters.has(requestId)) { sess.permWaiters.delete(requestId); resolve(null); }
      }, 170000);
    });
    sess.pendingPerms.delete(requestId);
    broadcastSSE(file, 'permission-resolved', JSON.stringify({ requestId }));
    if (!decision) {
      return send(res, 200, permJSON('ask',
        'annotron: no response from the review UI in time — falling back to the terminal prompt.'));
    }
    if (decision.decision === 'allow' && decision.always) sess.autoAllowTools.add(tool);
    if (decision.decision === 'deny') {
      return send(res, 200, permJSON('deny', decision.reason || 'Denied by the reviewer in annotron.'));
    }
    return send(res, 200, permJSON('allow'));
  }

  // PostToolUse: mark the current activity step done.
  if (pathname === '/hook/posttool' && method === 'POST') {
    const body = await readBody(req);
    const found = findActiveSession(body.cwd);
    if (found) broadcastSSE(found[0], 'agent-progress-done', JSON.stringify({ tool: body.tool_name || '' }));
    return send(res, 200, { ok: true });
  }

  // Notification: reflect "waiting for permission / idle" in the browser.
  if (pathname === '/hook/notify' && method === 'POST') {
    const body = await readBody(req);
    const found = findSessionByCwd(body.cwd);
    const type = body.notification_type || body.type || '';
    if (found) broadcastSSE(found[0], 'agent-status', JSON.stringify({ type }));
    return send(res, 200, { ok: true });
  }

  // Stop: the turn finished → agent is idle, waiting for the next feedback.
  if (pathname === '/hook/stop' && method === 'POST') {
    const body = await readBody(req);
    const found = findSessionByCwd(body.cwd);
    if (found) broadcastSSE(found[0], 'agent-status', JSON.stringify({ type: 'idle' }));
    return send(res, 200, { ok: true });
  }

  // ── Remote permission control (from the browser) ────────────────────────────
  if (pathname === '/permission/decision' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // Approving an agent's tool call is a different authority from approving an
    // artifact. A review gate must not be a place where the two get conflated.
    if (formalReview(abs)) return send(res, 409, { error: FORMAL_REFUSAL });
    const sess = getSession(abs);
    const resolve = sess.permWaiters.get(body.requestId);
    if (resolve) {
      sess.permWaiters.delete(body.requestId);
      resolve({
        decision: body.decision === 'deny' ? 'deny' : 'allow',
        always: !!body.always,
        reason: body.reason || '',
      });
    }
    return send(res, 200, { ok: true });
  }

  if (pathname === '/permission/mode' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // Remote tool approval turns the review window into an agent control
    // surface. Not from inside an approval gate.
    if (formalReview(abs)) return send(res, 409, { error: FORMAL_REFUSAL });
    const sess = getSession(abs);
    sess.remoteApprove = !!body.enabled;
    if (!sess.remoteApprove) {
      // Turning off: release anything currently waiting so nothing hangs.
      for (const resolve of sess.permWaiters.values()) resolve(null);
      sess.permWaiters.clear();
      sess.pendingPerms.clear();
    }
    if (body.clearAutoAllow) sess.autoAllowTools.clear();
    broadcastSSE(abs, 'permission-mode', JSON.stringify({ enabled: sess.remoteApprove }));
    return send(res, 200, { ok: true, enabled: sess.remoteApprove });
  }

  if (pathname === '/events' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    // Allow events even if not in allowList (browser may connect before register)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    const sess = getSession(abs);
    sess.sseClients.add(res);
    req.on('close', () => { sess.sseClients.delete(res); });
    // Keep-alive ping
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(ping); } }, 20000);
    req.on('close', () => clearInterval(ping));
    return;
  }

  if (pathname === '/stop' && method === 'POST') {
    send(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 100);
    return;
  }

  send(res, 404, { error: 'not found' });
}

const server = http.createServer(handler);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another server already owns the port — exit quietly
    process.exit(0);
  }
  console.error('[annotron server]', err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`annotron server listening on http://${HOST}:${PORT}`);
});
