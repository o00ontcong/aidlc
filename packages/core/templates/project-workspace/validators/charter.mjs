import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  artifactDir, currentStepName, exists, formatError, inputsFor, pass, readJson, readText, reject,
} from './lib.mjs';

const MD_FILES = ['NORTH-STAR.md', 'ARCHITECTURE-PRINCIPLES.md', 'TECH-POLICY.md'];
const MIN_IDEA_CHARS = 20;

function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

function computeMarkdownHash(charterDir) {
  const parts = [];
  for (const name of MD_FILES) {
    const file = path.join(charterDir, name);
    if (!exists(file)) return { error: `${name} is missing` };
    parts.push(fs.readFileSync(file));
  }
  // Match core computeCharterMarkdownHash: concatenate raw file bytes in order.
  return { hash: sha256Text(Buffer.concat(parts)) };
}

function uniqueIds(items, label, problems) {
  const seen = new Set();
  for (const item of items ?? []) {
    const id = item?.id;
    if (!id || typeof id !== 'string') {
      problems.push(`${label} entry missing id`);
      continue;
    }
    if (seen.has(id)) problems.push(`duplicate ${label} id: ${id}`);
    seen.add(id);
  }
}

function validateCharterShape(workspaceRoot, problems) {
  const charterDir = path.join(workspaceRoot, 'docs', 'project', 'charter');
  const conventions = path.join(workspaceRoot, 'docs', 'project', 'conventions', 'CONVENTIONS.md');
  const charterFile = path.join(charterDir, 'CHARTER.json');

  if (!exists(conventions)) {
    problems.push('docs/project/conventions/CONVENTIONS.md is required at bootstrap');
  }

  for (const name of MD_FILES) {
    if (!exists(path.join(charterDir, name))) problems.push(`${name} is missing`);
  }
  if (!exists(charterFile)) {
    problems.push('CHARTER.json is missing');
    return null;
  }

  const charter = readJson(charterFile);
  if (!Number.isInteger(charter.revision) || charter.revision < 1) {
    problems.push('CHARTER.json revision must be a positive integer');
  }

  const hashed = computeMarkdownHash(charterDir);
  if (hashed.error) {
    problems.push(hashed.error);
  } else if (String(charter.hash ?? '').toLowerCase() !== hashed.hash.toLowerCase()) {
    problems.push(
      `CHARTER.json hash mismatch (declared ${charter.hash ?? 'missing'} != actual ${hashed.hash})`,
    );
  }

  if (!Array.isArray(charter.goals) || charter.goals.length === 0) {
    problems.push('CHARTER.json must declare at least one goal');
  } else {
    for (const goal of charter.goals) {
      if (!goal?.metric || !String(goal.metric).trim()) {
        problems.push(`goal ${goal?.id ?? '(missing id)'} is missing metric`);
      }
    }
  }

  uniqueIds(charter.goals, 'goal', problems);
  uniqueIds(charter.invariants, 'invariant', problems);
  uniqueIds(charter.techRules, 'techRule', problems);

  for (const inv of charter.invariants ?? []) {
    if (inv?.severity !== 'advisory' && inv?.severity !== 'blocking') {
      problems.push(`invariant ${inv?.id ?? '(missing)'} severity must be advisory|blocking`);
    }
  }

  return charter;
}

function validateDriftCoverage(workspaceRoot, charter, problems) {
  const reportFile = path.join(
    workspaceRoot, 'docs', 'project', 'conformance', 'DRIFT-REPORT.md',
  );
  if (!exists(reportFile)) {
    problems.push('DRIFT-REPORT.md is missing');
    return;
  }
  const report = readText(reportFile);
  for (const inv of charter?.invariants ?? []) {
    const id = inv?.id;
    if (!id) continue;
    // Require a heading or bold mention of each INV-x.
    const re = new RegExp(`(?:^|\\n)#{2,3}\\s*${id}\\b|\\*\\*${id}\\*\\*|\\b${id}\\b`, 'i');
    if (!re.test(report)) {
      problems.push(`DRIFT-REPORT.md does not cover ${id}`);
    }
  }
}

/**
 * define-charter Mode A: idea from Start Epic + 1:1 interview log must exist.
 * Bootstrap templates alone are not enough to pass this step.
 */
function validateDefineCharterInterview(workspaceRoot, runId, problems) {
  if (!runId) {
    problems.push('define-charter requires run id to load inputs.json and CHARTER-DISCOVERY.md');
    return;
  }

  const inputs = inputsFor(workspaceRoot, runId);
  const idea = typeof inputs.idea === 'string' ? inputs.idea.trim() : '';
  if (idea.length < MIN_IDEA_CHARS) {
    problems.push(
      `inputs.json must include idea (≥${MIN_IDEA_CHARS} chars) from the Start Epic Description`,
    );
  }

  const discoveryFile = path.join(artifactDir(workspaceRoot, runId), 'CHARTER-DISCOVERY.md');
  if (!exists(discoveryFile)) {
    problems.push(
      'artifacts/CHARTER-DISCOVERY.md is missing — complete the 1:1 define-charter interview first',
    );
    return;
  }

  const discovery = readText(discoveryFile);
  if (!/##\s*Discovery decisions/i.test(discovery)) {
    problems.push('CHARTER-DISCOVERY.md must include ## Discovery decisions summarizing confirmed Intent');
  } else if (!/##\s*Discovery decisions[\s\S]{40,}/i.test(discovery)) {
    problems.push('## Discovery decisions is too thin — record confirmed Goals, INV-x, and T-x');
  }
}

function validateInferredExisting(workspaceRoot, runId, charter, problems) {
  if (!runId) { problems.push('inferred-existing define-charter requires a run id'); return; }
  const discoveryFile = path.join(artifactDir(workspaceRoot, runId), 'CHARTER-DISCOVERY.md');
  if (!exists(discoveryFile)) { problems.push('CHARTER-DISCOVERY.md is missing'); return; }
  const discovery = readText(discoveryFile);
  for (const section of ['## Discovery Mode', '## Evidence Sources', '## Observed Facts', '## Discovery decisions']) {
    if (!discovery.includes(section)) problems.push(`CHARTER-DISCOVERY.md is missing ${section}`);
  }
  if (!/inferred-existing|existing-project inference|existing charter reused/i.test(discovery)) {
    problems.push('CHARTER-DISCOVERY.md does not identify inferred-existing discovery/refresh');
  }
  const evidence = discovery.match(/## Evidence Sources\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1] ?? '';
  if (!/[`/][^\n]+|^-\s+\S/m.test(evidence)) problems.push('Evidence Sources must cite repository paths');
  if (charter?.origin === 'existing-project-inference') {
    if (charter.status !== 'provisional' && charter.status !== 'confirmed') {
      problems.push('inferred charter status must be provisional|confirmed');
    }
    for (const item of [...(charter.goals ?? []), ...(charter.invariants ?? []), ...(charter.techRules ?? [])]) {
      if (!Array.isArray(item.sources) || !item.sources.length) problems.push(`${item.id ?? 'charter item'} is missing sources`);
      if (!['low', 'medium', 'high'].includes(item.confidence)) problems.push(`${item.id ?? 'charter item'} is missing confidence`);
      if (!['pending', 'confirmed'].includes(item.confirmation)) problems.push(`${item.id ?? 'charter item'} is missing confirmation`);
    }
  }
}

export default async function charter(ctx) {
  try {
    const problems = [];
    const charter = validateCharterShape(ctx.workspaceRoot, problems);
    const step = currentStepName(ctx);
    const checkDrift = /check-drift/i.test(step)
      || /check.drift/i.test(ctx.step?.agent ?? '')
      || ctx.paths?.produces?.some?.((p) => String(p).includes('DRIFT-REPORT'));
    const defineCharter = /define-charter/i.test(step)
      || ctx.paths?.produces?.some?.((p) => String(p).includes('CHARTER-DISCOVERY'));

    if (defineCharter) {
      const inputs = inputsFor(ctx.workspaceRoot, ctx.state?.runId);
      if (inputs.context_mode === 'inferred-existing') {
        validateInferredExisting(ctx.workspaceRoot, ctx.state?.runId, charter, problems);
      } else {
        validateDefineCharterInterview(ctx.workspaceRoot, ctx.state?.runId, problems);
      }
    }

    if (checkDrift && charter) {
      validateDriftCoverage(ctx.workspaceRoot, charter, problems);
    }

    if (problems.length) {
      return reject(`Charter validation failed:\n- ${problems.join('\n- ')}`);
    }
    return pass(
      checkDrift
        ? `Charter revision ${charter.revision} is consistent and drift report covers all invariants.`
        : defineCharter
          ? `Charter revision ${charter.revision} is consistent; discovery evidence is recorded.`
          : `Charter revision ${charter.revision} is consistent (hash, ids, metrics, conventions).`,
    );
  } catch (error) {
    return reject(`Charter validator failed: ${formatError(error)}`);
  }
}
