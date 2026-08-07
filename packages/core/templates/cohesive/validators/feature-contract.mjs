import path from 'node:path';
import {
  artifactDir, contractHash, declaredContractHash, exists, formatError,
  fullCommitExists, loadCharter, markdownHasGo, pass, readJson, readText, reject,
} from './lib.mjs';

function snapshotCharterHash(snapshotText) {
  return snapshotText.match(/\*\*Charter Hash:\*\*\s*(sha256:[0-9a-f]{64})/i)?.[1]?.toLowerCase()
    ?? snapshotText.match(/charterHash["\s:=]+(sha256:[0-9a-f]{64})/i)?.[1]?.toLowerCase()
    ?? null;
}

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
    for (const section of [
      '## Goal',
      '## Invariants',
      '## Charter Invariants',
      '## Shared Contracts',
      '## Definition of Done',
      '## Change Request Protocol',
    ]) {
      if (!contract.includes(section)) problems.push(`FEATURE-CONTRACT.md is missing ${section}`);
    }

    const charter = loadCharter(ctx.workspaceRoot);
    if (charter?.hash) {
      const snapshotFile = path.join(artifacts, 'PROJECT-CONTEXT-SNAPSHOT.md');
      if (exists(snapshotFile)) {
        const snapHash = snapshotCharterHash(readText(snapshotFile));
        const current = String(charter.hash).toLowerCase();
        if (snapHash && snapHash !== current) {
          problems.push(
            `stale charterHash: snapshot has ${snapHash} but CHARTER.json hash is ${current} — recapture context`,
          );
        }
        // Also allow charterHash on the contract itself
        const contractCharter = snapshotCharterHash(contract);
        if (contractCharter && contractCharter !== current) {
          problems.push(
            `stale charterHash on FEATURE-CONTRACT.md (${contractCharter} != ${current})`,
          );
        }
      } else if (manifest.charterHash && String(manifest.charterHash).toLowerCase() !== String(charter.hash).toLowerCase()) {
        problems.push('WORK-PACKAGES.json charterHash is stale versus CHARTER.json');
      }
    }

    if (problems.length) return reject(`Feature contract cannot be frozen:\n- ${problems.join('\n- ')}`);
    return pass(`Feature Contract revision ${manifest.featureContractRevision} is frozen at ${declared}.`);
  } catch (error) {
    return reject(`Feature-contract validator failed: ${formatError(error)}`);
  }
}
