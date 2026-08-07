/**
 * Feature-tier Alignment artifacts for Cohesive Delivery (Charter slice 2).
 *
 * Features inherit Goals / Architecture / Tech from `docs/project/charter/`.
 * They declare which Goals they serve and may only add narrower constraints —
 * they must not invent project-level Goals / Architecture / Tech.
 */

import * as fs from 'fs';
import * as path from 'path';

export const ALIGNMENT_FILE = 'ALIGNMENT.md';

export interface AlignmentSeedInput {
  epicId: string;
  /** Goal ids selected from CHARTER.json (e.g. G-1, G-3). */
  servesGoals: string[];
  /** WHAT / scope for this feature. */
  scope: string;
  /**
   * Feature-only constraints that are stricter than the charter.
   * Must never relax charter invariants or tech policy.
   */
  featureConstraints: string;
}

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

const ALIGNMENT_TEMPLATE = `# Alignment — {{EPIC_ID}}

> Feature declares which charter Goals it serves. Do **not** redefine Goals,
> Architecture Principles, or Tech Policy here — those live in
> \`docs/project/charter/\`. Feature constraints may only be **narrower** than
> the charter (L2).

## Serves Goals

{{SERVES_GOALS}}

## Feature Contribution

{{SCOPE}}

## Feature Constraints

{{CONSTRAINTS}}

## Out of Scope

- _(optional — human fills)_

## Agent notes

_(Agents may append observations. Do not rewrite Serves Goals or weaken Constraints.)_
`;

function formatServesGoals(goalIds: string[]): string {
  const cleaned = goalIds.map((g) => g.trim()).filter(Boolean);
  if (!cleaned.length) {
    return '- _(select Goals from docs/project/charter/CHARTER.json — e.g. G-1)_';
  }
  return cleaned.map((id) => `- ${id}`).join('\n');
}

/**
 * Build ALIGNMENT.md content written at Start Epic for `cohesive-feature`.
 */
export function buildAlignmentSeedFile(input: AlignmentSeedInput): string {
  const scope = input.scope.trim() || '_(human: describe what this feature delivers)_';
  const constraints =
    input.featureConstraints.trim() ||
    '_(optional — only constraints stricter than the project charter)_';
  return fill(ALIGNMENT_TEMPLATE, {
    EPIC_ID: input.epicId,
    SERVES_GOALS: formatServesGoals(input.servesGoals),
    SCOPE: scope,
    CONSTRAINTS: constraints,
  });
}

/** Short description for state.json from scope. */
export function alignmentDescriptionFromSeed(input: AlignmentSeedInput): string {
  const scope = input.scope.trim();
  if (scope) { return scope.length > 240 ? `${scope.slice(0, 237)}…` : scope; }
  const goals = input.servesGoals.map((g) => g.trim()).filter(Boolean);
  if (goals.length) { return `Serves ${goals.join(', ')}`; }
  return '';
}

/** Parse `## Serves Goals` bullet ids (G-x) from ALIGNMENT.md. */
export function parseServesGoals(alignmentMd: string): string[] {
  const section = alignmentMd.match(
    /##\s*Serves Goals\s*\n([\s\S]*?)(?=\n##\s|\n*$)/i,
  )?.[1] ?? '';
  return [...new Set(
    [...section.matchAll(/\b(G-\d+)\b/g)].map((m) => m[1]),
  )];
}

export function alignmentPath(artifactsDir: string): string {
  return path.join(artifactsDir, ALIGNMENT_FILE);
}

export function alignmentExists(artifactsDir: string): boolean {
  try {
    return fs.existsSync(alignmentPath(artifactsDir))
      && fs.statSync(alignmentPath(artifactsDir)).isFile();
  } catch {
    return false;
  }
}
