import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { briefingSummary, isBriefingPipeline, primaryFlowMermaid } from '../src/webview/components/epic-v3/epic-logic';
import {
  SAMPLE_MISSION,
  SAMPLE_THIN_REQUIREMENT,
  blankEpic,
  briefingGateCopy,
  checkMissionCompleteness,
  completenessChips,
  isImplementStartBlocked,
  kindLabel,
  packTextForSource,
  phaseLabel,
  pipelineChipLabel,
  seedThreePipelineEpics,
} from '../src/webview/components/epic-v3/three-pipeline';
import { STATE } from '../harness/state';

describe('three-pipeline mission pack', () => {
  it('accepts the spike copy/paste pack', () => {
    const result = checkMissionCompleteness(SAMPLE_MISSION);
    expect(result).toEqual({ ok: true, missing: [] });
  });

  it('rejects a thin external requirement', () => {
    const result = checkMissionCompleteness(SAMPLE_THIN_REQUIREMENT);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('Acceptance criteria');
    expect(result.missing).toContain('Flow');
  });

  it('rejects a pack that still has blocking open questions', () => {
    const draft = SAMPLE_MISSION
      .replace('**Status:** Ready for implement', '**Status:** Draft')
      .replace('## Definition of done', 'OQ blocking: missing Figma node\n\n## Definition of done');
    const result = checkMissionCompleteness(draft);
    expect(result.ok).toBe(false);
    expect(result.missing.some((item) => item.includes('OQ'))).toBe(true);
  });

  it('seeds context briefing and a running spike, not a chained implement', () => {
    const seed = seedThreePipelineEpics();
    expect(seed.map((epic) => epic.kind)).toEqual(['project-context', 'feature-spike']);
    expect(seed[0]?.phase).toBe('briefing');
    expect(seed[1]?.phase).toBe('running');
  });

  it('starts implement as need-pack so the human chooses the source', () => {
    const epic = blankEpic('feature-implement', 'PAY-I', 'Checkout');
    expect(epic.phase).toBe('need-pack');
    expect(kindLabel(epic.kind)).toBe('IMPLEMENT');
    expect(phaseLabel(epic.phase)).toBe('thiếu pack');
  });

  it('labels chips with the three pipeline ids, not cohesive-feature', () => {
    expect(pipelineChipLabel('project-context')).toBe('project-context');
    expect(pipelineChipLabel('feature-spike')).toBe('feature-spike');
    expect(pipelineChipLabel('feature-implement')).toBe('feature-implement');
    expect(pipelineChipLabel('cohesive-feature')).toBe('cohesive-feature');
  });

  it('shows completeness chips for the Start implement gate', () => {
    const ok = completenessChips(checkMissionCompleteness(SAMPLE_MISSION));
    expect(ok.every((chip) => chip.ok)).toBe(true);
    const thin = completenessChips(checkMissionCompleteness(SAMPLE_THIN_REQUIREMENT));
    expect(thin.every((chip) => !chip.ok)).toBe(true);
  });

  it('treats a thin Jira ticket as an incomplete pack', () => {
    const jira = packTextForSource('jira', { jiraRef: 'https://example.atlassian.net/browse/PASS-12' });
    expect(checkMissionCompleteness(jira).ok).toBe(false);
    const spike = packTextForSource('spike', { spikeMissionMd: SAMPLE_MISSION });
    expect(checkMissionCompleteness(spike).ok).toBe(true);
  });

  it('writes gate copy per step; Approve bản sửa only on resolve-bugs', () => {
    expect(briefingGateCopy('establish-baseline').body).toContain('GO publish');
    expect(briefingGateCopy('package-mission').approveLabel).toBe('Approve');
    expect(briefingGateCopy('implement').body).toContain('Fidelity');
    expect(briefingGateCopy('resolve-bugs', { description: 'Sheet trắng 2 đầu' }).approveLabel).toBe('Approve bản sửa');
    expect(briefingGateCopy('specify').approveLabel).toBe('Approve');
  });
});

describe('epic briefing layout', () => {
  it('treats project-context, spike and implement as briefing pipelines', () => {
    expect(isBriefingPipeline('project-context')).toBe(true);
    expect(isBriefingPipeline('cohesive-feature')).toBe(true);
    expect(isBriefingPipeline('feature-spike')).toBe(true);
    expect(isBriefingPipeline('feature-implement')).toBe(true);
    expect(isBriefingPipeline('redraw-design')).toBe(false);
  });

  it('prefers flow mermaid over surfaces and impact', () => {
    expect(primaryFlowMermaid({
      impactMermaid: 'flowchart TD\n  a-->b',
      surfacesMermaid: 'flowchart LR\n  c-->d',
      flowMermaid: 'flowchart LR\n  x-->y',
    })).toBe('flowchart LR\n  x-->y');
  });

  it('builds a short summary from description and goals', () => {
    expect(briefingSummary({
      title: 'Partial refunds',
      description: 'Refund một phần trên checkout.',
      alignment: { goals: ['G-02'], status: 'aligned' },
      inputs: {},
    })).toContain('Serves: G-02');
  });

  it('does not add a 3P control or replace the epic list', () => {
    const root = path.resolve(process.cwd());
    const list = fs.readFileSync(path.join(root, 'src/webview/components/epic-v3/EpicListPanel.tsx'), 'utf8');
    const view = fs.readFileSync(path.join(root, 'src/webview/components/EpicsView.tsx'), 'utf8');
    const detail = fs.readFileSync(path.join(root, 'src/webview/components/epic-v3/EpicDetail.tsx'), 'utf8');
    expect(list).not.toContain('onThreePipelineMock');
    expect(list).not.toContain('3P');
    expect(view).not.toContain('ThreePipelineMock');
    expect(detail).toContain('Agent timeline');
    expect(detail).toContain('isBriefingPipeline');
    expect(detail).toContain('Chọn nguồn pack');
    expect(detail).toContain('Approve bản sửa');
    expect(list).toContain('pipelineChipLabel');
    const startModal = fs.readFileSync(path.join(root, 'src/webview/components/epic-v3/StartImplementModal.tsx'), 'utf8');
    expect(startModal).toContain('Start Feature Implement');
    expect(startModal).toContain('Completeness');
  });

  it('harness epics use the 2 / 1 / 3 step timelines and block PAY-THIN', () => {
    const byId = Object.fromEntries(STATE.epics.map((epic) => [epic.id, epic]));
    expect(byId['CTX-1']?.stepDetails.map((step) => step.stepName ?? step.agent))
      .toEqual(['establish-baseline', 'publish-context']);
    expect(byId['PAY-S']?.stepDetails.map((step) => step.stepName ?? step.agent))
      .toEqual(['package-mission']);
    expect(byId['PAY-I']?.stepDetails.map((step) => step.stepName ?? step.agent))
      .toEqual(['implement', 'resolve-bugs', 'ship']);
    expect(byId['PAY-BUG']?.stepDetails.map((step) => step.stepName ?? step.agent))
      .toEqual(['implement', 'resolve-bugs', 'ship']);
    expect(byId['PAY-THIN']?.stepDetails.map((step) => step.stepName ?? step.agent))
      .toEqual(['implement', 'resolve-bugs', 'ship']);
    expect(byId['PAY-THIN']?.stepDetails.some((step) => (step.stepName ?? step.agent) === 'specify')).toBe(false);
    expect(isImplementStartBlocked(byId['PAY-THIN']!)).toBe(true);
    expect(isImplementStartBlocked(byId['PAY-I']!)).toBe(false);
    expect(byId['CTX-1']?.pipeline).toBe('project-context');
    expect(byId['PAY-S']?.pipeline).toBe('feature-spike');
    expect(byId['PAY-I']?.pipeline).toBe('feature-implement');
  });
});
