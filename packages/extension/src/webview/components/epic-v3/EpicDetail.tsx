/* Epic detail column — dc.html:660-958 / V3_HANDOFF §6.2.
 *
 * Eleven blocks, in the design's order, gap 14. Every control is wired to a
 * handler that already exists in this webview; the message types and payload
 * shapes are byte-identical to the ones EpicCard.tsx sends today.
 *
 * Blocks with no host field behind them carry data-mock and are rendered
 * non-interactive (see mock.tsx MOCK_IDS for the un-mocking checklist).
 */

import { useEffect, useMemo, useState } from 'react';
import { postMessage } from '@/lib/bridge';
import type { AgentMeta, EpicStepDetailFull, EpicSummary, WorkspaceState } from '@/lib/types';
import { DeleteEpicModal } from '../DeleteEpicModal';
import { DiffPane } from '../DiffPane';
import { RejectModal } from '../RejectModal';
import { RequestUpdateModal } from '../RequestUpdateModal';
import { RerunModal } from '../RerunModal';
import { RunWithFeedbackModal } from '../RunWithFeedbackModal';
import { GateModal } from './GateModal';
import { FlowCanvas } from './FlowCanvas';
import { LifecycleStrip, lifecycleKinds } from './LifecycleStrip';
import { DEFAULT_LOOP, type FlowLoop } from './flow-layout';
import {
  BADGE, ROW_DOT, configRows, epicTokenLine, flowNodes, historyRows, shipMilestones,
  stepDetailRows, stepRows,
} from './adapt';
import { isCodeHumanReviewStep, isFeaturePipeline, isPackagePipeline, runStatusUi } from './epic-logic';
import { mock } from './mock';
import {
  Btn, Card, CardHeader, CardNote, CardTitle, Chip, Ellipsis, Mono, ProgressBar,
  SectionLabel, Spacer, StatusBadgeV3,
} from './primitives';

const GAP = 14;

export function EpicDetail({
  epic, state, onOpenCharter,
}: {
  epic: EpicSummary;
  state: WorkspaceState;
  onOpenCharter: () => void;
}) {
  const [focusedIdx, setFocusedIdx] = useState(epic.currentStep ?? 0);
  useEffect(() => { setFocusedIdx(epic.currentStep ?? 0); }, [epic.id, epic.currentStep]);

  const steps = epic.stepDetails;
  const focused: EpicStepDetailFull | null = steps[focusedIdx] ?? steps[0] ?? null;
  const badge = BADGE[epic.status];
  const tokenLine = epicTokenLine(epic);
  const isPackage = isPackagePipeline(epic.pipeline);

  return (
    <div
      style={{
        flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: GAP,
      }}
    >
      {/* ① charter alignment strip */}
      <AlignmentStripV3 epic={epic} onOpenCharter={onOpenCharter} />

      {/* ② header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: GAP, flex: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Mono style={{ fontSize: 11.5, color: 'var(--txt3)', flex: 'none' }}>{epic.id}</Mono>
            <div
              style={{
                fontSize: 17, color: 'var(--txt)', fontWeight: 700, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {epic.title}
            </div>
            <StatusBadgeV3 icon={badge.icon} label={badge.label} bg={badge.bg} fg={badge.fg} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
            <ProgressBar pct={epic.progress} height={6} />
            <Mono style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{epic.progress}%</Mono>
            {tokenLine && <Mono style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{tokenLine}</Mono>}
          </div>
        </div>
        {/* Autonomy chip. No host field carries the guide/assist/auto/unattended
            axis (V3_HANDOFF §13.8), so this is display-only and marked mock. */}
        <div
          {...mock('epic.mode')}
          title="Autonomy mode chưa có field ở host — hiển thị tham khảo, chưa nối handler."
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px',
            borderRadius: 999, border: '1px solid var(--acc-bd)', background: 'var(--acc-bg)',
            color: 'var(--acc-txt)', fontSize: 12, fontWeight: 600, opacity: 0.75,
          }}
        >
          <Mono>{epic.runId ? 'guided' : 'draft'}</Mono>
        </div>
      </div>

      {/* ③ project context */}
      <ProjectContextCard />

      {/* ④ parallel epics */}
      {!isPackage && <ParallelEpicsCard epics={state.epics} currentId={epic.id} />}

      {/* ⑤ flow */}
      {steps.length > 0 && (
        <FlowCard epic={epic} focused={focused} onNodeClick={setFocusedIdx} />
      )}

      {/* ⑥ epic config */}
      <EpicConfigCard epic={epic} />

      {/* ⑦ gate banner */}
      {focused && <GateBanner epic={epic} focused={focused} focusedIdx={focusedIdx} />}

      {/* ⑧ step list */}
      {steps.length > 0 && (
        <StepListCard
          epic={epic}
          focusedIdx={focusedIdx}
          onFocus={setFocusedIdx}
        />
      )}

      {/* diff review pane — existing capability, kept for code human-review steps */}
      {focused && isCodeHumanReviewStep(focused) && epic.reviewDiff && (
        <Card style={{ overflow: 'hidden' }}>
          <DiffPane
            diffText={epic.reviewDiff}
            diffIgnore={state.diffIgnore}
            stepLabel={focused.stepName ?? focused.agent}
          />
        </Card>
      )}

      {/* ⑨ step detail + history */}
      {focused && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: GAP, flex: 'none' }}>
          <StepDetailCard epic={epic} step={focused} agentMeta={state.agentMeta} />
          <HistoryCard step={focused} />
        </div>
      )}

      {/* ⑩ ship strip */}
      {isFeaturePipeline(epic.pipeline) && <ShipStripV3 epic={epic} />}

      {/* ⑪ action bar */}
      <ActionBar epic={epic} />
    </div>
  );
}

/* ── ① dc.html:662-666 ──────────────────────────────────────────────────── */

function AlignmentStripV3({ epic, onOpenCharter }: { epic: EpicSummary; onOpenCharter: () => void }) {
  const a = epic.alignment;
  if (!a || (!a.goals.length && !a.status)) { return null; }
  // Same three states AlignmentStrip.tsx renders today.
  const variance = a.status === 'variance' || a.status === 'stale';
  const tone = a.status === 'stale' ? 'err' : a.status === 'variance' ? 'warn' : 'acc';
  const bd = tone === 'err' ? 'var(--err-bd)' : tone === 'warn' ? 'var(--warn-bd)' : 'var(--acc-bd)';
  const bg = tone === 'err' ? 'var(--err-bg)' : tone === 'warn' ? 'var(--warn-bg)' : 'var(--acc-bg)';
  const fg = tone === 'err' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : 'var(--acc-txt)';
  return (
    <div
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        borderRadius: 7, border: `1px solid ${bd}`, background: bg,
      }}
    >
      <div style={{ color: fg, fontSize: 12, flex: 'none' }}>{variance ? '▲' : '✓'}</div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>
        {variance ? 'Charter alignment: epic mở rộng ngoài phạm vi ' : 'Charter alignment: epic khớp '}
        {a.goals.map((g, i) => (
          <span key={g}>
            {i > 0 && ' · '}
            <Mono>{g}</Mono>
          </span>
        ))}
        {variance ? ' — chỉ được thu hẹp từ charter.' : '.'}
      </div>
      <div
        onClick={onOpenCharter}
        style={{ flex: 'none', whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 11.5, color: fg, fontWeight: 600 }}
      >
        {variance ? 'Xem xung đột' : 'Xem charter'}
      </div>
    </div>
  );
}

/* ── ③ dc.html:703-722 ──────────────────────────────────────────────────── */

/**
 * The host has no Project Context payload yet (no revision, no per-step state),
 * so the card keeps the design's shell but shows `—` instead of inventing
 * values, and both buttons are disabled. Marked mock at block level.
 */
function ProjectContextCard() {
  return (
    <Card mockId="epic.projectContext">
      <CardHeader pad="10px 14px">
        <CardTitle>Project Context</CardTitle>
        <Chip label="project-context" mono />
        <Chip label="—" radius={999} bg="var(--acc-bg)" fg="var(--acc-txt)" weight={600} />
        <Spacer />
        <CardNote>baseline chung — mỗi feature epic capture snapshot để chạy độc lập</CardNote>
      </CardHeader>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11.5, color: 'var(--txt3)' }}>
          Chưa có payload Project Context từ extension host.
        </div>
        <Spacer />
        <Btn label="Mở context" disabled title="Chưa có handler ở host" />
        <Btn label="Refresh context" variant="warn" disabled title="Chưa có handler ở host" />
      </div>
    </Card>
  );
}

/* ── ④ dc.html:724-749 ──────────────────────────────────────────────────── */

function ParallelEpicsCard({ epics, currentId }: { epics: EpicSummary[]; currentId: string }) {
  const siblings = epics.filter((e) => e.id !== currentId && e.status === 'in_progress');
  if (siblings.length === 0) { return null; }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature epic đang chạy song song</CardTitle>
        <CardNote>mỗi epic một terminal Claude, một branch, một PR</CardNote>
        <Spacer />
      </CardHeader>
      {siblings.map((e) => {
        const dot = ROW_DOT[e.status];
        const branch = e.inputs?.branch || e.ship?.head || '—';
        const pr = e.ship?.prUrl ? prNumber(e.ship.prUrl) : '—';
        return (
          <div
            key={e.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
              borderBottom: '1px solid var(--bd2)',
            }}
          >
            <div style={{ fontSize: 11, color: dot, flex: 'none' }}>●</div>
            <Mono
              style={{
                width: 130, flex: 'none', fontSize: 11.5, color: 'var(--txt)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {e.id}
            </Mono>
            <Ellipsis style={{ fontSize: 12, color: 'var(--txt2)' }}>{e.title}</Ellipsis>
            <Mono style={{ fontSize: 11, color: 'var(--txt3)', flex: 'none' }}>{branch}</Mono>
            <Mono style={{ fontSize: 11, color: 'var(--txt3)', width: 52, textAlign: 'right', flex: 'none' }}>
              {pr}
            </Mono>
            <Mono style={{ fontSize: 11, color: dot, width: 98, textAlign: 'right', flex: 'none' }}>
              {e.progress}%
            </Mono>
          </div>
        );
      })}
    </Card>
  );
}

function prNumber(url: string): string {
  const m = /\/(?:pull|pull-requests|merge_requests)\/(\d+)/.exec(url);
  return m ? `#${m[1]}` : 'PR';
}

/* ── ⑤ dc.html:751-818 ──────────────────────────────────────────────────── */

function FlowCard({
  epic, focused, onNodeClick,
}: {
  epic: EpicSummary;
  focused: EpicStepDetailFull | null;
  onNodeClick: (idx: number) => void;
}) {
  const nodes = useMemo(() => flowNodes(epic), [epic]);
  // DEFAULT_LOOP is keyed by pipeline id (V3_HANDOFF §6.3); only apply it when
  // both endpoints actually exist in this epic's step list.
  const loop: FlowLoop | undefined = (() => {
    const candidate = epic.pipeline ? DEFAULT_LOOP[epic.pipeline] : undefined;
    if (!candidate) { return undefined; }
    if (candidate.from >= nodes.length || candidate.to >= nodes.length) { return undefined; }
    return candidate;
  })();

  const atLabel = focused ? (focused.stepName ?? focused.agent) : '—';
  const flowNote = `${epic.stepDetails.filter((s) => s.status === 'done').length}/${epic.stepDetails.length} step xong`;
  const kinds = focused
    ? lifecycleKinds(focused.runStatus, focused.status)
    : lifecycleKinds(null, 'pending');

  return (
    <Card>
      <CardHeader pad="10px 14px" wrap>
        <CardTitle>Flow của Feature Epic</CardTitle>
        <Chip label={`${epic.pipeline ?? epic.agent ?? 'no pipeline'} · ${nodes.length} step`} mono />
        <div
          style={{
            flex: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--warn-bg)',
            color: 'var(--warn)', fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)',
              animation: 'aidlcPulse 1.3s ease-in-out infinite',
            }}
          />
          <div>{atLabel}</div>
        </div>
        <Spacer />
      </CardHeader>
      <FlowCanvas nodes={nodes} loop={loop} flowNote={flowNote} onNodeClick={onNodeClick} />
      <LifecycleStrip kinds={kinds} />
    </Card>
  );
}

/* ── ⑥ dc.html:820-851 ──────────────────────────────────────────────────── */

function EpicConfigCard({ epic }: { epic: EpicSummary }) {
  const rows = useMemo(() => configRows(epic), [epic]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cấu hình của Epic này</CardTitle>
        <Chip label="ghi đè mặc định project" bg="var(--acc-bg)" fg="var(--acc-txt)" />
        <Spacer />
        <Btn label="Sửa tất cả" disabled title="Chưa có handler ở host" />
        <Btn label="Đặt lại theo project" disabled title="Chưa có handler ở host" style={{ color: 'var(--txt2)' }} />
      </CardHeader>
      {rows.map((r) => (
        <div
          key={r.k}
          {...(r.mockId ? mock(r.mockId) : {})}
          style={{
            display: 'flex', alignItems: 'center', gap: 11, padding: '9px 14px',
            borderBottom: '1px solid var(--bd2)',
          }}
        >
          <div style={{ width: 96, flex: 'none', fontSize: 11.5, color: 'var(--txt3)' }}>{r.k}</div>
          <Ellipsis mono style={{ fontSize: 12.5, color: 'var(--txt)' }}>{r.v}</Ellipsis>
          <div style={{ fontSize: 10.5, color: r.srcFg, flex: 'none' }}>{r.src}</div>
          <div
            title="Chưa có handler ở host"
            style={{ fontSize: 11.5, color: 'var(--acc-txt)', flex: 'none', opacity: 0.45, cursor: 'not-allowed' }}
          >
            Sửa
          </div>
        </div>
      ))}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <SectionLabel>Cách vận hành epic này</SectionLabel>
        <div {...mock('epic.config.runMode', 'block')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['Guided', 'Bạn chạy và review từng step'],
            ['Autonomous Delivery', 'Claude master chạy trọn flow, dừng ở human gate'],
          ].map(([label, desc], i) => {
            // No RunMode field on EpicSummary (V3_HANDOFF §13.8) — first option
            // reflects today's actual behaviour and neither is clickable.
            const selected = i === 0;
            return (
              <div
                key={label}
                title="Chưa có field run-mode ở host"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 6,
                  border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--bd)'}`,
                  background: selected ? 'var(--acc-bg)' : 'var(--panel2)',
                  flex: 1, minWidth: 0, cursor: 'not-allowed', opacity: 0.75,
                }}
              >
                <div style={{ fontSize: 11, color: selected ? 'var(--acc-txt)' : 'var(--txt3)' }}>
                  {selected ? '◉' : '○'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.45 }}>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.5 }}>
          Không có CLI cohesive chạy ngầm — mọi thao tác đều mở lệnh nhìn thấy được trong terminal Claude.
        </div>
      </div>
    </Card>
  );
}

/* ── ⑦ dc.html:853-870 ──────────────────────────────────────────────────── */

function GateBanner({
  epic, focused, focusedIdx,
}: {
  epic: EpicSummary;
  focused: EpicStepDetailFull;
  focusedIdx: number;
}) {
  const [gateOpen, setGateOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  // Only a step actually parked on human review is a gate (EpicCard's
  // awaiting_review branch). Everything else has no banner.
  if (!epic.runId || focused.runStatus !== 'awaiting_review') { return null; }

  const runId = epic.runId;
  const stepName = focused.stepName ?? focused.agent;
  const slashCommand = focused.slashCommand;

  return (
    <div
      style={{
        flex: 'none', border: '2px solid var(--err-bd)', background: 'var(--err-bg)',
        borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ fontSize: 14, flex: 'none' }}>🔒</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 700 }}>
            Human gate · <Mono>{stepName}</Mono>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginTop: 2 }}>
            Step đang chờ bạn duyệt. Approve để đi tiếp, reject để gửi lại.
          </div>
        </div>
        <StatusBadgeV3 icon="●" label="waiting-for-user" bg="var(--warn-bg)" fg="var(--warn)" />
      </div>

      <div
        {...mock('epic.gate.consequence')}
        style={{
          fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.6, background: 'var(--panel2)',
          border: '1px solid var(--bd)', borderRadius: 6, padding: '11px 12px',
        }}
      >
        {focused.autoReviewVerdict
          ? <>Auto-review: <Mono>{focused.autoReviewVerdict.decision}</Mono>{focused.autoReviewVerdict.reason ? ` · ${focused.autoReviewVerdict.reason}` : ''}</>
          : <>Approve sẽ đánh dấu step <Mono>{stepName}</Mono> hoàn tất và mở step kế tiếp. Host chưa gửi bản kê hậu quả (file/diff) cho gate này.</>}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <Btn label="Approve" variant="primary" pad="8px 14px" fs={12.5} onClick={() => setGateOpen(true)} />
        <Btn label="Reject" variant="danger" pad="8px 13px" fs={12.5} onClick={() => setGateOpen(true)} />
        <Btn label="Rerun step" pad="8px 13px" fs={12.5} onClick={() => setRerunOpen(true)} />
        <Btn
          label="Run auto-review"
          pad="8px 13px"
          fs={12.5}
          onClick={() => postMessage({ type: 'runAutoReview', runId, stepIdx: focusedIdx })}
        />
        {slashCommand && (
          <Btn label="Run with Claude" pad="8px 13px" fs={12.5} onClick={() => setRunOpen(true)} />
        )}
      </div>

      {gateOpen && (
        <GateModal
          runId={runId}
          stepIdx={focusedIdx}
          stepName={stepName}
          gateName={stepName}
          consequence={{
            headline: `Approve step ${stepName} của ${epic.id}.`,
            scope: `${epic.stepDetails.filter((s) => s.status === 'done').length}/${epic.stepDetails.length} step đã xong.`,
            isMock: true,
          }}
          onClose={() => setGateOpen(false)}
        />
      )}
      {rerunOpen && (
        <RerunModal
          runId={runId}
          agent={focused.agent}
          rejectReason={focused.rejectReason}
          onSubmit={(feedback) =>
            postMessage({ type: 'rerunStepInline', runId, feedback, stepIdx: focusedIdx })
          }
          onClose={() => setRerunOpen(false)}
        />
      )}
      {runOpen && slashCommand && (
        <RunWithFeedbackModal
          agent={focused.agent}
          runId={runId}
          slashCommand={slashCommand}
          carriedFeedback={focused.feedback}
          onSubmit={(feedback) =>
            postMessage({ type: 'runStepWithFeedback', runId, slashCommand, feedback })
          }
          onClose={() => setRunOpen(false)}
        />
      )}
    </div>
  );
}

/* ── ⑧ dc.html:872-904 ──────────────────────────────────────────────────── */

function StepListCard({
  epic, focusedIdx, onFocus,
}: {
  epic: EpicSummary;
  focusedIdx: number;
  onFocus: (idx: number) => void;
}) {
  const rows = useMemo(() => stepRows(epic), [epic]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Step của epic</CardTitle>
        <Spacer />
        <CardNote>
          lệnh Claude có thể fail hoặc đóng — Run again with Claude mở lại đúng slash command và run id
        </CardNote>
      </CardHeader>
      {rows.map((r) => {
        const step = epic.stepDetails[r.idx];
        const isFocused = r.idx === focusedIdx;
        return (
          <div
            key={`${step.agent}-${r.idx}`}
            onClick={() => onFocus(r.idx)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 14px',
              borderBottom: '1px solid var(--bd2)', background: r.rowBg, cursor: 'pointer',
              boxShadow: isFocused ? 'inset 2px 0 0 0 var(--acc)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 18, flex: 'none', textAlign: 'center', fontSize: 12, color: r.tone }}>
                {r.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5, color: 'var(--txt)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {r.name}
                </div>
                <Mono
                  style={{
                    display: 'block', fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {r.meta}
                </Mono>
              </div>
              <StepActions epic={epic} step={step} stepIdx={r.idx} />
            </div>
            {r.error && (
              <Mono
                style={{
                  fontSize: 11.5, color: 'var(--err)', lineHeight: 1.55, paddingLeft: 28,
                  display: 'block',
                }}
              >
                {r.error}
              </Mono>
            )}
          </div>
        );
      })}
      <StepListFooter epic={epic} focusedIdx={focusedIdx} />
    </Card>
  );
}

/**
 * Per-step buttons. This is EpicCard's RunGate action set, unchanged: same
 * conditions, same message types, same payloads.
 */
function StepActions({
  epic, step, stepIdx,
}: {
  epic: EpicSummary;
  step: EpicStepDetailFull;
  stepIdx: number;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  if (!epic.runId) { return null; }
  const ui = runStatusUi(step.runStatus);
  if (!ui) { return null; }

  const runId = epic.runId;
  const status = step.runStatus!;
  const slashCommand = step.slashCommand;
  const hasPreviousAttempt = (step.tokenUsage?.calls ?? 0) > 0 || (step.history?.length ?? 0) > 0;
  const hasFeedback = !!step.feedback;

  const stop = (fn: () => void) => () => fn();

  return (
    <div style={{ display: 'flex', gap: 5, flex: 'none' }} onClick={(e) => e.stopPropagation()}>
      {status === 'awaiting_work' && (
        <>
          {slashCommand && (
            <StepBtn
              kind="primary"
              label={hasFeedback ? 'Update with feedback' : hasPreviousAttempt ? 'Run again with Claude' : 'Run with Claude'}
              onClick={stop(() => {
                if (hasFeedback) { setRunOpen(true); return; }
                postMessage({ type: 'runStepWithFeedback', runId, slashCommand, feedback: '' });
              })}
            />
          )}
          <StepBtn
            label="Mark step done"
            onClick={stop(() => postMessage({ type: 'markStepDone', runId, stepIdx }))}
          />
        </>
      )}
      {status === 'awaiting_auto_review' && (
        <StepBtn
          kind="primary"
          label="Run auto-review"
          onClick={stop(() => postMessage({ type: 'runAutoReview', runId, stepIdx }))}
        />
      )}
      {status === 'awaiting_review' && (
        <>
          <StepBtn
            kind="primary"
            label="Approve"
            onClick={stop(() => postMessage({ type: 'approveStep', runId, stepIdx }))}
          />
          <StepBtn kind="danger" label="Reject" onClick={stop(() => setRejectOpen(true))} />
        </>
      )}
      {status === 'rejected' && (
        <>
          {slashCommand && (
            <StepBtn
              kind="primary"
              label="Run again with Claude"
              onClick={stop(() => postMessage({
                type: 'rerunAndRunWithClaude',
                runId,
                stepIdx,
                slashCommand,
                feedback: step.rejectReason ?? '',
              }))}
            />
          )}
          <StepBtn label="Edit feedback first" onClick={stop(() => setRerunOpen(true))} />
        </>
      )}

      {rejectOpen && (
        <RejectModal
          runId={runId}
          currentStepIdx={stepIdx}
          stepAgents={epic.stepDetails.map((d) => d.agent)}
          onClose={() => setRejectOpen(false)}
        />
      )}
      {rerunOpen && (
        <RerunModal
          runId={runId}
          agent={step.agent}
          rejectReason={step.rejectReason}
          onSubmit={(feedback) => postMessage({ type: 'rerunStepInline', runId, feedback, stepIdx })}
          onClose={() => setRerunOpen(false)}
        />
      )}
      {runOpen && slashCommand && (
        <RunWithFeedbackModal
          agent={step.agent}
          runId={runId}
          slashCommand={slashCommand}
          carriedFeedback={step.feedback}
          onSubmit={(feedback) => postMessage({ type: 'runStepWithFeedback', runId, slashCommand, feedback })}
          onClose={() => setRunOpen(false)}
        />
      )}
    </div>
  );
}

/* dc.html:888 — step action button */
function StepBtn({
  label, onClick, kind = 'default',
}: {
  label: string;
  onClick: () => void;
  kind?: 'default' | 'primary' | 'danger';
}) {
  const skin =
    kind === 'primary'
      ? { border: '1px solid var(--acc)', background: 'var(--acc)', color: 'var(--on-acc)' }
      : kind === 'danger'
        ? { border: '1px solid var(--err-bd)', background: 'transparent', color: 'var(--err)' }
        : { border: '1px solid var(--bd)', background: 'transparent', color: 'var(--txt)' };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        cursor: 'pointer', fontSize: 11, padding: '5px 9px', borderRadius: 6,
        whiteSpace: 'nowrap', fontFamily: 'inherit', ...skin,
      }}
    >
      {label}
    </button>
  );
}

/* dc.html:897-903 */
function StepListFooter({ epic, focusedIdx }: { epic: EpicSummary; focusedIdx: number }) {
  const step = epic.stepDetails[focusedIdx];
  const canRerun = !!epic.runId && !!step?.slashCommand;
  const canStart = !epic.runId && !!epic.pipeline;
  return (
    <div style={{ padding: '10px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {canRerun && (
        <Btn
          label="Run again with Claude"
          pad="6px 11px"
          onClick={() => postMessage({
            type: 'runStepWithFeedback',
            runId: epic.runId!,
            slashCommand: step.slashCommand!,
            feedback: '',
          })}
        />
      )}
      {canStart && (
        <Btn
          label="Start pipeline run"
          variant="primary"
          pad="6px 11px"
          onClick={() => postMessage({
            type: 'startPipelineRunForEpic',
            epicId: epic.id,
            pipelineId: epic.pipeline,
          })}
        />
      )}
      {step?.stepHelp && (
        <Btn
          label="Help & guide"
          pad="6px 11px"
          onClick={() => postMessage({
            type: 'openStepHelp',
            pipelineId: epic.pipeline,
            stepName: step.stepName ?? step.agent,
          })}
        />
      )}
      {epic.statePath && (
        <Btn
          label="Open state.json"
          pad="6px 11px"
          onClick={() => postMessage({ type: 'openEpicState', path: epic.statePath })}
        />
      )}
      <Spacer />
      <Mono style={{ fontSize: 11, color: 'var(--txt3)' }}>resume từ checkpoint · giữ phase đã approve</Mono>
    </div>
  );
}

/* ── ⑨ dc.html:906-938 ─────────────────────────────────────────────────── */

function StepDetailCard({
  epic, step, agentMeta,
}: {
  epic: EpicSummary;
  step: EpicStepDetailFull;
  agentMeta: Record<string, AgentMeta>;
}) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const rows = stepDetailRows(step, agentMeta[step.agent]);
  const name = step.stepName ?? step.agent;
  const artifactName = step.artifact || agentMeta[step.agent]?.artifact || '';
  const artifactExists = step.artifactExists === true
    || (!!artifactName && (epic.existingArtifacts ?? []).includes(artifactName))
    || (!!artifactName && !!epic.artifactPaths?.[artifactName]);

  // EpicCard's Request-Update precondition, unchanged.
  const canRequestUpdate = !!epic.runId && step.runStatus === 'approved';
  const downstreamCount = epic.stepDetails
    .slice(epic.stepDetails.indexOf(step) + 1)
    .filter((s) => s.runStatus === 'approved' || s.isCurrentRunStep).length;
  const stepIdx = epic.stepDetails.indexOf(step);

  return (
    <Card>
      <CardHeader pad="10px 13px" style={{ gap: 8 }}>
        <CardTitle>Chi tiết step · {name}</CardTitle>
        <Spacer />
        {step.slashCommand && (
          <Mono
            onClick={() => postMessage({ type: 'copyCommand', command: step.slashCommand })}
            style={{ fontSize: 11, color: 'var(--txt3)', cursor: 'pointer' }}
            title="Click để copy — dán vào Claude để chạy step này"
          >
            {step.slashCommand}
          </Mono>
        )}
      </CardHeader>
      {rows.map((d) => (
        <div
          key={d.k}
          style={{ display: 'flex', gap: 12, padding: '9px 13px', borderBottom: '1px solid var(--bd2)' }}
        >
          <Mono style={{ width: 70, flex: 'none', fontSize: 11, color: 'var(--txt3)' }}>{d.k}</Mono>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{d.v}</div>
        </div>
      ))}
      <div style={{ padding: '10px 13px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {artifactName ? (
          <>
            <ArtifactChip
              name={artifactName}
              exists={artifactExists}
              epicDir={epic.epicDir}
            />
          </>
        ) : (
          <Mono style={{ fontSize: 11, color: 'var(--txt3)' }}>chưa có artifact</Mono>
        )}
        {canRequestUpdate && (
          <>
            <Spacer />
            <Btn
              label={downstreamCount > 0 ? `Request update · reset ${downstreamCount}` : 'Request update'}
              variant="warn"
              pad="4px 9px"
              fs={11}
              onClick={() => setUpdateOpen(true)}
            />
          </>
        )}
      </div>
      {updateOpen && epic.runId && (
        <RequestUpdateModal
          agent={step.agent}
          runId={epic.runId}
          stepIdx={stepIdx}
          downstreamCount={downstreamCount}
          onSubmit={(feedback) =>
            postMessage({ type: 'requestStepUpdate', runId: epic.runId!, stepIdx, feedback })
          }
          onClose={() => setUpdateOpen(false)}
        />
      )}
    </Card>
  );
}

/** dc.html:920 — artifact chip. Carries the same three actions EpicCard offers. */
function ArtifactChip({
  name, exists, epicDir,
}: {
  name: string;
  exists: boolean;
  epicDir: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        onClick={() => exists && setOpen((v) => !v)}
        title={exists ? `Mở ${name}` : 'File chưa được tạo'}
        className="v3-mono"
        style={{
          fontSize: 11, padding: '4px 8px', borderRadius: 5, background: 'var(--panel2)',
          border: '1px solid var(--bd)', color: exists ? 'var(--txt2)' : 'var(--txt3)',
          cursor: exists ? 'pointer' : 'default', opacity: exists ? 1 : 0.7,
        }}
      >
        {exists ? name : `${name} · chưa tạo`}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 20, minWidth: 210,
              overflow: 'hidden', borderRadius: 7, border: '1px solid var(--bd)',
              background: 'var(--panel2)', boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            }}
          >
            {([
              ['Open Markdown', 'openArtifactFile'],
              ['Preview', 'viewArtifact'],
              ['Feedback', 'annotateArtifact'],
            ] as const).map(([label, type], i) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setOpen(false);
                  postMessage({ type, epicDir, filename: name });
                }}
                className="v3-hover"
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px',
                  fontSize: 11.5, color: 'var(--txt)', background: 'transparent',
                  border: 'none', borderTop: i === 0 ? undefined : '1px solid var(--bd2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HistoryCard({ step }: { step: EpicStepDetailFull }) {
  const rows = historyRows(step);
  return (
    <Card>
      <div
        style={{
          padding: '10px 13px', borderBottom: '1px solid var(--bd)', fontSize: 10.5,
          letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--txt3)', fontWeight: 600,
        }}
      >
        History
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '10px 13px', fontSize: 11.5, color: 'var(--txt3)' }}>
          Chưa có event nào cho step này.
        </div>
      ) : (
        rows.map((h, i) => (
          <div
            key={i}
            style={{ display: 'flex', gap: 9, padding: '8px 13px', borderBottom: '1px solid var(--bd2)' }}
          >
            <Mono style={{ fontSize: 11, color: 'var(--txt3)', flex: 'none' }}>{h.at}</Mono>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: h.tone }}>{h.what}</div>
              <Mono style={{ display: 'block', fontSize: 10.5, color: 'var(--txt3)' }}>{h.actor}</Mono>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

/* ── ⑩ dc.html:940-952 ─────────────────────────────────────────────────── */

function ShipStripV3({ epic }: { epic: EpicSummary }) {
  const milestones = shipMilestones(epic);
  if (!epic.ship?.prUrl && !epic.ship?.status && !epic.ship?.head) { return null; }
  return (
    <div
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
        borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--panel)',
      }}
    >
      <SectionLabel fs={10.5} tracking=".09em">Ship</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
        {milestones.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot }} />
            <div style={{ fontSize: 11.5, color: s.fg }}>{s.label}</div>
            {i < milestones.length - 1 && <div style={{ width: 18, height: 1, background: 'var(--bd)' }} />}
          </div>
        ))}
      </div>
      {epic.ship?.prUrl && (
        <a
          href={epic.ship.prUrl}
          target="_blank"
          rel="noreferrer"
          className="v3-mono"
          style={{ fontSize: 11.5, color: 'var(--acc-txt)', textDecoration: 'none', flex: 'none' }}
        >
          {epic.ship.head && epic.ship.base ? `${epic.ship.head} → ${epic.ship.base}` : 'Open PR'}
        </a>
      )}
    </div>
  );
}

/* ── ⑪ dc.html:954-958 ─────────────────────────────────────────────────── */

function ActionBar({ epic }: { epic: EpicSummary }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hasInputs = Object.keys(epic.inputs || {}).length > 0;
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', paddingBottom: 6, flex: 'none' }}>
      {epic.runId && (
        <>
          <Btn
            label="Verify"
            pad="8px 13px"
            fs={12}
            title="Kiểm tra lại artifact của run này còn tồn tại và pass assertion"
            onClick={() => postMessage({ type: 'verifyRun', runId: epic.runId! })}
          />
          <Btn
            label="Report"
            pad="8px 13px"
            fs={12}
            title="Render history của run này thành Markdown report"
            onClick={() => postMessage({ type: 'runReport', runId: epic.runId! })}
          />
        </>
      )}
      <Btn
        label="Reveal artifacts"
        pad="8px 13px"
        fs={12}
        onClick={() => postMessage({ type: 'revealArtifacts', epicDir: epic.epicDir })}
      />
      <Btn
        label="Epic memory"
        pad="8px 13px"
        fs={12}
        title="Xem memory digest của epic này (decisions, constraints, reflections)"
        onClick={() => postMessage({ type: 'openEpicMemory', epicDir: epic.epicDir })}
      />
      {hasInputs && (
        <Btn
          label="Open inputs.json"
          pad="8px 13px"
          fs={12}
          onClick={() => postMessage({ type: 'openInputsJson', epicDir: epic.epicDir })}
        />
      )}
      <Btn label="Delete" variant="danger" pad="8px 13px" fs={12} onClick={() => setDeleteOpen(true)} />
      {deleteOpen && (
        <DeleteEpicModal
          epicId={epic.id}
          epicDir={epic.epicDir}
          hasRun={!!epic.runId}
          onConfirm={(deleteFolder) =>
            postMessage({
              type: 'deleteEpic',
              epicId: epic.id,
              runId: epic.runId ?? undefined,
              deleteFolder,
              confirmed: true,
            })
          }
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}
