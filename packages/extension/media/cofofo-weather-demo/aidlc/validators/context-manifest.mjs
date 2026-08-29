import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const sha256 = (file) => `sha256:${crypto.createHash('sha256').update(readFileSync(file)).digest('hex')}`;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const hashObject = (value) => `sha256:${crypto.createHash('sha256').update(stableJson(JSON.parse(JSON.stringify(value)))).digest('hex')}`;

function resolveRelative(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]+/).includes('..')) return null;
  return path.join(root, relative);
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const file = path.join(root, 'docs/project/foundation/CONTEXT-MANIFEST.json');
  if (!existsSync(file)) return { decision: 'reject', reason: 'Thiếu CONTEXT-MANIFEST.json.' };
  let manifest;
  try { manifest = JSON.parse(readFileSync(file, 'utf8')); } catch { return { decision: 'reject', reason: 'Context manifest không phải JSON hợp lệ.' }; }
  if (!Number.isInteger(manifest.foundationRevision) || !Array.isArray(manifest.artifacts) || manifest.artifacts.length < 4) {
    return { decision: 'reject', reason: 'Context manifest thiếu foundationRevision hoặc artifact hashes.' };
  }
  const { contentHash, ...draft } = manifest;
  if (contentHash !== hashObject(draft)) {
    return { decision: 'reject', reason: 'Context manifest contentHash không khớp payload canonical.' };
  }
  if (!Number.isFinite(Date.parse(manifest.generatedAt))) return { decision: 'reject', reason: 'Context manifest có generatedAt không hợp lệ.' };
  for (const artifact of manifest.artifacts) {
    if (typeof artifact.path !== 'string' || !artifact.path.startsWith('docs/project/foundation/')) {
      return { decision: 'reject', reason: 'Context manifest chứa artifact path không an toàn.' };
    }
    const target = resolveRelative(root, artifact.path);
    if (!target || !existsSync(target) || artifact.sha256 !== sha256(target)) return { decision: 'reject', reason: `Hash foundation artifact không khớp: ${artifact.path}.` };
  }
  const statePath = path.join(root, '.aidlc/cofofo/foundation.json');
  let state;
  try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch { return { decision: 'reject', reason: 'Foundation state thiếu hoặc không hợp lệ.' }; }
  if (
    !['pending-review', 'ready'].includes(state.status)
    || state.revision !== manifest.foundationRevision
    || state.contextManifestPath !== 'docs/project/foundation/CONTEXT-MANIFEST.json'
    || state.contextManifestHash !== sha256(file)
  ) {
    return { decision: 'reject', reason: 'Foundation state không ở publish gate hoặc không trỏ đúng context manifest hiện tại.' };
  }
  for (const relative of ['CLAUDE.md', 'AGENTS.md', 'docs/README.md']) {
    const managed = path.join(root, relative);
    if (!existsSync(managed)) return { decision: 'reject', reason: `${relative} chưa nhận context.` };
    const body = readFileSync(managed, 'utf8');
    if (!body.includes('aidlc:cofofo-context start') || !body.includes('aidlc:cofofo-context end')) {
      return { decision: 'reject', reason: `${relative} thiếu managed CoFoFo context block.` };
    }
  }
  return { decision: 'pass', reason: `Foundation revision ${manifest.foundationRevision} có ${manifest.artifacts.length} hash còn mới.` };
}
