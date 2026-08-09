const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { EpicService } = require('../dist');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-concurrency-'));
const service = new EpicService(root);
const draft = service.create({ id: 'EPIC-CONCURRENCY', title: 'Concurrency' });
const ready = service.transition(draft.id, 'ready', { expectedRevision: draft.revision });
const running = service.startRun(ready.id, { expectedRevision: ready.revision, workflowHash: 'concurrency-workflow' }).epic;
const worker = path.join(__dirname, 'fixtures', 'redesign', 'concurrency-worker.cjs');

function run(mode, index, env = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(worker, [root, mode, String(index)], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', (code) => { if (code && code !== 0) reject(new Error(`worker exited ${code}`)); });
  });
}

(async () => {
  const updates = await Promise.all(Array.from({ length: 8 }, (_, index) => run('update', index, { EXPECTED_REVISION: String(running.revision) })));
  assert.equal(updates.filter((result) => result.ok).length, 1, 'exactly one stale-CAS writer must win');

  const records = await Promise.all(Array.from({ length: 8 }, (_, index) => run('record', index)));
  assert.equal(records.filter((result) => result.ok).length, 8, 'all event writers must succeed after bounded conflict retries');
  const latest = service.require('EPIC-CONCURRENCY');
  const events = service.store.readEvents(latest.activeRunId);
  assert.equal(new Set(events.map((event) => event.id)).size, events.length, 'event ids must be unique');
  assert.equal(events.filter((event) => event.command === 'concurrency.record').length, 8);
  assert.equal(service.store.loadRun(latest.activeRunId).epicId, latest.id);
  console.log(JSON.stringify({ ok: true, updateWinners: 1, concurrentEvents: 8, totalEvents: events.length }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
