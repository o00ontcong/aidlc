import * as fs from 'fs';
import * as path from 'path';

import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { normalizeStep } from '../schema/WorkspaceSchema';
import { activeEpicsDir, resolveArtifactPath, type RunState } from '../runs/RunState';

export const COFOFO_BUG_REPORT_FILENAME = 'BUG-REPORT.md';
export const COFOFO_BUG_REPORT_TEMPLATE = 'docs/epics/{epic}/artifacts/BUG-REPORT.md';

/**
 * The only CoFoFo pipelines users may start. Anything else under `cofofo-*`
 * in `pipelines:` (legacy `cofofo-delivery`, recipe ids pasted as pipelines,
 * bootstrap aliases) is rogue and should be pruned.
 */
export const COFOFO_PIPELINE_IDS = [
  'cofofo-foundation',
  'cofofo-feature',
  'cofofo-bugfix',
] as const;

export type CofofoPipelineId = (typeof COFOFO_PIPELINE_IDS)[number];

/** @deprecated Use {@link COFOFO_PIPELINE_IDS} — kept as an alias for older call sites. */
export const COFOFO_SOURCE_PIPELINE_IDS = COFOFO_PIPELINE_IDS;

export function isCofofoPipelineId(id: string): boolean {
  return (COFOFO_PIPELINE_IDS as readonly string[]).includes(id);
}

/** @deprecated Use {@link isCofofoPipelineId}. */
export function isCofofoSourcePipelineId(id: string): boolean {
  return isCofofoPipelineId(id);
}

/**
 * True for a `cofofo-*` pipeline id outside the three canonical pipelines.
 * Epic-materialized runs use non-cofofo ids (e.g. `PASS-1087`) and are fine.
 */
export function isRogueCofofoPipelineId(id: string): boolean {
  return id.startsWith('cofofo-') && !isCofofoPipelineId(id);
}


/** Map legacy recipe aliases onto the three canonical pipeline ids. */
export function resolveCofofoPipelineId(id: string): CofofoPipelineId | null {
  if (isCofofoPipelineId(id)) return id as CofofoPipelineId;
  if (id === 'cofofo-bootstrap' || id === 'cofofo-refresh-context'
    || id === 'cofofo-update-rules' || id === 'cofofo-repin-bundle') {
    return 'cofofo-foundation';
  }
  if (id === 'cofofo-delivery') return 'cofofo-feature';
  return null;
}

/** Split pipelines into kept vs rogue `cofofo-*` entries. */
export function pruneRogueCofofoPipelines<T extends { id: string }>(
  pipelines: readonly T[],
): { kept: T[]; removed: T[] } {
  const kept: T[] = [];
  const removed: T[] = [];
  for (const pipeline of pipelines) {
    if (isRogueCofofoPipelineId(String(pipeline.id))) removed.push(pipeline);
    else kept.push(pipeline);
  }
  return { kept, removed };
}

export interface CofofoBugReportFields {
  did: string;
  observed: string;
  expected: string;
}

export function formatCofofoBugReport(fields: CofofoBugReportFields): string {
  return [
    '# Bug Report',
    '',
    '## What I Did',
    '',
    fields.did.trim(),
    '',
    '## What I Observed',
    '',
    fields.observed.trim(),
    '',
    '## What I Expected',
    '',
    fields.expected.trim(),
    '',
  ].join('\n');
}

/** Seed content when a bugfix epic is scaffolded without a structured report. */
export function formatCofofoBugReportFromEpic(args: { title?: string; description?: string }): string {
  const title = args.title?.trim() || 'Untitled epic';
  const description = args.description?.trim() || 'No description provided.';
  return formatCofofoBugReport({
    did: `Started bugfix epic "${title}".`,
    observed: description,
    expected: 'Describe the expected behavior before the diagnose phase.',
  });
}

export function pipelineIncludesDiagnose(pipeline: PipelineConfig): boolean {
  return pipeline.steps.some((step) => normalizeStep(step).name === 'diagnose');
}

export function writeCofofoBugReportFile(artifactsDir: string, content: string): void {
  const target = path.join(artifactsDir, COFOFO_BUG_REPORT_FILENAME);
  if (fs.existsSync(target)) return;
  fs.writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

/** Mirror an in-run bug report to the artifact diagnose requires on disk. */
export function persistCofofoBugReportArtifact(args: {
  workspaceRoot: string;
  state: RunState;
  pipeline: PipelineConfig;
  report: string;
}): void {
  if (!pipelineIncludesDiagnose(args.pipeline)) return;
  const epic = args.state.context.epic;
  if (!epic) return;
  const epicsDir = activeEpicsDir(args.workspaceRoot);
  const rel = resolveArtifactPath(COFOFO_BUG_REPORT_TEMPLATE, args.state.context, epicsDir);
  const absolute = path.join(args.workspaceRoot, rel);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, args.report.endsWith('\n') ? args.report : `${args.report}\n`, 'utf8');
}
