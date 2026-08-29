import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function run(srcDir, args) {
  try { return { ok: true, output: execFileSync('swift', args, { cwd: srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (error) { return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }; }
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const epic = String(ctx.context?.epic ?? ctx.state.runId);
  const artifacts = path.join(root, 'docs/epics', epic, 'artifacts');
  const verifyPath = path.join(artifacts, 'VERIFY.md');
  const reportPath = path.join(artifacts, 'TEST-REPORT.md');
  if (!existsSync(verifyPath) || !existsSync(reportPath)) return { decision: 'reject', reason: 'Thiếu VERIFY.md hoặc TEST-REPORT.md.' };
  if (!readFileSync(verifyPath, 'utf8').includes('## Final Verification')) return { decision: 'reject', reason: 'VERIFY.md thiếu Final Verification.' };
  const srcDir = path.join(root, 'src');
  if (!run(srcDir, ['build']).ok) return { decision: 'reject', reason: 'Final swift build thất bại.' };
  if (!run(srcDir, ['test']).ok) return { decision: 'reject', reason: 'Final full swift test thất bại.' };
  return { decision: 'pass', reason: 'Final swift build và full suite đều xanh.' };
}
