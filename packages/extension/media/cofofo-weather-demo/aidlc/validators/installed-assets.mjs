import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const sha256 = (file) => `sha256:${crypto.createHash('sha256').update(readFileSync(file)).digest('hex')}`;
const SHA40 = /^[a-f0-9]{40}$/;

function resolveRelative(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]+/).includes('..')) return null;
  return path.join(root, relative);
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const manifestPath = path.join(root, 'docs/project/foundation/INSTALLED-ASSETS.json');
  if (!existsSync(manifestPath)) return { decision: 'reject', reason: 'Thiếu INSTALLED-ASSETS.json.' };
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return { decision: 'reject', reason: 'Installed-assets manifest không phải JSON hợp lệ.' }; }
  if (
    manifest.schemaVersion !== 1
    || !Number.isInteger(manifest.foundationRevision)
    || !SHA40.test(manifest.catalogRevision ?? '')
    || !Array.isArray(manifest.assets)
    || manifest.assets.length === 0
  ) {
    return { decision: 'reject', reason: 'Installed-assets manifest không đúng schema hoặc thiếu catalog revision/assets.' };
  }
  for (const asset of manifest.assets) {
    const target = resolveRelative(root, asset?.installedPath);
    if (
      !target
      || !asset.installedPath.startsWith('.aidlc/cofofo/vendor/ecc/')
      || !asset.installedPath.endsWith('.md')
      || !existsSync(target)
      || asset.sha256 !== sha256(target)
      || asset.sourceRevision !== manifest.catalogRevision
      || asset.license !== 'MIT'
      || !['agent', 'skill'].includes(asset.kind)
    ) {
      return { decision: 'reject', reason: `Asset text-only thiếu, sai hash hoặc sai provenance: ${asset?.installedPath ?? '(invalid path)'}.` };
    }
  }
  for (const [label, relative, expected] of [
    ['NOTICE', manifest.attribution?.noticePath, manifest.attribution?.noticeHash],
    ['LICENSE', manifest.attribution?.licensePath, manifest.attribution?.licenseHash],
  ]) {
    const target = resolveRelative(root, relative);
    if (!target || !existsSync(target) || expected !== sha256(target)) {
      return { decision: 'reject', reason: `${label} attribution thiếu hoặc sai hash.` };
    }
  }
  return { decision: 'pass', reason: `${manifest.assets.length} asset Markdown có hash/provenance và attribution hợp lệ.` };
}
