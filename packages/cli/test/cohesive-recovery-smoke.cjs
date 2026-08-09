const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cohesive-recovery-'));
const deliveryId = 'RECOVERY-SMOKE';
const failure = {
  id: 'failure-smoke',
  at: '2026-08-09T00:00:00.000Z',
  code: 'runner.authentication_required',
  summary: 'Claude login is required.',
  logPath: '.aidlc/runs/RECOVERY-SMOKE-PROJECT-CONTEXT/logs/failure-smoke.json',
  retryable: true,
  recoveryCommands: ['claude /login', `aidlc cohesive resume ${deliveryId}`],
  stepIdx: 0,
  agent: 'aidlc-project-context-agent',
  runId: 'RECOVERY-SMOKE-PROJECT-CONTEXT',
  resumeCommand: `aidlc cohesive resume ${deliveryId}`,
};
const now = '2026-08-09T00:00:00.000Z';
const state = {
  schemaVersion: 1,
  id: deliveryId,
  profile: {
    id: 'existing-project-autonomous', projectContextMode: 'infer-or-refresh', reviewStrategy: 'aggregate',
    maxParallelWorkers: 3, openFeaturePullRequest: true, mergePolicy: 'human-only',
  },
  request: { id: deliveryId, title: 'Recovery smoke', description: 'A detailed delivery request used for recovery smoke testing.' },
  status: 'blocked', workerRunIds: [], completedStages: [], reviewRevision: 1, reviewTasks: [], events: [],
  createdAt: now, updatedAt: now, lastError: failure.summary, lastFailure: failure, failureHistory: [failure],
};
const stateFile = path.join(root, '.aidlc', 'deliveries', deliveryId, 'state.json');
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify(state));

const cli = path.resolve(__dirname, '..', 'dist', 'bundle.js');
function run(args) {
  const result = spawnSync(process.execPath, [cli, '-w', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const status = run(['cohesive', 'status', deliveryId]);
assert.match(status, /runner\.authentication_required/);
assert.match(status, /aidlc cohesive resume RECOVERY-SMOKE/);

const logs = JSON.parse(run(['cohesive', 'logs', deliveryId, '--json']));
assert.equal(logs.current.code, 'runner.authentication_required');
assert.equal(logs.failures.length, 1);
assert.equal(logs.failures[0].logPath, failure.logPath);

delete state.lastFailure;
delete state.failureHistory;
state.lastError = 'Run stopped with outcome error.';
fs.writeFileSync(stateFile, JSON.stringify(state));
const legacy = JSON.parse(run(['cohesive', 'logs', deliveryId, '--json']));
assert.equal(legacy.current, undefined);
assert.equal(legacy.legacyError, 'Run stopped with outcome error.');
assert.deepEqual(legacy.failures, []);

console.log(JSON.stringify({ ok: true, deliveryId, code: logs.current.code }));
