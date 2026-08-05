import path from 'node:path';
import {
  artifactDir, declaredContractHash, formatError, inputsFor, packageById,
  pass, readJson, readText, reject,
} from './lib.mjs';

export default async function packageContext(ctx) {
  try {
    const runId = ctx.state.runId;
    const inputs = inputsFor(ctx.workspaceRoot, runId);
    const feature = inputs.feature_id;
    const packageId = inputs.package_id;
    const problems = [];
    if (!feature || !packageId) return reject('inputs.json must contain feature_id and package_id.');
    if (runId !== `${feature}-${packageId}`) problems.push(`worker run id must be ${feature}-${packageId}`);

    const parent = artifactDir(ctx.workspaceRoot, feature);
    const manifest = readJson(path.join(parent, 'WORK-PACKAGES.json'));
    const contract = readText(path.join(parent, 'FEATURE-CONTRACT.md'));
    const pkg = packageById(manifest, packageId);
    if (!pkg) problems.push(`package ${packageId} not found in parent manifest`);
    if (pkg?.runId !== runId) problems.push(`package manifest runId does not match ${runId}`);
    if (!['ready', 'planned', 'blocked'].includes(pkg?.status)) problems.push(`package status ${pkg?.status} is not executable`);
    if (!/\*\*Status:\*\*\s*FROZEN\b/i.test(contract)) problems.push('parent Feature Contract is not frozen');
    const hash = declaredContractHash(contract);
    if (!hash || hash !== manifest.featureContractHash?.toLowerCase?.()) problems.push('parent Feature Contract hash does not match manifest');

    for (const depId of pkg?.dependsOn ?? []) {
      const dep = packageById(manifest, depId);
      if (!dep) { problems.push(`unknown dependency package ${depId}`); continue; }
      const resultFile = path.join(artifactDir(ctx.workspaceRoot, dep.runId), 'PACKAGE-RESULT.json');
      try {
        const result = readJson(resultFile);
        if (result.status !== 'done') problems.push(`dependency ${depId} is ${result.status}, expected done`);
        if (result.featureContractHash?.toLowerCase?.() !== hash) problems.push(`dependency ${depId} used a different contract hash`);
      } catch {
        problems.push(`dependency ${depId} has no valid PACKAGE-RESULT.json`);
      }
    }

    const localContext = readText(path.join(artifactDir(ctx.workspaceRoot, runId), 'PACKAGE-CONTEXT.md'));
    for (const marker of [feature, packageId, hash]) if (marker && !localContext.includes(marker)) problems.push(`PACKAGE-CONTEXT.md does not contain ${marker}`);

    if (problems.length) return reject(`Package context is not executable:\n- ${problems.join('\n- ')}`);
    return pass(`${runId} is bound to frozen contract ${hash} and all package dependencies are satisfied.`);
  } catch (error) {
    return reject(`Package-context validator failed: ${formatError(error)}`);
  }
}

