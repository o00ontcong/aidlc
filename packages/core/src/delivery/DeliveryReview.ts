import * as fs from 'fs';
import * as path from 'path';

import { RunStateStore } from '../runs/RunStateStore';
import { WorkspaceLoader } from '../loader/WorkspaceLoader';
import { renderRunReport } from '../runs/runReport';
import type { DeliveryState } from './DeliveryTypes';

function readText(file: string): string {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function readJson(file: string): Record<string, unknown> | null {
  try { return JSON.parse(readText(file)) as Record<string, unknown>; } catch { return null; }
}

function artifactDir(root: string, runId: string): string {
  return path.join(root, 'docs', 'epics', runId, 'artifacts');
}

function durableReviewDir(root: string, deliveryId: string): string {
  return path.join(root, '.aidlc', 'deliveries', deliveryId, 'review');
}

export function deliveryReviewSummaryPath(workspaceRoot: string, state: DeliveryState): string {
  if (state.featureRunId && RunStateStore.load(workspaceRoot, state.featureRunId)) {
    return path.join(artifactDir(workspaceRoot, state.featureRunId), 'HUMAN-REVIEW-SUMMARY.md');
  }
  return path.join(durableReviewDir(workspaceRoot, state.id), 'HUMAN-REVIEW-SUMMARY.md');
}

function atomicWrite(file: string, content: string): void {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function markdownField(text: string, label: string): string {
  return text.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\r\\n]+)`, 'i'))?.[1]?.trim() ?? '—';
}

function verdictFor(file: string): string {
  const text = readText(file);
  return markdownField(text, 'Verdict') !== '—'
    ? markdownField(text, 'Verdict')
    : markdownField(text, 'Status');
}

function runSection(root: string, runId: string): string {
  const state = RunStateStore.load(root, runId);
  if (!state) return `- Run \`${runId}\`: state missing`;
  let pipeline;
  try {
    pipeline = WorkspaceLoader.load(root).config.pipelines.find((p) => p.id === state.pipelineId);
  } catch { /* report still works without labels */ }
  return renderRunReport({ state, pipeline });
}

export function renderDeliveryReviewBundle(workspaceRoot: string, state: DeliveryState): string {
  const featureId = state.featureRunId ?? state.request.id;
  const featureArtifacts = artifactDir(workspaceRoot, featureId);
  const charter = readJson(path.join(workspaceRoot, 'docs/project/charter/CHARTER.json'));
  const manifest = readJson(path.join(workspaceRoot, 'docs/project/context/CONTEXT-MANIFEST.json'));
  const pr = readText(path.join(featureArtifacts, 'PR-LINK.md'));
  const packageResults = state.workerRunIds.map((runId) => ({
    runId,
    result: readJson(path.join(artifactDir(workspaceRoot, runId), 'PACKAGE-RESULT.json')),
  }));
  const deferred = [state.projectContextRunId, state.featureRunId, ...state.workerRunIds]
    .filter((id): id is string => !!id)
    .flatMap((id) => RunStateStore.load(workspaceRoot, id)?.steps
      .filter((step) => step.reviewDisposition === 'deferred-to-aggregate')
      .map((step) => ({ runId: id, step })) ?? []);
  const packageDetails = packageResults.flatMap(({ runId, result }) => {
    const commits = Array.isArray(result?.commits) ? result.commits.map(String) : [];
    const changedFiles = Array.isArray(result?.changedFiles) ? result.changedFiles.map(String) : [];
    const tests = Array.isArray(result?.tests) ? result.tests : [];
    const deviations = Array.isArray(result?.deviations) ? result.deviations.map(String) : [];
    const review = verdictFor(path.join(artifactDir(workspaceRoot, runId), 'PACKAGE-REVIEW.md'));
    return [
      `### ${runId}`,
      '',
      `- Status: ${String(result?.status ?? 'missing')}`,
      `- Branch: ${String(result?.branch ?? '—')}`,
      `- Worktree: ${String(result?.worktree ?? '—')}`,
      `- Independent package review: ${review}`,
      `- Commits: ${commits.length ? commits.map((item) => `\`${item}\``).join(', ') : '—'}`,
      `- Changed files: ${changedFiles.length ? changedFiles.map((item) => `\`${item}\``).join(', ') : '—'}`,
      `- Tests: ${tests.length ? tests.map((item) => {
        if (item && typeof item === 'object') {
          const entry = item as Record<string, unknown>;
          return `\`${String(entry.command ?? entry.name ?? 'test')}\`=${String(entry.status ?? 'unknown')}`;
        }
        return String(item);
      }).join('; ') : '—'}`,
      `- Deviations: ${deviations.length ? deviations.join('; ') : 'None declared'}`,
      '',
    ];
  });

  const lines: string[] = [
    `# Human Review: ${state.id}`,
    '',
    `- **Review revision:** ${state.reviewRevision}`,
    `- **Delivery status:** ${state.status}`,
    `- **Profile:** ${state.profile.id}`,
    `- **Recommendation:** ${state.lastError ? 'BLOCKED' : state.status === 'completed' ? 'COMPLETED' : 'GO FOR HUMAN REVIEW'}`,
    '',
    '## Project Baseline',
    '',
    `- Charter revision: ${String(charter?.revision ?? '—')}`,
    `- Charter status: ${String(charter?.status ?? 'confirmed/legacy')}`,
    `- Charter origin: ${String(charter?.origin ?? 'legacy')}`,
    `- Context revision: ${String(manifest?.revision ?? '—')}`,
    `- Context source commit: ${String(manifest?.sourceCommit ?? '—')}`,
    '',
    '## Requirement',
    '',
    `- **Title:** ${state.request.title}`,
    `- **Source:** ${state.request.source?.type ?? 'manual'}${state.request.source?.reference ? ` — ${state.request.source.reference}` : ''}`,
    '',
    state.request.description.trim(),
    '',
    '### Acceptance Criteria',
    '',
    ...(state.request.acceptanceCriteria?.length
      ? state.request.acceptanceCriteria.map((item) => `- ${item}`)
      : ['- See `SPEC.md` and `ALIGNMENT.md`.']),
    '',
    '## Package Results',
    '',
    '| Run | Status | Commits | Tests | Changed files |',
    '|---|---|---:|---:|---:|',
    ...packageResults.map(({ runId, result }) => {
      const commits = Array.isArray(result?.commits) ? result.commits.length : 0;
      const tests = Array.isArray(result?.tests) ? result.tests.length : 0;
      const files = Array.isArray(result?.changedFiles) ? result.changedFiles.length : 0;
      return `| ${runId} | ${String(result?.status ?? 'missing')} | ${commits} | ${tests} | ${files} |`;
    }),
    '',
    ...packageDetails,
    '## Quality and Review Evidence',
    '',
    `- Cohesion: ${verdictFor(path.join(featureArtifacts, 'COHESION-REPORT.md'))}`,
    `- System test: ${verdictFor(path.join(featureArtifacts, 'SYSTEM-TEST-REPORT.md'))}`,
    `- Pull request: ${markdownField(pr, 'URL')}`,
    `- PR head/base: ${markdownField(pr, 'Head')} → ${markdownField(pr, 'Base')}`,
    `- PR status: ${markdownField(pr, 'Status')}`,
    `- Feature artifacts: \`docs/epics/${featureId}/artifacts/\``,
    `- Project context: \`docs/project/context/\``,
    '',
    '## Deferred Human Gates',
    '',
    ...(deferred.length
      ? deferred.map(({ runId, step }) => `- ${runId} · step ${step.stepIdx} · ${step.agent} · bundle R${step.reviewBundleRevision ?? state.reviewRevision}`)
      : ['- None.']),
    '',
    '## Risks, Deviations, and Unknowns',
    '',
    '- Review `COHESION-REPORT.md`, `INTEGRATION-CONTEXT.md`, package review reports, and provisional charter items.',
    ...(state.lastError ? [`- Blocking error: ${state.lastError}`] : []),
    '',
    '## Human Tasks',
    '',
    ...(state.reviewTasks.length
      ? state.reviewTasks.map((task) => `- [${task.status === 'done' ? 'x' : ' '}] ${task.id} · ${task.severity} · ${task.title}`)
      : ['- No tasks recorded.']),
    '',
    '## Human Decision',
    '',
    ...(state.status === 'completed'
      ? ['- Delivery is complete. Preserve this file as the final audit summary.']
      : [
        '- If changes are needed, add review tasks in the AIDLC UI or with `aidlc cohesive add-task`, then run rework.',
        '- If accepted, merge the feature PR manually and run `aidlc cohesive resume-after-merge`.',
        '- Do not mark an open or merely approved PR as merged; the post-merge validator verifies merge evidence.',
      ]),
    '',
    '## Run Audit',
    '',
  ];

  for (const runId of [state.projectContextRunId, state.featureRunId, ...state.workerRunIds]) {
    if (!runId) continue;
    lines.push(runSection(workspaceRoot, runId), '');
  }
  return `${lines.join('\n').trim()}\n`;
}

export function writeDeliveryReviewBundle(workspaceRoot: string, state: DeliveryState): string {
  const markdown = renderDeliveryReviewBundle(workspaceRoot, state);
  const tasks = `${JSON.stringify({ schemaVersion: 1, revision: state.reviewRevision, tasks: state.reviewTasks }, null, 2)}\n`;
  const durable = durableReviewDir(workspaceRoot, state.id);
  fs.mkdirSync(durable, { recursive: true });
  atomicWrite(path.join(durable, 'HUMAN-REVIEW-SUMMARY.md'), markdown);
  atomicWrite(path.join(durable, 'HUMAN-REVIEW-TASKS.json'), tasks);

  const file = deliveryReviewSummaryPath(workspaceRoot, state);
  if (path.dirname(file) !== durable) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    atomicWrite(file, markdown);
    atomicWrite(path.join(path.dirname(file), 'HUMAN-REVIEW-TASKS.json'), tasks);
  }
  return file;
}
