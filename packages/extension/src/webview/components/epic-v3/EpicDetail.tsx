/* Epic detail column — dc.html:660-958 / V3_HANDOFF §6.2.
 *
 * Eleven blocks, in the design's order, gap 14. Every control is wired to a
 * handler that already exists in this webview; the message types and payload
 * shapes are byte-identical to the ones EpicCard.tsx sends today.
 *
 * Blocks with no host field behind them carry data-mock and are rendered
 * non-interactive (see mock.tsx MOCK_IDS for the un-mocking checklist).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { postMessage } from '@/lib/bridge';
import { runStepButtonLabel, isRunStepDisabled, runStepDisabledHint } from '@/lib/providers';
import type { AgentMeta, EpicStepDetailFull, EpicSummary, ProviderConfig, StepStatus, WorkspaceState } from '@/lib/types';
import { DeleteEpicModal } from '../DeleteEpicModal';
import { EpicVisualsCard } from './EpicVisuals';
import { DiffPane } from '../DiffPane';
import { RejectModal } from '../RejectModal';
import { RequestUpdateModal } from '../RequestUpdateModal';
import { RerunModal } from '../RerunModal';
import { RunWithFeedbackModal } from '../RunWithFeedbackModal';
import { GateModal } from './GateModal';
import { FlowCanvas } from './FlowCanvas';
import { DEFAULT_LOOP, type FlowLoop } from './flow-layout';
import {
  BADGE, ROW_DOT, configRows, epicTokenLine, flowNodes, historyRows, shipMilestones,
  stepDetailRows, stepRows,
} from './adapt';
import { isBugResolutionStep, isCodeHumanReviewStep, isBriefingPipeline, isFeaturePipeline, isPackagePipeline, runStatusUi } from './epic-logic';
import { briefingGateCopy, isFeatureSpikePipeline, isImplementStartBlocked, pipelineChipLabel } from './three-pipeline';
import { humanInterventionTooltip } from './human-intervention';
import { mock } from './mock';
import {
  Btn, Card, CardHeader, CardNote, CardTitle, Chip, DisclosureBtn, Ellipsis, Mono, ProgressBar,
  SectionLabel, Spacer, StatusBadgeV3,
} from './primitives';

const GAP = 14;

export function EpicDetail({
  epic, state, onOpenCharter, onChoosePack, onStartImplementFromSpike,
}: {
  epic: EpicSummary;
  state: WorkspaceState;
  onOpenCharter: () => void;
  onChoosePack?: () => void;
  onStartImplementFromSpike?: (epic: EpicSummary) => void;
}) {
  const [focusedIdx, setFocusedIdx] = useState(epic.currentStep ?? 0);
  useEffect(() => { setFocusedIdx(epic.currentStep ?? 0); }, [epic.id, epic.currentStep]);

  const steps = epic.stepDetails;
  const focused: EpicStepDetailFull | null = steps[focusedIdx] ?? steps[0] ?? null;
  const badge = BADGE[epic.status];
  const tokenLine = epicTokenLine(epic);
  const isPackage = isPackagePipeline(epic.pipeline);
  const briefing = isBriefingPipeline(epic.pipeline);

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
            {pipelineChipLabel(epic.pipeline) && (
              <Chip label={pipelineChipLabel(epic.pipeline)!} mono />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
            <ProgressBar pct={epic.progress} height={6} />
            <Mono style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{epic.progress}%</Mono>
            {tokenLine && <Mono style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{tokenLine}</Mono>}
          </div>
        </div>
        {/* Mirrors the persisted run mode selected in the config card below. */}
        <div
          title={epic.runMode === 'autonomous'
            ? 'Autonomous: provider đang chọn tự chạy các phase nội bộ, chỉ dừng ở human gate (Approve). Không phải nút Start.'
            : 'Guided: bạn bấm Run từng step và tự review. Pill này chỉ báo mode, không đổi mode — đổi ở Cấu hình epic (mở Agent timeline).'}
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px',
            borderRadius: 999, border: '1px solid var(--acc-bd)', background: 'var(--acc-bg)',
            color: 'var(--acc-txt)', fontSize: 12, fontWeight: 600, opacity: 0.75,
          }}
        >
          <Mono>{epic.runMode === 'autonomous' ? 'autonomous' : 'guided'}</Mono>
          <span style={{ fontSize: 11, fontWeight: 500 }}>
            {epic.runMode === 'autonomous' ? 'provider chạy đến gate' : 'bạn chạy từng step'}
          </span>
        </div>
      </div>

      {/* User-entered brief and Cohesive Delivery alignment captured at creation. */}
      {!briefing && <EpicRequestCard epic={epic} />}

      <EpicVisualsCard epic={epic} />

      {briefing ? (
        <>
          {isFeatureSpikePipeline(epic.pipeline) && (
            <StartImplementFromSpikeCard
              epic={epic}
              onStart={() => onStartImplementFromSpike?.(epic)}
            />
          )}
          {isImplementStartBlocked(epic) ? (
            <PackBlockedBanner onChoosePack={onChoosePack} />
          ) : focused && (
            <GateBanner
              epic={epic}
              focused={focused}
              focusedIdx={focusedIdx}
              providerConfig={state.providerConfig}
            />
          )}
          {focused && isCodeHumanReviewStep(focused) && epic.reviewDiff && (
            <Card style={{ overflow: 'hidden' }}>
              <DiffPane
                diffText={epic.reviewDiff}
                diffIgnore={state.diffIgnore}
                stepLabel={focused.stepName ?? focused.agent}
              />
            </Card>
          )}
          {steps.length > 0 && (
            <AgentTimeline
              steps={steps}
              focusedIdx={focusedIdx}
              onFocus={setFocusedIdx}
            >
              <EpicConfigCard epic={epic} />
              <StepListCard
                epic={epic}
                focusedIdx={focusedIdx}
                onFocus={setFocusedIdx}
                providerConfig={state.providerConfig}
                packBlocked={isImplementStartBlocked(epic)}
                onChoosePack={onChoosePack}
              />
              {focused && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: GAP, flex: 'none' }}>
                  <StepDetailCard
                    epic={epic}
                    step={focused}
                    agentMeta={state.agentMeta}
                    providerConfig={state.providerConfig}
                  />
                  <HistoryCard step={focused} />
                </div>
              )}
            </AgentTimeline>
          )}
          {isFeaturePipeline(epic.pipeline) && <ShipStripV3 epic={epic} />}
          <ActionBar epic={epic} />
        </>
      ) : (
        <>
      {/* ③ project context */}
      <ProjectContextCard context={state.projectContext} />

      {/* ④ parallel epics */}
      {!isPackage && <ParallelEpicsCard epics={state.epics} currentId={epic.id} />}

      {/* ⑤ flow */}
      {steps.length > 0 && (
        <FlowCard
          epic={epic}
          focused={focused}
          onNodeClick={setFocusedIdx}
        />
      )}

      {/* ⑥ epic config */}
      <EpicConfigCard epic={epic} />

      {/* ⑦ gate banner */}
      {focused && (
        <GateBanner
          epic={epic}
          focused={focused}
          focusedIdx={focusedIdx}
          providerConfig={state.providerConfig}
        />
      )}

      {/* ⑧ step list */}
      {steps.length > 0 && (
        <StepListCard
          epic={epic}
          focusedIdx={focusedIdx}
          onFocus={setFocusedIdx}
          providerConfig={state.providerConfig}
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
          <StepDetailCard
            epic={epic}
            step={focused}
            agentMeta={state.agentMeta}
            providerConfig={state.providerConfig}
          />
          <HistoryCard step={focused} />
        </div>
      )}

      {/* ⑩ ship strip */}
      {isFeaturePipeline(epic.pipeline) && <ShipStripV3 epic={epic} />}

      {/* ⑪ action bar */}
      <ActionBar epic={epic} />
        </>
      )}
    </div>
  );
}

function StartImplementFromSpikeCard({ epic, onStart }: { epic: EpicSummary; onStart: () => void }) {
  const hasMission = (epic.existingArtifacts ?? []).includes('MISSION.md');
  const ready = epic.status === 'done' && hasMission;
  const reason = !hasMission
    ? 'Spike chưa tạo MISSION.md.'
    : epic.status !== 'done'
      ? 'Hoàn tất và approve package-mission trước khi bắt đầu implement.'
      : '';
  return (
    <Card
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderColor: ready ? 'var(--acc-bd)' : 'var(--warn-bd)',
        background: ready ? 'var(--acc-bg)' : 'var(--warn-bg)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 700 }}>Start implement</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 3, lineHeight: 1.45 }}>
          {ready
            ? 'Agent sẽ phân tích MISSION.md, tạo một hoặc nhiều epic feature-implement với pack riêng; chưa chạy code.'
            : reason}
        </div>
      </div>
      <Btn
        label="Start implement"
        variant="primary"
        pad="8px 13px"
        fs={12}
        disabled={!ready}
        title={ready ? 'Phân rã spike thành các epic feature-implement.' : reason}
        onClick={onStart}
      />
    </Card>
  );
}

function stepDot(status: StepStatus | string): string {
  if (status === 'approved' || status === 'done') return 'var(--acc)';
  if (status === 'rejected' || status === 'failed') return 'var(--err)';
  if (status === 'awaiting_review' || status === 'awaiting_auto_review' || status === 'in_progress') {
    return 'var(--warn)';
  }
  return 'var(--track)';
}

/* ── Agent timeline (briefing layout: internals stay collapsed) ─────────── */

function AgentTimeline({
  steps, focusedIdx, onFocus, children,
}: {
  steps: EpicStepDetailFull[];
  focusedIdx: number;
  onFocus: (idx: number) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = steps[focusedIdx];
  const currentName = current?.stepName ?? current?.agent ?? `step ${focusedIdx + 1}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 7, border: '1px solid var(--bd)',
          background: 'var(--panel)',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--txt2)' }}>
          Agent timeline · {steps.length} phase
        </span>
        <Mono style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt3)' }}>{currentName}</Mono>
        <DisclosureBtn
          open={open}
          expandLabel="Mở rộng"
          collapseLabel="Thu gọn"
          title={`${steps.length} phase. Human không Approve từng cái — ${open ? 'thu gọn' : 'mở rộng'} khi cần debug agent.`}
          onClick={() => setOpen((value) => !value)}
        />
      </div>
      {open && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 2px' }}>
            {steps.map((step, idx) => (
              <button
                key={`${step.agent}-${idx}`}
                type="button"
                onClick={() => onFocus(idx)}
                style={{
                  cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '3px 8px',
                  borderRadius: 999,
                  border: `1px solid ${idx === focusedIdx ? 'var(--acc-bd)' : 'var(--bd)'}`,
                  background: idx === focusedIdx ? 'var(--acc-bg)' : 'transparent',
                  color: idx === focusedIdx ? 'var(--acc-txt)' : 'var(--txt2)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6, height: 6, borderRadius: 99, flex: 'none',
                    background: stepDot(step.status),
                  }}
                />
                {step.stepName ?? step.agent}
              </button>
            ))}
          </div>
          {children}
        </>
      )}
    </div>
  );
}

/* ── recovery guidance ─────────────────────────────────────────────────── */

/* ── creation request ──────────────────────────────────────────────────── */

function EpicRequestCard({ epic }: { epic: EpicSummary }) {
  const [expanded, setExpanded] = useState(false);
  const description = (epic.description ?? '').trim();
  const goals = String(epic.inputs?.selected_goals ?? '')
    .split(',')
    .map((goal) => goal.trim())
    .filter(Boolean);
  const scope = String(epic.inputs?.what_scope ?? '').trim();
  const constraints = String(epic.inputs?.feature_constraints ?? '').trim();
  const summary = description.replace(/\s+/g, ' ').trim()
    || (goals.length > 0 ? `${goals.length} mục tiêu đã chọn` : 'Có phạm vi hoặc ràng buộc được lưu');

  if (!description && goals.length === 0 && !scope && !constraints) { return null; }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yêu cầu khi tạo Epic</CardTitle>
        <Ellipsis style={{ fontSize: 11, color: 'var(--txt3)' }}>
          {expanded ? 'Thông tin bạn đã nhập được lưu cùng epic.' : summary}
        </Ellipsis>
        <DisclosureBtn
          open={expanded}
          expandLabel="Mở rộng"
          collapseLabel="Thu gọn"
          title={expanded ? 'Thu gọn thông tin epic' : 'Mở rộng thông tin epic'}
          onClick={() => setExpanded((value) => !value)}
        />
      </CardHeader>
      {expanded && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {description && <RequestField label="Mô tả" value={description} />}
          {goals.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 96, flex: 'none', fontSize: 11.5, color: 'var(--txt3)' }}>Mục tiêu</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {goals.map((goal) => <Chip key={goal} label={goal} mono bg="var(--acc-bg)" fg="var(--acc-txt)" />)}
              </div>
            </div>
          )}
          {scope && <RequestField label="Phạm vi" value={scope} />}
          {constraints && <RequestField label="Ràng buộc" value={constraints} />}
        </div>
      )}
    </Card>
  );
}

function RequestField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 96, flex: 'none', fontSize: 11.5, color: 'var(--txt3)' }}>{label}</div>
      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, color: 'var(--txt)', lineHeight: 1.55 }}>
        {value}
      </div>
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

function ProjectContextCard({ context }: { context: WorkspaceState['projectContext'] }) {
  const published = !!context;
  const revision = context ? `r${context.revision}` : 'chưa publish';
  const phaseProgress = context?.completedSteps !== undefined && context?.totalSteps !== undefined
    ? `${context.completedSteps}/${context.totalSteps} phase hoàn tất`
    : undefined;
  const source = context?.sourceCommit ? context.sourceCommit.slice(0, 8) : undefined;
  return (
    <Card>
      <CardHeader pad="10px 14px">
        <CardTitle>Project Context</CardTitle>
        <Chip label="project-context" mono />
        <Chip label={revision} radius={999} bg={published ? 'var(--acc-bg)' : 'var(--warn-bg)'} fg={published ? 'var(--acc-txt)' : 'var(--warn)'} weight={600} />
        <Spacer />
        <CardNote>{source ? `commit ${source}` : 'baseline chung — mỗi feature epic capture snapshot để chạy độc lập'}</CardNote>
      </CardHeader>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11.5, color: 'var(--txt3)' }}>
          {context
            ? `${context.artifacts.length} canonical artifact${context.artifacts.length === 1 ? '' : 's'} đã publish${phaseProgress ? ` · ${phaseProgress}` : ''}.`
            : 'Chưa publish Project Context. Chạy project-context trước khi bắt đầu feature epic.'}
        </div>
        <Spacer />
        <Btn
          label="Mở context"
          disabled={!context}
          title={context ? 'Mở CONTEXT-MANIFEST.json' : 'Chưa có context manifest'}
          onClick={context ? () => postMessage({ type: 'openPath', path: context.manifestPath }) : undefined}
        />
        <Btn
          label="Refresh context"
          variant="warn"
          title="Đọc lại context manifest từ disk (không chạy lại pipeline)"
          onClick={() => postMessage({ type: 'refreshProjectContextView' })}
        />
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
      <FlowCanvas
        nodes={nodes}
        loop={loop}
        flowNote={flowNote}
        nodeTitles={epic.stepDetails.map(humanInterventionTooltip)}
        onNodeClick={onNodeClick}
      />
    </Card>
  );
}

/* ── ⑥ dc.html:820-851 ──────────────────────────────────────────────────── */

function EpicConfigCard({ epic }: { epic: EpicSummary }) {
  const rows = useMemo(() => configRows(epic), [epic]);
  const hasPipelineCheckpoint = Boolean(epic.pipeline && epic.runId);
  const setRunMode = (mode: 'guided' | 'autonomous') => {
    if (!hasPipelineCheckpoint || epic.runMode === mode) { return; }
    postMessage({ type: 'setEpicRunMode', epicId: epic.id, mode });
  };
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <RunModeOption
            label="Guided"
            desc="Bạn chạy và review từng step"
            selected={epic.runMode === 'guided'}
            disabled={!hasPipelineCheckpoint}
            title={hasPipelineCheckpoint
              ? 'Dừng master tại checkpoint trước phase kế tiếp.'
              : 'Epic này không có pipeline checkpoint để chuyển mode.'}
            onClick={() => setRunMode('guided')}
          />
          <RunModeOption
            label="Autonomous Delivery"
            desc="Provider đang chọn chạy trọn flow, dừng ở human gate"
            selected={epic.runMode === 'autonomous'}
            disabled={!hasPipelineCheckpoint}
            title={hasPipelineCheckpoint
              ? 'Mở provider đang chọn để chạy pipeline từ checkpoint hiện có.'
              : 'Epic này không có pipeline checkpoint để chạy autonomous.'}
            onClick={() => setRunMode('autonomous')}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--txt3)', lineHeight: 1.5 }}>
            Không có CLI cohesive chạy ngầm — mọi thao tác đều mở lệnh nhìn thấy được trong terminal của provider đang chọn.
          </div>
          <Btn
            label="Run / resume selected-provider master"
            variant="primary"
            pad="7px 11px"
            fs={11.5}
            disabled={!hasPipelineCheckpoint || epic.runMode !== 'autonomous'}
            title={!hasPipelineCheckpoint
              ? 'Epic này không có pipeline checkpoint để chạy.'
              : epic.runMode !== 'autonomous'
                ? 'Chọn Autonomous Delivery trước khi chạy provider master.'
                : 'Chạy hoặc tiếp tục pipeline từ checkpoint hiện có; có thể dùng lại sau khi pause/fail.'}
            onClick={() => postMessage({ type: 'runEpicAutonomously', epicId: epic.id })}
          />
        </div>
      </div>
    </Card>
  );
}

function RunModeOption({
  label, desc, selected, disabled = false, title, onClick,
}: {
  label: string;
  desc: string;
  selected: boolean;
  disabled?: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 6,
        border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--bd)'}`,
        background: selected ? 'var(--acc-bg)' : 'var(--panel2)',
        flex: 1, minWidth: 0, textAlign: 'left', fontFamily: 'inherit',
        cursor: disabled || !onClick ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ fontSize: 11, color: selected ? 'var(--acc-txt)' : 'var(--txt3)' }}>
        {selected ? '◉' : '○'}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.45 }}>{desc}</div>
      </div>
    </button>
  );
}

/* ── ⑦ dc.html:853-870 ──────────────────────────────────────────────────── */

function GateBanner({
  epic, focused, focusedIdx,
}: {
  epic: EpicSummary;
  focused: EpicStepDetailFull;
  focusedIdx: number;
  providerConfig?: ProviderConfig;
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
  const isBugResolution = isBugResolutionStep(focused);
  const gate = briefingGateCopy(stepName, epic);

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
        {gate.body}
        {focused.autoReviewVerdict && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--txt3)' }}>
            Auto-review: <Mono>{focused.autoReviewVerdict.decision}</Mono>
            {focused.autoReviewVerdict.reason ? ` · ${focused.autoReviewVerdict.reason}` : ''}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <Btn
          label={gate.approveLabel}
          variant="primary"
          pad="8px 14px"
          fs={12.5}
          title="Chốt step này và mở phase kế. Đây là gate human — không chạy lại agent."
          onClick={() => setGateOpen(true)}
        />
        <Btn
          label="Reject"
          variant="danger"
          pad="8px 13px"
          fs={12.5}
          title="Gửi step về trước đó kèm lý do. Agent phải làm lại — không phải xóa epic."
          onClick={() => setGateOpen(true)}
        />
        <Btn
          label="Chạy lại step"
          pad="8px 13px"
          fs={12.5}
          title="Mở form feedback rồi rerun đúng step này (không Approve). Dùng khi artifact sai nhưng chưa muốn reject về step trước."
          onClick={() => setRerunOpen(true)}
        />
        {!isBugResolution && (
          <Btn
            label="Chạy auto-review"
            pad="8px 13px"
            fs={12.5}
            title="Chạy validator máy (file tồn tại, marker, build). Không thay Approve của bạn — chỉ báo pass/reject kỹ thuật."
            onClick={() => postMessage({ type: 'runAutoReview', runId, stepIdx: focusedIdx })}
          />
        )}
        {slashCommand && isBugResolution && (
          <Btn
            label="Nhập bug & chạy agent"
            pad="8px 13px"
            fs={12.5}
            onClick={() => setRunOpen(true)}
          />
        )}
      </div>

      {gateOpen && (
        <GateModal
          runId={runId}
          stepIdx={focusedIdx}
          stepName={stepName}
          gateName={stepName}
          consequence={{
            headline: isBugResolution
              ? `Chốt bản sửa của ${epic.id} và mở ship.`
              : `Approve step ${stepName} của ${epic.id}.`,
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
          mode={isBugResolution ? 'bug-report' : 'feedback'}
          previousBugCount={(focused.history ?? []).filter((e) => e.kind === 'bug_report').length}
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

function PackBlockedBanner({ onChoosePack }: { onChoosePack?: () => void }) {
  return (
    <div
      style={{
        flex: 'none', border: '2px solid var(--warn-bd)', background: 'var(--warn-bg)',
        borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ fontSize: 14, flex: 'none' }}>⚠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 700 }}>
            implement · <Mono>awaiting_work</Mono>
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 4, lineHeight: 1.5 }}>
            Pack chưa đủ — không Start. Jira một dòng không được Start. Dán MISSION.md đủ heading hoặc copy từ spike.
          </div>
        </div>
        <StatusBadgeV3 icon="●" label="blocked" bg="var(--err-bg)" fg="var(--err)" />
      </div>
      <div>
        <Btn
          label="Chọn nguồn pack"
          variant="primary"
          pad="8px 14px"
          fs={12.5}
          title="Mở modal chọn spike / dán MISSION / Jira. Start disabled nếu completeness fail."
          onClick={onChoosePack}
        />
      </div>
    </div>
  );
}

/* ── ⑧ dc.html:872-904 ──────────────────────────────────────────────────── */

function StepListCard({
  epic, focusedIdx, onFocus, providerConfig, packBlocked, onChoosePack,
}: {
  epic: EpicSummary;
  focusedIdx: number;
  onFocus: (idx: number) => void;
  providerConfig?: ProviderConfig;
  packBlocked?: boolean;
  onChoosePack?: () => void;
}) {
  const rows = useMemo(() => stepRows(epic), [epic]);
  const runAgainHint = runStepButtonLabel(providerConfig, 'again');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Step của epic</CardTitle>
        <Spacer />
        <CardNote>
          lệnh agent có thể fail hoặc đóng — {runAgainHint} mở lại đúng slash command và run id
        </CardNote>
      </CardHeader>
      {rows.map((r) => {
        const step = epic.stepDetails[r.idx];
        const isFocused = r.idx === focusedIdx;
        return (
          <div
            key={`${step.agent}-${r.idx}`}
            onClick={() => onFocus(r.idx)}
            title={humanInterventionTooltip(step)}
            aria-label={`${r.name}. ${humanInterventionTooltip(step)}`}
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
              <StepActions
                epic={epic}
                step={step}
                stepIdx={r.idx}
                providerConfig={providerConfig}
                packBlocked={packBlocked}
                onChoosePack={onChoosePack}
              />
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
      <StepListFooter
        epic={epic}
        focusedIdx={focusedIdx}
        providerConfig={providerConfig}
        packBlocked={packBlocked}
        onChoosePack={onChoosePack}
      />
    </Card>
  );
}

/**
 * Per-step buttons. This is EpicCard's RunGate action set, unchanged: same
 * conditions, same message types, same payloads.
 */
function StepActions({
  epic, step, stepIdx, providerConfig, packBlocked, onChoosePack,
}: {
  epic: EpicSummary;
  step: EpicStepDetailFull;
  stepIdx: number;
  providerConfig?: ProviderConfig;
  packBlocked?: boolean;
  onChoosePack?: () => void;
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
  const isBugResolution = isBugResolutionStep(step);
  const runDisabled = isRunStepDisabled(providerConfig);
  const runHint = runDisabled ? runStepDisabledHint() : undefined;

  const stop = (fn: () => void) => () => fn();

  return (
    <div style={{ display: 'flex', gap: 5, flex: 'none' }} onClick={(e) => e.stopPropagation()}>
      {status === 'awaiting_work' && (
        <>
          {packBlocked ? (
            <StepBtn
              kind="primary"
              label="Chọn nguồn pack"
              title="Pack chưa đủ heading — không Run implement. Mở modal chọn spike / dán MISSION / Jira."
              onClick={stop(() => onChoosePack?.())}
            />
          ) : slashCommand && (
            <StepBtn
              kind="primary"
              label={
                isBugResolution
                  ? 'Nhập bug & chạy agent'
                  : hasFeedback
                  ? runStepButtonLabel(providerConfig, 'feedback')
                  : hasPreviousAttempt
                    ? runStepButtonLabel(providerConfig, 'again')
                    : runStepButtonLabel(providerConfig, 'default')
              }
              title={runHint}
              disabled={runDisabled}
              onClick={stop(() => {
                if (runDisabled) { return; }
                if (isBugResolution || hasFeedback) { setRunOpen(true); return; }
                postMessage({ type: 'runStepWithFeedback', runId, slashCommand, feedback: '' });
              })}
            />
          )}
          {!packBlocked && (
            <StepBtn
              label="Đánh dấu step xong"
              title="Bỏ qua agent — ghi step này là done trên disk. Không chạy code, không tạo artifact."
              onClick={stop(() => postMessage({ type: 'markStepDone', runId, stepIdx }))}
            />
          )}
          {!packBlocked && step.stepSkippable && (
            <StepBtn
              label="Không có bug — bỏ qua"
              title="Bỏ qua toàn bộ step này, không tạo artifact. Dùng khi không có bug nào cần sửa."
              onClick={stop(() => postMessage({ type: 'skipStep', runId, stepIdx }))}
            />
          )}
        </>
      )}
      {status === 'awaiting_auto_review' && (
        <StepBtn
          kind="primary"
          label="Chạy auto-review"
          title="Chạy validator máy cho step này. Không phải Approve."
          onClick={stop(() => postMessage({ type: 'runAutoReview', runId, stepIdx }))}
        />
      )}
      {status === 'awaiting_review' && (
        <>
          <StepBtn
            kind="primary"
            label={isBugResolution ? 'Approve bản sửa' : 'Approve'}
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
              label={runStepButtonLabel(providerConfig, 'again')}
              title={runHint}
              disabled={runDisabled}
              onClick={stop(() => {
                if (runDisabled) { return; }
                postMessage({
                  type: 'rerunAndRunWithClaude',
                  runId,
                  stepIdx,
                  slashCommand,
                  feedback: step.rejectReason ?? '',
                });
              })}
            />
          )}
          <StepBtn
            label="Sửa feedback rồi chạy"
            title="Mở form sửa lý do reject trước khi rerun. Khác nút chạy lại ngay bên cạnh."
            onClick={stop(() => setRerunOpen(true))}
          />
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
          mode={isBugResolution ? 'bug-report' : 'feedback'}
          previousBugCount={(step.history ?? []).filter((e) => e.kind === 'bug_report').length}
          onSubmit={(feedback) => postMessage({ type: 'runStepWithFeedback', runId, slashCommand, feedback })}
          onClose={() => setRunOpen(false)}
        />
      )}
    </div>
  );
}

/* dc.html:888 — step action button */
function StepBtn({
  label, onClick, kind = 'default', disabled = false, title,
}: {
  label: string;
  onClick: () => void;
  kind?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  title?: string;
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
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontSize: 11, padding: '5px 9px', borderRadius: 6,
        whiteSpace: 'nowrap', fontFamily: 'inherit', ...skin,
      }}
    >
      {label}
    </button>
  );
}

/* dc.html:897-903 */
function StepListFooter({
  epic, focusedIdx, providerConfig, packBlocked, onChoosePack,
}: {
  epic: EpicSummary;
  focusedIdx: number;
  providerConfig?: ProviderConfig;
  packBlocked?: boolean;
  onChoosePack?: () => void;
}) {
  const [bugRunOpen, setBugRunOpen] = useState(false);
  const step = epic.stepDetails[focusedIdx];
  const canRerun = !!epic.runId && !!step?.slashCommand;
  const isBugResolution = isBugResolutionStep(step ?? null);
  const canStart = !epic.runId && !!epic.pipeline;
  const runDisabled = isRunStepDisabled(providerConfig);
  const runHint = runDisabled ? runStepDisabledHint() : undefined;
  return (
    <div style={{ padding: '10px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {packBlocked && (
        <Btn
          label="Chọn nguồn pack"
          variant="primary"
          pad="6px 11px"
          title="Pack chưa đủ — mở modal spike / dán MISSION / Jira."
          onClick={onChoosePack}
        />
      )}
      {canRerun && !packBlocked && (
        <Btn
          label={isBugResolution ? 'Nhập bug & chạy agent' : runStepButtonLabel(providerConfig, 'again')}
          pad="6px 11px"
          title={runHint}
          disabled={runDisabled}
          onClick={() => {
            if (runDisabled) { return; }
            if (isBugResolution) { setBugRunOpen(true); return; }
            postMessage({
              type: 'runStepWithFeedback',
              runId: epic.runId!,
              slashCommand: step.slashCommand!,
              feedback: '',
            });
          }}
        />
      )}
      {canStart && !packBlocked && (
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
      {bugRunOpen && epic.runId && step?.slashCommand && (
        <RunWithFeedbackModal
          agent={step.agent}
          runId={epic.runId}
          slashCommand={step.slashCommand}
          carriedFeedback={step.feedback}
          mode="bug-report"
          previousBugCount={(step.history ?? []).filter((e) => e.kind === 'bug_report').length}
          onSubmit={(feedback) => postMessage({
            type: 'runStepWithFeedback',
            runId: epic.runId!,
            slashCommand: step.slashCommand!,
            feedback,
          })}
          onClose={() => setBugRunOpen(false)}
        />
      )}
    </div>
  );
}

/* ── ⑨ dc.html:906-938 ─────────────────────────────────────────────────── */

function StepDetailCard({
  epic, step, agentMeta, providerConfig,
}: {
  epic: EpicSummary;
  step: EpicStepDetailFull;
  agentMeta: Record<string, AgentMeta>;
  providerConfig?: ProviderConfig;
}) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const rows = stepDetailRows(step, agentMeta[step.agent], providerConfig);
  const name = step.stepName ?? step.agent;
  const fallbackArtifact = step.artifact || agentMeta[step.agent]?.artifact || '';
  const artifactNames = step.artifacts?.length
    ? step.artifacts
    : fallbackArtifact ? [fallbackArtifact] : [];
  const artifactExists = (artifactName: string) =>
    (artifactName === step.artifact && step.artifactExists === true)
    || (epic.existingArtifacts ?? []).includes(artifactName)
    || !!epic.artifactPaths?.[artifactName];

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
        {artifactNames.length > 0 ? (
          artifactNames.map((artifactName) => (
            <ArtifactChip
              key={artifactName}
              name={artifactName}
              exists={artifactExists(artifactName)}
              epicDir={epic.epicDir}
            />
          ))
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

/** Artifact chip — opens the produced file directly in a new editor tab. */
function ArtifactChip({
  name, exists, epicDir,
}: {
  name: string;
  exists: boolean;
  epicDir: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => exists && postMessage({ type: 'openArtifactFile', epicDir, filename: name })}
        title={exists ? `Mở ${name} trong tab mới` : 'File chưa được tạo'}
        className="v3-mono"
        style={{
          flex: 'none', fontSize: 11, padding: '4px 8px', borderRadius: 5, background: 'var(--panel2)',
          border: '1px solid var(--bd)', color: exists ? 'var(--txt2)' : 'var(--txt3)',
          cursor: exists ? 'pointer' : 'default', opacity: exists ? 1 : 0.7,
        }}
      >
        {exists ? name : `${name} · chưa tạo`}
      </button>
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
            label="Kiểm tra artifact"
            pad="8px 13px"
            fs={12}
            title="Verify: kiểm tra file artifact của run còn trên disk và pass assertion. Không chạy lại agent, không Approve."
            onClick={() => postMessage({ type: 'verifyRun', runId: epic.runId! })}
          />
          <Btn
            label="Xuất báo cáo"
            pad="8px 13px"
            fs={12}
            title="Report: render history run thành Markdown (đọc, không sửa state). Không phải báo bug."
            onClick={() => postMessage({ type: 'runReport', runId: epic.runId! })}
          />
        </>
      )}
      <Btn
        label="Mở thư mục artifact"
        pad="8px 13px"
        fs={12}
        title="Reveal artifacts: mở Finder/Explorer tại docs/epics/<id>/artifacts. Không phải xem graph."
        onClick={() => postMessage({ type: 'revealArtifacts', epicDir: epic.epicDir })}
      />
      <Btn
        label="Xem memory"
        pad="8px 13px"
        fs={12}
        title="Epic memory: digest decisions/constraints/reflections để lần sau nạp rẻ token. Khác nút Tự nạp memory trên header list."
        onClick={() => postMessage({ type: 'openEpicMemory', epicDir: epic.epicDir })}
      />
      {hasInputs && (
        <Btn
          label="Mở inputs.json"
          pad="8px 13px"
          fs={12}
          title="File brief lúc tạo epic (Jira, Figma, scope). Không phải MISSION.md."
          onClick={() => postMessage({ type: 'openInputsJson', epicDir: epic.epicDir })}
        />
      )}
      <Btn
        label="Xóa epic"
        variant="danger"
        pad="8px 13px"
        fs={12}
        title="Xóa epic khỏi list (có thể kèm folder). Không phải xóa step."
        onClick={() => setDeleteOpen(true)}
      />
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
