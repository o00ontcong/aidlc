import * as fs from 'fs';
import * as path from 'path';

import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { normalizeStep } from '../schema/WorkspaceSchema';
import { activeEpicsDir, resolveArtifactPath, type RunState } from '../runs/RunState';

export const COFOFO_BUG_REPORT_FILENAME = 'BUG-REPORT.md';
export const COFOFO_BUG_REPORT_TEMPLATE = 'docs/epics/{epic}/artifacts/BUG-REPORT.md';

/** Pipelines that define step templates — start epics via recipes, not these ids. */
export const COFOFO_SOURCE_PIPELINE_IDS = ['cofofo-delivery', 'cofofo-foundation'] as const;

export function isCofofoSourcePipelineId(id: string): boolean {
  return (COFOFO_SOURCE_PIPELINE_IDS as readonly string[]).includes(id);
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
