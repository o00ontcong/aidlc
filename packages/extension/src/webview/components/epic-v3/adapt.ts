/* Map the existing `EpicSummary` host payload onto the v3 Epic viewmodel.
 *
 * This file is pure derivation — no message passing, no new state shapes. The
 * host contract (lib/types.ts) is untouched; every value below is read from
 * data the extension already sends.
 *
 * Colour/label constants are transcribed from the design file's own JS
 * (AIDLC Workspace v3.dc.html:1458 for row dots, :1495 for the badge map) so
 * the mapping cannot drift from the picture.
 */

import type { EpicSummary, EpicStepDetailFull } from '@/lib/types';
import type { FlowKind, FlowNode } from './flow-layout';

/* dc.html:1458 — const g = 'var(--acc)', am = 'var(--warn)', rd = 'var(--err)', gr = 'var(--track)' */
export const ROW_DOT: Record<EpicSummary['status'], string> = {
  in_progress: 'var(--warn)',
  done: 'var(--acc)',
  failed: 'var(--err)',
  pending: 'var(--track)',
};

/** dc.html:1495 — badge map. Also V3_HANDOFF §6.2. */
export const BADGE: Record<EpicSummary['status'], { icon: string; bg: string; fg: string; label: string }> = {
  in_progress: { icon: '●', bg: 'var(--warn-bg)', fg: 'var(--warn)', label: 'waiting-for-user' },
  failed: { icon: '✕', bg: 'var(--err-bg)', fg: 'var(--err)', label: 'blocked' },
  done: { icon: '✓', bg: 'var(--acc-bg)', fg: 'var(--acc-txt)', label: 'completed' },
  pending: { icon: '○', bg: 'var(--hover)', fg: 'var(--txt2)', label: 'draft' },
};

/** The design's four filter labels, matching the existing EpicFilter ids 1:1. */
export const FILTER_LABEL = {
  all: 'All',
  in_progress: 'In progress',
  pending: 'Pending',
  done: 'Done',
  failed: 'Failed',
} as const;

/* ── step row presentation ───────────────────────────────────────────────── */

export interface StepRowVM {
  idx: number;
  name: string;
  meta: string;
  icon: string;
  tone: string;
  rowBg: string;
  error: string;
}

const STEP_ICON: Record<EpicStepDetailFull['status'], string> = {
  done: '✓', in_progress: '●', failed: '✕', pending: '○',
};

const STEP_TONE: Record<EpicStepDetailFull['status'], string> = {
  done: 'var(--acc-txt)', in_progress: 'var(--warn)', failed: 'var(--err)', pending: 'var(--txt3)',
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(c: number): string {
  if (c >= 100) return `$${c.toFixed(0)}`;
  if (c >= 10) return `$${c.toFixed(1)}`;
  return `$${c.toFixed(2)}`;
}

/** `412K tokens · $6.48` in the design (dc.html:1502) — real numbers here. */
export function epicTokenLine(epic: EpicSummary): string | null {
  const u = epic.tokenUsage?.total;
  if (!u || u.calls === 0) { return null; }
  return `${fmtTokens(u.totalTokens)} tokens · ${fmtCost(u.cost)}`;
}

/**
 * Step meta line. The design shows `done · DESIGN-ANALYSIS.md · figma-to-ui`
 * (dc.html:1658) — status, then artifact, then the responsible agent. All three
 * are real fields on EpicStepDetailFull.
 */
export function stepMeta(step: EpicStepDetailFull): string {
  const parts: string[] = [];
  const isAwaitingUpdate = step.status === 'pending' && (step.history ?? []).length > 0;
  parts.push(isAwaitingUpdate ? 'awaiting update' : step.runStatus ?? step.status.replace('_', ' '));
  if (step.artifact) {
    parts.push(step.artifactExists ? step.artifact : `${step.artifact} · chưa tạo`);
  }
  if (step.stepName && step.stepName !== step.agent) { parts.push(`agent ${step.agent}`); }
  const u = step.tokenUsage;
  if (u && u.calls > 0) { parts.push(`${fmtTokens(u.totalTokens)} tok`); }
  return parts.join(' · ');
}

export function stepRows(epic: EpicSummary): StepRowVM[] {
  return epic.stepDetails.map((s, idx) => ({
    idx,
    name: s.stepName ?? s.agent,
    meta: stepMeta(s),
    icon: STEP_ICON[s.status],
    tone: STEP_TONE[s.status],
    // dc.html step rowBg: active → --acc-bg, failed → --err-bg, else transparent.
    rowBg: s.status === 'failed'
      ? 'var(--err-bg)'
      : s.isCurrentRunStep || s.status === 'in_progress'
        ? 'var(--acc-bg)'
        : 'transparent',
    error: s.rejectReason || s.feedback || '',
  }));
}

/* ── flow canvas ─────────────────────────────────────────────────────────── */

/**
 * Steps → FlowCanvas nodes.
 *
 * NOTE — local extension to flow-layout's FlowKind. The design only defines
 * done | active | gate | todo; it has no node style for a FAILED step (its
 * mock epic never has one, and the step LIST carries the failure instead).
 * `failedNodeStyle()` below reuses the design's own gate palette with the
 * step-list failure icon/colour, so no new colour is invented. Flagged for
 * the design owner — see the report accompanying this change.
 */
export type FlowKindEx = FlowKind | 'failed';

/** FlowNode with the widened kind (FlowNode itself pins `kind: FlowKind`). */
export type FlowNodeEx = Omit<FlowNode, 'kind'> & { kind: FlowKindEx };

export function flowNodes(epic: EpicSummary): FlowNodeEx[] {
  return epic.stepDetails.map((s) => {
    const kind: FlowKindEx =
      s.status === 'done' ? 'done'
        : s.status === 'failed' ? 'failed'
          : s.status === 'in_progress' ? 'active'
            : s.stepHasHumanReview ? 'gate'
              : 'todo';
    return { name: s.stepName ?? s.agent, meta: stepMeta(s), kind };
  });
}

/** Gate palette (flow-layout NODE_STYLE.gate) with the failure icon/colour. */
export const FAILED_NODE_STYLE = {
  icon: '✕',
  border: '2px solid var(--err-bd)',
  bg: 'var(--err-bg)',
  iconColor: 'var(--err)',
  metaColor: 'var(--err)',
};

/* ── ship strip ──────────────────────────────────────────────────────────── */

export interface ShipMilestone { label: string; dot: string; fg: string }

/**
 * dc.html:1702 — four milestones. Driven by the real `epic.ship` payload
 * (EpicShipInfo: prUrl / status / head / base) rather than a fixed mock.
 */
export function shipMilestones(epic: EpicSummary): ShipMilestone[] {
  const ship = epic.ship;
  const status = ship?.status;
  const reached = {
    commit: !!ship?.head,
    pr: !!ship?.prUrl,
    review: status === 'approved' || status === 'merged',
    merge: status === 'merged',
  };
  // dc.html: done → dot g + fg TX; pending → dot gr + fg T3; in-flight → dot am.
  const done = (on: boolean, inFlight = false) =>
    on
      ? { dot: 'var(--acc)', fg: 'var(--txt)' }
      : inFlight
        ? { dot: 'var(--warn)', fg: 'var(--txt)' }
        : { dot: 'var(--track)', fg: 'var(--txt3)' };
  return [
    { label: 'Commit preview', ...done(reached.commit) },
    { label: 'PR', ...done(reached.pr, reached.commit && !reached.pr) },
    { label: 'Review', ...done(reached.review, reached.pr && !reached.review) },
    { label: 'Merge', ...done(reached.merge, reached.review && !reached.merge) },
  ];
}

/* ── epic config rows ────────────────────────────────────────────────────── */

export interface ConfigRowVM {
  k: string;
  v: string;
  src: string;
  srcFg: string;
  /** Set when the value has no host field behind it yet. */
  mockId?: string;
}

/**
 * dc.html:1629 — the cohesive-feature config table. Rows are built from real
 * fields where one exists; the two rows with no host field are marked mock
 * rather than filled with invented values.
 */
export function configRows(epic: EpicSummary): ConfigRowVM[] {
  const A = 'var(--acc-txt)';
  const T3 = 'var(--txt3)';
  const rows: ConfigRowVM[] = [];

  rows.push({
    k: 'pipeline',
    v: epic.pipeline
      ? `${epic.pipeline} · ${epic.stepDetails.length} step`
      : epic.artifactsOnly
        ? `artifacts-only · ${epic.stepDetails.length} step`
        : `${epic.agent ?? '—'} · single agent`,
    src: epic.pipeline ? 'bundled' : 'epic riêng',
    srcFg: epic.pipeline ? T3 : A,
  });

  rows.push({
    k: 'context',
    v: 'snapshot của Project Context',
    src: 'capture-context',
    srcFg: T3,
    mockId: 'epic.config.context',
  });

  const branch = epic.inputs?.branch || epic.ship?.head || '';
  rows.push({
    k: 'branch',
    v: branch || '—',
    src: branch ? 'epic riêng' : 'chưa có',
    srcFg: branch ? A : T3,
  });

  rows.push({
    k: 'PR',
    v: epic.ship?.prUrl
      ? `${epic.ship.prUrl}${epic.ship.status === 'merged' ? ' · merged' : ' · chưa merge'}`
      : '—',
    src: epic.ship?.prUrl ? 'epic riêng' : 'chưa có',
    srcFg: epic.ship?.prUrl ? A : T3,
  });

  const contract = (epic.existingArtifacts ?? []).find((f) => /contract/i.test(f));
  rows.push({
    k: 'contract',
    v: contract ? `${contract} · frozen` : '—',
    src: contract ? 'analyze-contract' : 'chưa có',
    srcFg: T3,
  });

  rows.push({
    k: 'artifacts',
    v: (epic.existingArtifacts ?? []).length
      ? (epic.existingArtifacts ?? []).slice(0, 3).join(' · ')
      : '—',
    src: 'theo step',
    srcFg: T3,
  });

  return rows;
}

/* ── step detail (block ⑨) ───────────────────────────────────────────────── */

export interface DetailRowVM { k: string; v: string }

/** dc.html:913 — 4 KVRows, k mono w70. Sourced from stepHelp / agent meta. */
export function stepDetailRows(
  step: EpicStepDetailFull,
  meta: { description: string; inputs: string; outputs: string; artifact: string } | undefined,
): DetailRowVM[] {
  const m = meta ?? { description: '', inputs: '', outputs: '', artifact: '' };
  const rows: DetailRowVM[] = [];
  const desc = step.stepHelp?.description || m.description;
  if (desc) { rows.push({ k: 'mục tiêu', v: desc }); }
  rows.push({ k: 'input', v: step.stepHelp?.inputs || m.inputs || '—' });
  rows.push({ k: 'output', v: step.stepHelp?.outputs || m.outputs || '—' });
  if (step.stepHelp?.model) { rows.push({ k: 'model', v: step.stepHelp.model }); }
  const gates: string[] = [];
  if (step.stepHasAutoReview) { gates.push('auto-review'); }
  if (step.stepHasHumanReview) { gates.push('human review'); }
  rows.push({ k: 'gate', v: gates.length ? gates.join(' → ') : 'không có gate' });
  return rows;
}

/* ── history (block ⑨ right) ─────────────────────────────────────────────── */

export interface HistoryRowVM { at: string; what: string; tone: string; actor: string }

/** dc.html:1694 — time (mono) + what (toned) + actor (mono). Real step history. */
export function historyRows(step: EpicStepDetailFull | null): HistoryRowVM[] {
  const entries = step?.history ?? [];
  return entries
    .slice()
    .reverse()
    .map((e) => {
      const at = (() => {
        try {
          const d = new Date(e.at);
          if (Number.isNaN(d.getTime())) { return e.at; }
          return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        } catch { return e.at; }
      })();
      switch (e.kind) {
        case 'reject':
          return {
            at,
            what: `Step rejected${e.reason ? ` · ${e.reason}` : ''}`,
            tone: 'var(--err)',
            actor: `rev ${e.revision}`,
          };
        case 'rerun':
          return {
            at,
            what: `Rerun${e.feedback ? ` · ${e.feedback}` : ''}`,
            tone: 'var(--warn)',
            actor: `rev ${e.revision}`,
          };
        case 'auto_review':
          return {
            at,
            what: `Auto-review ${e.decision === 'pass' ? 'pass' : 'reject'}${e.reason ? ` · ${e.reason}` : ''}`,
            tone: e.decision === 'pass' ? 'var(--acc-txt)' : 'var(--err)',
            actor: 'system',
          };
        case 'approve':
          return { at, what: 'Approved', tone: 'var(--acc-txt)', actor: `rev ${e.revision}` };
        case 'annotate':
          return {
            at,
            what: `Annotated${e.summary ? ` · ${e.summary}` : ''}`,
            tone: 'var(--txt2)',
            actor: e.author ? `user:${e.author}` : 'annotron',
          };
      }
    });
}
