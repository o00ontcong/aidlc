/**
 * Formal review mode: a typed, content-bound verdict.
 *
 * Annotron's default mode is a freeform loop — the human annotates, an agent
 * edits the source, repeat. That is the wrong shape for an approval gate, where
 * the whole point is that a specific human signed off on specific bytes.
 *
 * A session registered with `review` metadata therefore enters **formal mode**,
 * which differs in two directions:
 *   - it gains `/verdict`, the only way to close the gate, and an `approve` is
 *     refused unless every artifact still hashes to what was registered;
 *   - it loses the affordances that would let the reviewed content move, or let
 *     something other than a verdict end the review: source writes, inline
 *     edits, the generic `/done`, and remote tool approval.
 *
 * A freeform session keeps all of it — formal mode is opt-in per session, so
 * the existing preview/annotate workflow is untouched.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', 'src', 'server.js');
const PORT = 7399;
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let tmp;

const sha256 = (body) => `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;

async function call(method, route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* some routes send no body */ }
  return { status: res.status, json };
}

/** Write an artifact and register it, optionally in formal review mode. */
async function register(name, text, review) {
  const abs = path.join(tmp, name);
  fs.writeFileSync(abs, text, 'utf8');
  const payload = { file: abs };
  if (review) {
    payload.review = {
      runId: 'R-1',
      stepIdx: 0,
      stepRevision: 1,
      reviewRevision: 1,
      bundleHash: sha256(text),
      artifacts: [{ path: abs, hash: sha256(text) }],
      ...review,
    };
  }
  const res = await call('POST', '/session', payload);
  assert.equal(res.status, 200, `register failed: ${JSON.stringify(res.json)}`);
  return abs;
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'annotron-verdict-'));
  child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ANNOTRON_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (chunk) => {
      clearTimeout(timer);
      reject(new Error(`server failed to start: ${chunk}`));
    });
  });
});

after(() => {
  child?.kill();
  if (tmp) { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('a freeform session keeps source writes and generic done', async () => {
  const abs = await register('freeform.md', '# Freeform\n');

  assert.equal((await call('POST', '/save-md', { file: abs, markdown: '# Edited\n' })).status, 200);
  assert.equal((await call('POST', '/done', { file: abs })).status, 200);
  // And it has no verdict to give.
  assert.equal((await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer: 'X' })).status, 400);
});

test('approve is accepted and readable back', async () => {
  const abs = await register('approve.md', '# Approve me\n', {});

  const posted = await call('POST', '/verdict', {
    file: abs,
    verdict: 'approve',
    reviewer: 'Cong <cong@example.test>',
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.json));

  const read = await call('GET', `/verdict?file=${encodeURIComponent(abs)}`);
  assert.equal(read.status, 200);
  assert.equal(read.json.verdict.verdict, 'approve');
  assert.equal(read.json.verdict.reviewer, 'Cong <cong@example.test>');
  assert.match(read.json.verdict.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('a queued verdict is persisted, not just held in memory', async () => {
  // A review that took a coffee break must not be lost because the server was
  // restarted, so the verdict lands in the sidecar as well.
  const abs = await register('resume.md', '# Resume\n', {});
  await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer: 'R' });

  const sidecar = JSON.parse(fs.readFileSync(abs.replace(/\.md$/, '.annotron.json'), 'utf8'));
  assert.equal(sidecar.review.verdict.verdict, 'approve');
  assert.equal(sidecar.review.verdict.reviewer, 'R');
});

test('reopening the same gate keeps a verdict already given', async () => {
  // The resume path — and the one the persistence test above did not actually
  // prove. Re-registering used to reset `verdict` to null, so a caller that
  // reopened a gate to collect a decision silently erased it first. Found by
  // running `aidlc run review` end to end, not by this suite.
  const abs = await register('reopen.md', '# Reopen\n', {});
  await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer: 'R' });

  await register('reopen.md', '# Reopen\n', {});   // same content → same bundleHash

  const read = await call('GET', `/verdict?file=${encodeURIComponent(abs)}`);
  assert.equal(read.json.verdict?.verdict, 'approve');
  assert.equal(read.json.verdict?.reviewer, 'R');
});

test('reopening with a different bundle clears the verdict', async () => {
  // The mirror image: a verdict was given for particular bytes, so once the
  // bundle differs it is a new round, and carrying the decision over would
  // approve content nobody looked at.
  const abs = await register('newround.md', '# Round 1\n', {});
  await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer: 'R' });

  fs.writeFileSync(abs, '# Round 2\n', 'utf8');
  await register('newround.md', '# Round 2\n', { reviewRevision: 2 });

  assert.equal((await call('GET', `/verdict?file=${encodeURIComponent(abs)}`)).json.verdict, null);
});

test('approve is refused once the reviewed content changed', async () => {
  const abs = await register('stale.md', '# Original\n', {});
  fs.writeFileSync(abs, '# Quietly edited\n', 'utf8');

  const res = await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer: 'R' });
  assert.equal(res.status, 409, JSON.stringify(res.json));
  assert.match(res.json.error, /stale|changed/i);

  // Nothing was recorded — a refused approval must not look like an approval.
  assert.equal((await call('GET', `/verdict?file=${encodeURIComponent(abs)}`)).json.verdict, null);
});

test('request-changes is allowed on changed content but needs feedback', async () => {
  const abs = await register('changes.md', '# Needs work\n', {});

  const noFeedback = await call('POST', '/verdict', { file: abs, verdict: 'request-changes', reviewer: 'R' });
  assert.equal(noFeedback.status, 400);
  assert.match(noFeedback.json.error, /feedback/i);

  fs.writeFileSync(abs, '# Already being reworked\n', 'utf8');
  const withFeedback = await call('POST', '/verdict', {
    file: abs,
    verdict: 'request-changes',
    reviewer: 'R',
    feedback: 'Split section 2.',
  });
  assert.equal(withFeedback.status, 200, JSON.stringify(withFeedback.json));
});

test('an unknown verdict is refused', async () => {
  const abs = await register('unknown.md', '# X\n', {});
  for (const verdict of ['ok', 'approved', 'Approve', '']) {
    const res = await call('POST', '/verdict', { file: abs, verdict, reviewer: 'R' });
    assert.equal(res.status, 400, `verdict "${verdict}" should be refused`);
  }
});

test('a verdict without a reviewer is refused', async () => {
  const abs = await register('anon.md', '# X\n', {});
  for (const reviewer of [undefined, '', '   ']) {
    const res = await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer });
    assert.equal(res.status, 400, `reviewer "${reviewer}" should be refused`);
    assert.match(res.json.error, /reviewer/i);
  }
});

test('formal mode refuses every path that would move or end the review', async () => {
  const abs = await register('locked.md', '# Locked\n', {});

  const refusals = [
    ['POST', '/save-md', { file: abs, markdown: '# Rewritten\n' }],
    ['POST', '/edit-text', { file: abs, oldText: 'Locked', newText: 'Unlocked' }],
    ['POST', '/done', { file: abs }],
    ['POST', '/permission/decision', { file: abs, decision: 'allow' }],
    ['POST', '/permission/mode', { file: abs, remoteApprove: true }],
  ];

  for (const [method, route, body] of refusals) {
    const res = await call(method, route, body);
    assert.equal(res.status, 409, `${route} should be refused in formal mode`);
    assert.match(res.json.error, /formal review/i, `${route} should say why`);
  }

  // The file on disk is untouched, so a later approve is still valid.
  assert.equal(fs.readFileSync(abs, 'utf8'), '# Locked\n');
  assert.equal((await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer: 'R' })).status, 200);
});

test('a second verdict on the same review round is refused', async () => {
  const abs = await register('once.md', '# Once\n', {});
  assert.equal((await call('POST', '/verdict', { file: abs, verdict: 'approve', reviewer: 'R' })).status, 200);

  const again = await call('POST', '/verdict', {
    file: abs, verdict: 'request-changes', reviewer: 'R', feedback: 'no',
  });
  assert.equal(again.status, 409);
  assert.match(again.json.error, /already/i);
});

test('the registered gate metadata is readable back for binding', async () => {
  // The service applying the verdict has to check it against run state, so the
  // gate identity has to survive the round trip.
  const abs = await register('meta.md', '# Meta\n', { stepIdx: 3, stepRevision: 2, reviewRevision: 4 });

  const read = await call('GET', `/verdict?file=${encodeURIComponent(abs)}`);
  assert.equal(read.status, 200);
  assert.deepEqual(
    {
      runId: read.json.review.runId,
      stepIdx: read.json.review.stepIdx,
      stepRevision: read.json.review.stepRevision,
      reviewRevision: read.json.review.reviewRevision,
    },
    { runId: 'R-1', stepIdx: 3, stepRevision: 2, reviewRevision: 4 },
  );
});
