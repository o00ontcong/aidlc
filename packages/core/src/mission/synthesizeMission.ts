import * as fs from 'node:fs';
import * as path from 'node:path';

import { section } from './checkMissionCompleteness';

const LEGACY_FILES = [
  'SPEC.md',
  'REQUIREMENT.md',
  'TASKS.md',
  'PLAN.md',
  'FEATURE-CONTRACT.md',
  'FLOW.md',
  'FEATURE-FLOW.json',
  'UI-SPEC.md',
  'ALIGNMENT.md',
] as const;

function readIfExists(file: string): string {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  } catch {
    return '';
  }
}

function headingOr(text: string, heading: string, fallback: string): string {
  const value = section(text, heading);
  if (value) return value;
  return fallback;
}

function mermaidFrom(text: string): string {
  const fence = text.match(/```mermaid[\s\S]+?```/i);
  if (fence) return fence[0];
  return '';
}

/**
 * Build a portable MISSION.md from pre-3.0 Cohesive artifacts so migrated
 * feature epics can enter `feature-implement` without a second spike run.
 * Incomplete packs stay incomplete — Start implement still gates them.
 */
export function synthesizeMissionMarkdown(artifactsDir: string): string {
  const spec = readIfExists(path.join(artifactsDir, 'SPEC.md'))
    || readIfExists(path.join(artifactsDir, 'REQUIREMENT.md'));
  const tasks = readIfExists(path.join(artifactsDir, 'TASKS.md'));
  const plan = readIfExists(path.join(artifactsDir, 'PLAN.md'));
  const contract = readIfExists(path.join(artifactsDir, 'FEATURE-CONTRACT.md'));
  const ui = readIfExists(path.join(artifactsDir, 'UI-SPEC.md'));
  const flowMd = readIfExists(path.join(artifactsDir, 'FLOW.md'));
  const flowJson = readIfExists(path.join(artifactsDir, 'FEATURE-FLOW.json'));
  const alignment = readIfExists(path.join(artifactsDir, 'ALIGNMENT.md'));

  const summary = headingOr(spec, 'Summary', headingOr(spec, 'Overview', '').slice(0, 800));
  const problem = headingOr(spec, 'Problem', headingOr(spec, 'Goal', headingOr(alignment, 'Serves', '')));
  const inScope = headingOr(spec, 'In scope', headingOr(spec, 'Scope', headingOr(alignment, 'Scope', '')));
  const outScope = headingOr(spec, 'Out of scope', '');
  const fr = headingOr(spec, 'Functional requirements', headingOr(spec, 'Requirements', headingOr(contract, 'Functional requirements', '')));
  const ac = headingOr(spec, 'Acceptance criteria', headingOr(contract, 'Acceptance criteria', ''));
  const constraints = headingOr(spec, 'Constraints', headingOr(alignment, 'Feature constraints', headingOr(contract, 'Constraints', '')));
  const taskBody = headingOr(tasks, 'Tasks', tasks.trim() || headingOr(plan, 'Tasks', plan.trim()));
  const uiBody = ui.trim()
    || headingOr(spec, 'UI spec', headingOr(contract, 'UI spec', 'N/A — no UI change'));
  const mermaid = mermaidFrom(flowMd) || mermaidFrom(spec) || mermaidFrom(plan);
  let flow = headingOr(flowMd, 'Flow', mermaid);
  if (!flow && flowJson.trim()) {
    flow = 'See migrated FEATURE-FLOW.json (convert to a mermaid diagram in this section).';
  }
  const dod = headingOr(spec, 'Definition of done', headingOr(contract, 'Definition of done', ''));

  return [
    '# MISSION',
    '',
    '> Synthesized from pre-3.0 Cohesive artifacts during migrate. Fill any empty heading before Start implement.',
    '',
    '## Summary',
    '',
    summary || '',
    '',
    '## Problem / Goal',
    '',
    problem || '',
    '',
    '## In scope',
    '',
    inScope || '',
    '',
    '## Out of scope',
    '',
    outScope || '',
    '',
    '## Functional requirements',
    '',
    fr || '',
    '',
    '## Acceptance criteria',
    '',
    ac || '',
    '',
    '## Constraints',
    '',
    constraints || '',
    '',
    '## Tasks',
    '',
    taskBody || '',
    '',
    '## UI spec',
    '',
    uiBody || 'N/A — no UI change',
    '',
    '## Flow',
    '',
    flow || '',
    '',
    '## Definition of done',
    '',
    dod || '',
    '',
  ].join('\n');
}

export function writeSynthesizedMission(artifactsDir: string): boolean {
  const dest = path.join(artifactsDir, 'MISSION.md');
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8').trim().length > 40) {
    return false;
  }
  const hasLegacy = LEGACY_FILES.some((name) => fs.existsSync(path.join(artifactsDir, name)));
  if (!hasLegacy && !fs.existsSync(dest)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(dest, synthesizeMissionMarkdown(artifactsDir), 'utf8');
    return true;
  }
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(dest, synthesizeMissionMarkdown(artifactsDir), 'utf8');
  return true;
}
