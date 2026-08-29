import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const sha256 = (file) => `sha256:${crypto.createHash('sha256').update(readFileSync(file)).digest('hex')}`;

function resolveEvidence(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]+/).includes('..')) return null;
  return path.join(root, relative);
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const profilePath = path.join(root, 'docs/project/foundation/STACK-PROFILE.json');
  if (!existsSync(profilePath)) return { decision: 'reject', reason: 'Thiếu STACK-PROFILE.json.' };
  let profile;
  try { profile = JSON.parse(readFileSync(profilePath, 'utf8')); }
  catch { return { decision: 'reject', reason: 'STACK-PROFILE.json không phải JSON hợp lệ.' }; }

  if (
    profile.schemaVersion !== 1
    || profile.mode !== 'cofofo'
    || profile.repositoryKind !== 'single-stack'
    || profile.stack?.id !== 'ios-swift'
    || profile.stack.packageManager !== 'swiftpm'
    || profile.stack.buildSystem !== 'swift'
    || profile.stack.buildCommandId !== 'swift.build'
    || profile.stack.testCommandId !== 'swift.test'
    || JSON.stringify(profile.candidates) !== JSON.stringify(['ios-swift'])
  ) {
    return { decision: 'reject', reason: 'Stack profile phải mô tả đúng một iOS SwiftPM stack.' };
  }
  if (!Array.isArray(profile.evidence) || profile.evidence.length === 0) {
    return { decision: 'reject', reason: 'Stack profile thiếu evidence có hash.' };
  }
  const packageEvidence = profile.evidence.find((entry) => entry?.path === 'src/Package.swift' && entry.kind === 'manifest');
  if (!packageEvidence) {
    return { decision: 'reject', reason: 'Stack profile thiếu manifest evidence src/Package.swift.' };
  }
  if (typeof profile.confidence !== 'number' || profile.confidence < 0.9) {
    return { decision: 'reject', reason: 'Confidence stack phải >= 0.9.' };
  }
  for (const evidence of profile.evidence) {
    const target = resolveEvidence(root, evidence?.path);
    if (!target || !existsSync(target) || evidence.sha256 !== sha256(target)) {
      return { decision: 'reject', reason: `Evidence SwiftPM thiếu hoặc đã đổi: ${evidence?.path ?? '(invalid path)'}.` };
    }
  }
  return { decision: 'pass', reason: `Xác nhận một stack iOS SwiftPM với ${profile.evidence.length} evidence hash còn mới.` };
}
