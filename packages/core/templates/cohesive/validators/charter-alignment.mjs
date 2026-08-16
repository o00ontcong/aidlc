import fs from 'node:fs';
import path from 'node:path';
import {
  approvedVarianceIds, artifactDir, currentStepName, exists,
  forbiddenTechFromCharter, formatError, frServesMap, goalIdsFromCharter,
  invariantIdsFromCharter, isMermaidDiagram, parseServesGoalsFromAlignment, pass, readJson, readText,
  reject, requireCharter,
} from './lib.mjs';

const IMPACT_CHANGES = new Set(['add', 'modify', 'delete', 'unchanged']);
const validId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(value);

function collectFeatureImpactProblems(workspaceRoot, runId) {
  const problems = [];
  const artifacts = artifactDir(workspaceRoot, runId);
  const catalogFile = path.join(workspaceRoot, 'docs', 'project', 'context', 'visualization', 'FEATURE-CATALOG.json');
  const impactFile = path.join(artifacts, 'FEATURE-IMPACT.json');
  const mermaidFile = path.join(artifacts, 'FEATURE-IMPACT.mmd');
  if (!exists(catalogFile)) {
    problems.push('FEATURE-CATALOG.json is required before plan; complete project-context map-features first');
    return problems;
  }
  if (!exists(impactFile) || !exists(mermaidFile)) {
    problems.push('Plan requires FEATURE-IMPACT.json and FEATURE-IMPACT.mmd');
    return problems;
  }
  if (!isMermaidDiagram(readText(mermaidFile))) {
    problems.push('FEATURE-IMPACT.mmd must be Mermaid flowchart or sequenceDiagram source');
  }
  let catalog;
  let impact;
  try { catalog = readJson(catalogFile); } catch {
    problems.push('FEATURE-CATALOG.json is not valid JSON');
    return problems;
  }
  try { impact = readJson(impactFile); } catch {
    problems.push('FEATURE-IMPACT.json is not valid JSON');
    return problems;
  }
  const catalogIds = new Set((catalog.features ?? []).map((feature) => feature.id).filter((id) => typeof id === 'string'));
  if (impact.schemaVersion !== 1 || !Array.isArray(impact.features) || !impact.features.length) {
    problems.push('FEATURE-IMPACT.json must be schemaVersion 1 with a features array');
    return problems;
  }
  if (typeof impact.epicId === 'string' && impact.epicId !== runId) {
    problems.push(`FEATURE-IMPACT.json epicId ${impact.epicId} does not match run ${runId}`);
  }
  const seen = new Set();
  let changed = 0;
  for (const feature of impact.features) {
    if (!validId(feature.id) || typeof feature.name !== 'string') {
      problems.push('Every FEATURE-IMPACT feature needs a stable id and name');
      continue;
    }
    if (seen.has(feature.id)) problems.push(`FEATURE-IMPACT repeats feature id ${feature.id}`);
    seen.add(feature.id);
    if (!IMPACT_CHANGES.has(feature.change)) {
      problems.push(`Feature ${feature.id} needs change add|modify|delete|unchanged`);
      continue;
    }
    if (feature.change !== 'unchanged') changed += 1;
    if ((feature.change === 'modify' || feature.change === 'delete') && !catalogIds.has(feature.id)) {
      problems.push(`${feature.change} ${feature.id} is not in FEATURE-CATALOG.json`);
    }
    if (feature.change === 'add' && catalogIds.has(feature.id)) {
      problems.push(`add ${feature.id} already exists in FEATURE-CATALOG.json; use modify`);
    }
  }
  if (!changed) problems.push('FEATURE-IMPACT.json must add, modify, or delete at least one feature');
  return problems;
}

function isPlanPhase(ctx) {
  const name = currentStepName(ctx).toLowerCase();
  return name === 'plan' || /\bplan\b/.test(name);
}

function listVarianceFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((n) => /^VR-\d+\.md$/i.test(n));
  } catch {
    return [];
  }
}

export default async function charterAlignment(ctx) {
  try {
    const artifacts = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const alignmentFile = path.join(artifacts, 'ALIGNMENT.md');
    const specFile = path.join(artifacts, 'SPEC.md');
    const planFile = path.join(artifacts, 'PLAN.md');
    const problems = [];

    let charter;
    try {
      charter = requireCharter(ctx.workspaceRoot);
    } catch (error) {
      return reject(formatError(error));
    }

    if (!exists(alignmentFile)) {
      return reject('ALIGNMENT.md is missing. Seed it at Start Epic (charter Goals + feature scope).');
    }

    const alignment = readText(alignmentFile);
    const declaredGoals = parseServesGoalsFromAlignment(alignment);
    const charterGoals = goalIdsFromCharter(charter);

    if (!declaredGoals.length) {
      problems.push('ALIGNMENT.md ## Serves Goals must list at least one G-x from the charter');
    }
    for (const g of declaredGoals) {
      if (!charterGoals.has(g)) {
        problems.push(`ALIGNMENT.md serves unknown or inactive charter goal ${g}`);
      }
    }

    if (!exists(specFile)) {
      return reject(
        problems.length
          ? `SPEC.md is missing.\n- ${problems.join('\n- ')}`
          : 'SPEC.md is missing.',
      );
    }

    const serves = frServesMap(readText(specFile));
    if (!serves.size) {
      problems.push('SPEC.md has no functional requirements (FR-x) to align');
    }

    const coveredGoals = new Set();
    for (const [fr, goals] of serves) {
      if (!goals.length) {
        problems.push(`${fr} is missing Serves: G-x`);
        continue;
      }
      for (const g of goals) {
        if (!charterGoals.has(g)) problems.push(`${fr} Serves unknown goal ${g}`);
        if (declaredGoals.length && !declaredGoals.includes(g)) {
          problems.push(`${fr} Serves ${g} which is not declared in ALIGNMENT.md`);
        }
        coveredGoals.add(g);
      }
    }

    for (const g of declaredGoals) {
      if (!coveredGoals.has(g)) {
        problems.push(`Declared goal ${g} has no FR with Serves: ${g}`);
      }
    }

    if (isPlanPhase(ctx)) {
      if (!exists(planFile)) {
        problems.push('PLAN.md is required for plan-phase charter alignment');
      } else {
        const plan = readText(planFile);
        if (!/##\s*Charter Conformance\b/i.test(plan)) {
          problems.push('PLAN.md is missing ## Charter Conformance');
        } else {
          const section = plan.match(
            /##\s*Charter Conformance\s*\n([\s\S]*?)(?=\n##\s|\n*$)/i,
          )?.[1] ?? plan;
          for (const inv of invariantIdsFromCharter(charter)) {
            if (!section.includes(inv)) {
              problems.push(`## Charter Conformance does not cover ${inv}`);
            }
          }
        }

        const forbidden = forbiddenTechFromCharter(charter);
        if (forbidden.length) {
          const planLower = plan.toLowerCase();
          const vrDir = path.join(artifacts, 'variance-requests');
          const approvedTech = new Set();
          for (const name of listVarianceFiles(vrDir)) {
            const text = readText(path.join(vrDir, name));
            if (!/\*\*Status:\*\*\s*APPROVED\b/i.test(text)) continue;
            for (const m of text.matchAll(/\b(T-\d+)\b/g)) approvedTech.add(m[1]);
            for (const rule of forbidden) {
              if (text.toLowerCase().includes(rule.value)) approvedTech.add(rule.id);
            }
          }
          // Also accept INV-level approved VR set (shared helper)
          const approved = approvedVarianceIds(artifacts);
          for (const rule of forbidden) {
            if (!planLower.includes(rule.value)) continue;
            if (approvedTech.has(rule.id) || approved.has(rule.id)) continue;
            problems.push(
              `PLAN.md references forbidden tech "${rule.value}" (${rule.id ?? 'T?'}) without an approved variance request`,
            );
          }
        }
      }
      problems.push(...collectFeatureImpactProblems(ctx.workspaceRoot, ctx.state.runId));
    }

    if (problems.length) {
      return reject(`Charter alignment failed:\n- ${[...new Set(problems)].join('\n- ')}`);
    }
    return pass(
      `Alignment covers ${declaredGoals.length} goal(s); every FR declares Serves: G-x.`,
    );
  } catch (error) {
    return reject(`Charter-alignment validator failed: ${formatError(error)}`);
  }
}
