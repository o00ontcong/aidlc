import fs from 'node:fs';
import path from 'node:path';
import {
  approvedVarianceIds, artifactDir, collectFeatureImpactProblems, currentStepName, exists,
  forbiddenTechFromCharter, formatError, frServesMap, goalIdsFromCharter,
  invariantIdsFromCharter, parseServesGoalsFromAlignment, pass, readText,
  reject, requireCharter,
} from './lib.mjs';

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
