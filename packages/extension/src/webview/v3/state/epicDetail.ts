// v3/state/epicDetail.ts — lắp EpicDetailVM cho epic đang chọn.
// §6.5: chỉ flow/pipelineLabel/atLabel/flowNote/config/steps đổi theo epic
// (redraw-design vs cohesive-feature). Mọi thứ khác (tokens, gate, history,
// stepDetail, ship, parallel, independence, context) là mock cố định — đây
// là hạn chế đã biết của mock v3, xem §13 mục 11, KHÔNG tự "sửa cho đúng".
import type { EpicDetailVM, EpicRowVM } from '../data/types';
import {
  MOCK_EPICS, MOCK_EPIC_TOKENS, MOCK_ALIGNMENT_WARNING, CATALOG_CONTEXT_STEPS, MOCK_CONTEXT_BADGE,
  MOCK_FLOW_COHESIVE, MOCK_FLOW_REDRAW, FLOW_NOTE, FLOW_AT_LABEL, FLOW_PIPELINE_LABEL,
  MOCK_PARALLEL, MOCK_INDEPENDENCE, LIFECYCLE, MOCK_CONFIG_COHESIVE, MOCK_CONFIG_REDRAW,
  MOCK_GATE, MOCK_STEPS_COHESIVE, MOCK_STEPS_REDRAW, MOCK_STEP_DETAIL, MOCK_ARTIFACTS,
  MOCK_HISTORY, MOCK_SHIP, ACTION_BAR,
} from '../data/mock-data';
import { EPIC_STATE_BADGE } from './../lib/badge';
import { DEFAULT_LOOP } from '../lib/flow-layout';

export type PipelineKey = 'cohesive-feature' | 'redraw-design';

export function pipelineKeyFor(epic: EpicRowVM): PipelineKey {
  return epic.pipelineId === 'redraw-design' ? 'redraw-design' : 'cohesive-feature';
}

export function findEpic(id: string): EpicRowVM {
  return MOCK_EPICS.find((e) => e.id === id) ?? MOCK_EPICS[0];
}

/** §11 Gate banner: Approve (primary) · Reject (danger) · Rerun step · Run auto-review · Run with Claude (default). */
const GATE_ACTIONS = [
  { label: 'Approve', command: 'aidlc.gate.approve', variant: 'primary' as const },
  { label: 'Reject', command: 'aidlc.gate.reject', variant: 'danger' as const },
  { label: 'Rerun step', command: 'aidlc.step.rerun', variant: 'default' as const },
  { label: 'Run auto-review', command: 'aidlc.step.autoReview', variant: 'default' as const },
  { label: 'Run with Claude', command: 'aidlc.step.run', variant: 'default' as const },
];

export function buildEpicDetail(epic: EpicRowVM): EpicDetailVM {
  const key = pipelineKeyFor(epic);
  const isRedraw = key === 'redraw-design';
  const badge = EPIC_STATE_BADGE[epic.state];
  const flowSource = isRedraw ? MOCK_FLOW_REDRAW : MOCK_FLOW_COHESIVE;
  return {
    header: {
      id: epic.id,
      title: epic.title,
      pct: epic.pct,
      tokens: MOCK_EPIC_TOKENS,
      badge: { icon: badge.icon, label: badge.label, tone: epic.tone },
    },
    alignmentWarning: MOCK_ALIGNMENT_WARNING,
    contextSteps: CATALOG_CONTEXT_STEPS,
    contextBadge: MOCK_CONTEXT_BADGE,
    parallel: MOCK_PARALLEL,
    independence: MOCK_INDEPENDENCE,
    pipelineLabel: FLOW_PIPELINE_LABEL[key],
    atLabel: FLOW_AT_LABEL[key],
    flowNote: FLOW_NOTE[key],
    flow: {
      nodes: flowSource.map((n) => ({ name: n.name, meta: n.meta, kind: n.kind })),
      loop: DEFAULT_LOOP[key],
    },
    lifecycle: LIFECYCLE,
    config: isRedraw ? MOCK_CONFIG_REDRAW : MOCK_CONFIG_COHESIVE,
    runModes: [
      { label: 'Guided', desc: 'Bạn chạy và review từng step' },
      { label: 'Autonomous Delivery', desc: 'Claude chạy trọn flow, dừng ở human gate' },
    ],
    gate: { title: MOCK_GATE.title, sub: MOCK_GATE.sub, badge: MOCK_GATE.badge, consequence: MOCK_GATE.consequence, actions: GATE_ACTIONS },
    steps: isRedraw ? MOCK_STEPS_REDRAW : MOCK_STEPS_COHESIVE,
    stepDetail: MOCK_STEP_DETAIL,
    artifacts: MOCK_ARTIFACTS,
    history: MOCK_HISTORY,
    ship: MOCK_SHIP,
    actionBar: ACTION_BAR,
  };
}
