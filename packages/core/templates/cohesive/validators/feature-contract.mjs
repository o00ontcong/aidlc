import path from 'node:path';
import {
  artifactDir, contractHash, declaredContractHash, formatError, fullCommitExists,
  markdownHasGo, pass, readJson, readText, reject,
} from './lib.mjs';

export default async function featureContract(ctx) {
  try {
    const artifacts = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const analysis = readText(path.join(artifacts, 'ANALYSIS.md'));
    const contract = readText(path.join(artifacts, 'FEATURE-CONTRACT.md'));
    const manifest = readJson(path.join(artifacts, 'WORK-PACKAGES.json'));
    const problems = [];

    if (!markdownHasGo(analysis)) problems.push('ANALYSIS.md does not contain a GO verdict');
    if (!/\*\*Status:\*\*\s*FROZEN\b/i.test(contract)) problems.push('FEATURE-CONTRACT.md is not FROZEN');
    const declared = declaredContractHash(contract);
    const actual = contractHash(contract).toLowerCase();
    if (!declared) problems.push('FEATURE-CONTRACT.md is missing a sha256 Contract Hash');
    else if (declared !== actual) problems.push(`feature contract hash mismatch (${declared} != ${actual})`);
    if (!Number.isInteger(manifest.featureContractRevision) || manifest.featureContractRevision < 1) {
      problems.push('featureContractRevision must be a positive integer');
    }
    if (manifest.featureContractHash?.toLowerCase?.() !== declared) problems.push('WORK-PACKAGES.json contract hash differs from FEATURE-CONTRACT.md');
    if (!fullCommitExists(ctx.workspaceRoot, manifest.baseCommit)) problems.push('WORK-PACKAGES.json baseCommit is invalid');
    for (const section of ['## Goal', '## Invariants', '## Shared Contracts', '## Definition of Done', '## Change Request Protocol']) {
      if (!contract.includes(section)) problems.push(`FEATURE-CONTRACT.md is missing ${section}`);
    }

    if (problems.length) return reject(`Feature contract cannot be frozen:\n- ${problems.join('\n- ')}`);
    return pass(`Feature Contract revision ${manifest.featureContractRevision} is frozen at ${declared}.`);
  } catch (error) {
    return reject(`Feature-contract validator failed: ${formatError(error)}`);
  }
}

