/**
 * Auto-review cho step `implement` của `aidlc-ios-feature`: build + test thật,
 * không tin lời khai của agent.
 *
 * Pass khi: `swift build` xong sạch, `swift test` không có failure, và
 * IMPLEMENT-SUMMARY có dán output build thật.
 *
 * Package root được dò tự động (gốc repo, rồi các thư mục con quen dùng) nên
 * validator chạy được cả khi `Package.swift` không nằm ở `src/`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Thứ tự dò `Package.swift`, tính từ workspace root. */
const PACKAGE_DIR_CANDIDATES = ['', 'src', 'ios', 'App', 'Sources'];

function findPackageDir(root) {
  for (const rel of PACKAGE_DIR_CANDIDATES) {
    const dir = path.join(root, rel);
    if (existsSync(path.join(dir, 'Package.swift'))) { return dir; }
  }
  return null;
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const epic = ctx.context?.epic ?? ctx.runId;
  const srcDir = findPackageDir(root);

  if (!srcDir) {
    return {
      decision: 'reject',
      reason: `Không tìm thấy Package.swift (đã dò: ${PACKAGE_DIR_CANDIDATES.map((c) => c || '.').join(', ')}).`,
    };
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
