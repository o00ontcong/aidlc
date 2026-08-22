/**
 * Auto-review cho step `implement`: build + test thật, không tin lời khai của agent.
 *
 * Pass khi: `swift build` xong sạch, `swift test` không có failure, và
 * IMPLEMENT-SUMMARY có dán output build thật.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const epic = ctx.context?.epic ?? ctx.runId;
  const srcDir = path.join(root, 'src');

  if (!existsSync(path.join(srcDir, 'Package.swift'))) {
    return { decision: 'reject', reason: 'Không tìm thấy src/Package.swift.' };
  }

  const run = (args) => {
    try {
      return { ok: true, out: execFileSync('swift', args, { cwd: srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (err) {
      return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };

  const build = run(['build']);
  if (!build.ok) {
    const firstError = build.out.split('\n').find((l) => l.includes('error:')) ?? 'build thất bại';
    return { decision: 'reject', reason: `swift build fail — ${firstError.trim()}` };
  }

  const test = run(['test']);
  if (!test.ok) {
    const failed = test.out.split('\n').filter((l) => l.includes('failed')).slice(-1)[0] ?? 'test thất bại';
    return { decision: 'reject', reason: `swift test fail — ${failed.trim()}` };
  }

  const summaryPath = path.join(root, 'docs', 'epics', String(epic), 'artifacts', 'IMPLEMENT-SUMMARY.md');
  if (!existsSync(summaryPath)) {
    return { decision: 'reject', reason: 'Thiếu IMPLEMENT-SUMMARY.md.' };
  }
  const summary = readFileSync(summaryPath, 'utf8');
  if (!summary.includes('## Build Evidence')) {
    return { decision: 'reject', reason: 'IMPLEMENT-SUMMARY thiếu mục "## Build Evidence".' };
  }
  if (!summary.includes('Build complete!')) {
    return {
      decision: 'reject',
      reason: 'IMPLEMENT-SUMMARY chưa dán output build thật (không thấy "Build complete!").',
    };
  }

  return { decision: 'pass', reason: 'swift build + swift test xanh, và summary có bằng chứng build.' };
}
