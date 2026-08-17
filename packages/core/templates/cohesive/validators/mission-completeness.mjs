import path from 'node:path';
import {
  acceptanceCriteriaProblems, artifactDir, collectFeatureImpactProblems, exists, extractMermaidFence,
  formatError, markdownSection, mermaidEquals, pass, readText, reject,
} from './lib.mjs';
import featureFlow from './feature-flow.mjs';

const REQUIRED_HEADINGS = [
  'Summary',
  'Problem / Goal',
  'In scope',
  'Out of scope',
  'Functional requirements',
  'Acceptance criteria',
  'Constraints',
  'Tasks',
  'UI spec',
  'Flow',
  'Definition of done',
];

function headingRe(label) {
  return new RegExp(`^##\\s+${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'im');
}

export default async function missionCompleteness(ctx) {
  try {
    const file = path.join(artifactDir(ctx.workspaceRoot, ctx.state.runId), 'MISSION.md');
    if (!exists(file)) return reject('MISSION.md is missing.');
    const body = readText(file);
    const missing = [];
    for (const heading of REQUIRED_HEADINGS) {
      if (heading === 'Flow') continue;
      if (!headingRe(heading).test(body)) missing.push(heading);
    }
    const flow = markdownSection(body, 'Flow') ?? '';
    if (!headingRe('Flow').test(body)) missing.push('Flow');
    else if (!extractMermaidFence(flow)) missing.push('Flow (mermaid in ## Flow)');

    const ui = markdownSection(body, 'UI spec') ?? '';
    if (ui && !/N\/A\s*[—-]\s*no UI change/i.test(ui) && !/figma|node-id|layout|token/i.test(ui)) {
      missing.push('UI spec (N/A or Figma/layout/token)');
    }
    missing.push(...acceptanceCriteriaProblems(markdownSection(body, 'Acceptance criteria') ?? ''));
    if (/\*\*Status:\*\*\s*Draft/i.test(body) || /OQ blocking/i.test(body)) {
      missing.push('OQ blocking / Status Draft');
    }

    const flowCheck = await featureFlow(ctx);
    if (flowCheck.decision === 'reject') missing.push(flowCheck.reason);
    missing.push(...collectFeatureImpactProblems(ctx.workspaceRoot, ctx.state.runId));

    const flowFile = path.join(artifactDir(ctx.workspaceRoot, ctx.state.runId), 'FEATURE-FLOW.mmd');
    if (exists(flowFile) && extractMermaidFence(flow) && !mermaidEquals(flow, readText(flowFile))) {
      missing.push('MISSION.md ## Flow mermaid must match FEATURE-FLOW.mmd (one diagram, not two stories)');
    }

    if (missing.length) {
      return reject(`MISSION.md briefing is incomplete:\n- ${missing.join('\n- ')}`);
    }
    return pass('MISSION.md pack + Flow/Surfaces/Impact graphs are present.');
  } catch (error) {
    return reject(`Mission completeness validator failed: ${formatError(error)}`);
  }
}
