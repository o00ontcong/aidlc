import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TEST_NAME = 'testHighTemperatureAlertRequiresThreshold';

function run(srcDir, args) {
  try { return { ok: true, output: execFileSync('swift', args, { cwd: srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (error) { return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }; }
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const epic = String(ctx.context?.epic ?? ctx.state.runId);
  const summaryPath = path.join(root, 'docs/epics', epic, 'artifacts/IMPLEMENT-SUMMARY.md');
  if (!existsSync(summaryPath) || !readFileSync(summaryPath, 'utf8').includes('## Green Evidence')) {
    return { decision: 'reject', reason: 'Thiếu IMPLEMENT-SUMMARY.md hoặc Green Evidence.' };
  }
  const srcDir = path.join(root, 'src');
  const build = run(srcDir, ['build']);
  if (!build.ok) return { decision: 'reject', reason: 'swift build thất bại ở GREEN gate.' };
  const targeted = run(srcDir, ['test', '--filter', TEST_NAME]);
  if (!targeted.ok) return { decision: 'reject', reason: `${TEST_NAME} chưa xanh.` };
  const full = run(srcDir, ['test']);
  if (!full.ok) return { decision: 'reject', reason: 'Full swift test suite thất bại ở GREEN gate.' };
  return { decision: 'pass', reason: `swift build, ${TEST_NAME}, và full swift test đều xanh.` };
}
