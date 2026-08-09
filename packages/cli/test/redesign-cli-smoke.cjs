const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cli-smoke-'));
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'clean-room', scripts: { test: 'echo ok' } }));
const cli = path.resolve(__dirname, '..', 'dist', 'bundle.js');
const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-fake-claude-'));
const fakeClaude = path.join(fakeBin, 'claude');
fs.writeFileSync(fakeClaude, '#!/usr/bin/env node\nif (process.argv.includes("--version")) console.log("fake-claude 1.0"); else console.log(JSON.stringify({result:"deterministic fake Claude output",usage:{input_tokens:1,output_tokens:1},total_cost_usd:0}));\n');
fs.chmodSync(fakeClaude, 0o755);
const environment = { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}` };

function run(args, expectedStatus = 'ok') {
  const invocation = spawnSync(process.execPath, [cli, '-w', root, ...args, '--json'], { encoding: 'utf8', env: environment });
  assert.equal(invocation.error, undefined, invocation.error?.message);
  const result = JSON.parse(invocation.stdout);
  assert.equal(result.status, expectedStatus, `${args.join(' ')} failed: ${invocation.stdout}\n${invocation.stderr}`);
  const expectedExitCode = expectedStatus === 'ok' ? 0 : expectedStatus === 'waiting-for-user' ? 2 : expectedStatus === 'blocked' ? 3 : 1;
  assert.equal(invocation.status, expectedExitCode, `unexpected exit code for ${args.join(' ')}`);
  return result;
}

run(['project', 'setup', '--confirm']);
run(['project', 'context', 'refresh', '--source-commit', 'HEAD']);
run(['epic', 'start', 'EPIC-CLI-SMOKE', '--title', 'CLI smoke', '--profile', 'quick']);
// `run` prepares a draft automatically; canonical users do not need an
// internal prepare command in the happy path.
const started = run(['epic', 'run', 'EPIC-CLI-SMOKE', '--mode', 'guide']);
assert.equal(started.data.run.stages.length, 3);
const next = run(['epic', 'next', 'EPIC-CLI-SMOKE']);
assert.equal(next.data.status, 'guidance');
assert.equal(fs.existsSync(path.join(root, '.claude', 'commands', 'aidlc.md')), true);
assert.equal(fs.existsSync(path.join(root, '.aidlc', 'epics', 'EPIC-CLI-SMOKE', 'workflow.json')), true);

const migration = run(['migration', 'preview']);
assert.equal(migration.data.items.length, 0);
const legacyMigrationSpelling = run(['migrate', '--preview']);
assert.deepEqual(legacyMigrationSpelling.data.items, migration.data.items);

run(['epic', 'start', 'EPIC-CLI-UNATTENDED', '--title', 'Unattended gate smoke', '--profile', 'standard']);
run(['epic', 'run', 'EPIC-CLI-UNATTENDED', '--mode', 'unattended']);
const gated = run(['epic', 'next', 'EPIC-CLI-UNATTENDED'], 'waiting-for-user');
assert.equal(gated.data.epic.pendingGate.preview.gate, 'external_communication');
assert.equal(gated.data.actionId, 'ship');
const evidenceDir = path.join(root, '.aidlc', 'runs', gated.data.epic.activeRunId, 'evidence');
assert.equal(fs.readdirSync(evidenceDir).filter((file) => file.endsWith('.json')).length >= 5, true);
console.log(JSON.stringify({ ok: true, root, workflowHash: started.data.run.workflowHash, unattendedGate: gated.data.epic.pendingGate.preview.gate }));
