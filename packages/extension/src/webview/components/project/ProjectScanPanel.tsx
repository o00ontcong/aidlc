/**
 * Project-tab scan surface — reuses the old "Shared project context" card UX
 * (header + CTA + row list) to drive Discover's three-pass scan and Context
 * Proposal review. Scan never writes Project Context directly.
 */
import { useState } from 'react';
import { FileText, Loader2, ScanSearch } from 'lucide-react';
import type { ContextProposal, DiscoverSummary, ProjectContextHead } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { useHostAction } from '@/hooks/useHostAction';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import { cn } from '@/lib/utils';
import { ContextProposalReview, reviewWorthyProposals } from '../discover/ContextProposalReview';
import { DiffView } from '../discover/DiffView';

type ScanPassId = 1 | 2 | 3;
type PassChipState = 'locked' | 'next' | 'running' | 'review' | 'kept' | 'idle';

const PASSES: Array<{
  id: ScanPassId;
  labelEn: string;
  labelVi: string;
  detailEn: string;
  detailVi: string;
}> = [
  {
    id: 1,
    labelEn: 'Product',
    labelVi: 'Sản phẩm',
    detailEn: 'Idea → User Flow against what the product actually does.',
    detailVi: 'Idea → User Flow đối chiếu với sản phẩm thực tế.',
  },
  {
    id: 2,
    labelEn: 'Architecture',
    labelVi: 'Kiến trúc',
    detailEn: 'Architecture, data, stack and folder structure vs code.',
    detailVi: 'Kiến trúc, dữ liệu, stack và cấu trúc thư mục đối chiếu code.',
  },
  {
    id: 3,
    labelEn: 'Plan',
    labelVi: 'Kế hoạch',
    detailEn: 'Implementation plan and skeleton against the real tree.',
    detailVi: 'Kế hoạch triển khai và skeleton đối chiếu cây mã nguồn.',
  },
];

function passState(
  pass: ScanPassId,
  discover?: DiscoverSummary,
): PassChipState {
  const campaign = discover?.scanCampaign;
  const active = discover?.activeRun?.run.kind === 'scan' ? discover.activeRun.run : undefined;
  if (active?.scanPass === pass) {
    return active.status === 'review' ? 'review' : 'running';
  }
  if (!campaign || campaign.status !== 'active') {
    return 'idle';
  }
  if (pass <= campaign.lastKeptPass) return 'kept';
  if (pass === campaign.lastKeptPass + 1) return 'next';
  return 'locked';
}

function statusLabel(state: PassChipState, vi: boolean): string {
  switch (state) {
    case 'kept': return vi ? 'Đã giữ' : 'Kept';
    case 'next': return vi ? 'Tiếp theo' : 'Next';
    case 'running': return vi ? 'Đang quét' : 'Running';
    case 'review': return vi ? 'Duyệt' : 'Review';
    case 'locked': return vi ? 'Khóa' : 'Locked';
    default: return vi ? 'Chưa chạy' : 'Idle';
  }
}

export function ProjectScanPanel({
  discover,
  proposals,
  contextHead,
  language,
}: {
  discover?: DiscoverSummary;
  proposals: ContextProposal[];
  contextHead?: ProjectContextHead;
  language: DiscoverLanguage;
}) {
  const vi = language === 'vi';
  const copy = discoverCopy(language);
  const pending = reviewWorthyProposals(proposals);
  const campaign = discover?.scanCampaign;
  const active = discover?.activeRun;
  const scanActive = active?.run.kind === 'scan' ? active : undefined;
  const [proposalOpen, setProposalOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const { pending: actionPending, run: runAction, isPending } = useHostAction();

  const kept = campaign?.lastKeptPass ?? 0;
  const badge = pending.length > 0
    ? (vi ? `${pending.length} proposal` : `${pending.length} proposal${pending.length === 1 ? '' : 's'}`)
    : campaign?.status === 'active'
      ? `${kept}/3`
      : campaign?.status === 'done'
        ? (vi ? '3/3 xong' : '3/3 done')
        : (vi ? 'Chưa quét' : 'Not scanned');

  const badgeTone = pending.length > 0
    ? 'bg-primary/10 text-primary'
    : campaign?.status === 'active' || scanActive
      ? 'bg-warning/10 text-warning'
      : campaign?.status === 'done'
        ? 'bg-success/10 text-success'
        : 'bg-secondary text-muted-foreground';

  const startScan = () => runAction(() => postMessage({ type: 'scanDiscoverProject' }), 'scan');
  const runPass = (pass: ScanPassId) => {
    if (!campaign || campaign.status !== 'active') {
      startScan();
      return;
    }
    runAction(() => postMessage({ type: 'runDiscoverScanPass', pass }), `pass:${pass}`);
  };

  return (
    <section className="rounded-xl border border-border bg-card" data-tour-id="project-scan" aria-busy={actionPending || undefined}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">{vi ? 'Quét an toàn như Git' : 'Safe scan'}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {vi
              ? 'Pin snapshot nguồn; kết quả vào Context Proposal — không ghi thẳng Project Context.'
              : 'Pin a source snapshot; results become Context Proposals — never write Context directly.'}
          </p>
        </div>
        <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', badgeTone)}>
          {badge}
        </span>
      </div>

      {!discover && (
        <div className="m-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="text-xs font-semibold text-foreground">
            {vi ? 'Chưa có Discover blueprint' : 'No Discover blueprint yet'}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {vi
              ? 'Scan sẽ khởi tạo Discover từ code (pass 1) với snapshot nguồn. Bạn review đề xuất trước khi Context đổi.'
              : 'Scan bootstraps Discover from code (pass 1) with a source snapshot. Review proposals before Context changes.'}
          </p>
          <button
            type="button"
            onClick={startScan}
            disabled={actionPending}
            data-tour-id="project-scan-start"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
          >
            {isPending('scan') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            {isPending('scan') ? (vi ? 'Đang quét…' : 'Scanning…') : (vi ? 'Quét dự án' : 'Scan project')}
          </button>
        </div>
      )}

      {discover && (!campaign || campaign.status !== 'active') && !scanActive && (
        <div className="m-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="text-xs font-semibold text-foreground">
            {vi ? 'Bắt đầu chiến dịch quét' : 'Start a scan campaign'}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {vi
              ? 'Ba lượt (Sản phẩm → Kiến trúc → Kế hoạch). Tour Pass khi có proposal, hoặc xác nhận scan không đổi gì — không bắt buộc xong cả 3.'
              : 'Three passes (Product → Architecture → Plan). Tour Passes with a proposal, or by confirming a no-change scan — not all three passes.'}
          </p>
          <button
            type="button"
            onClick={startScan}
            disabled={actionPending}
            data-tour-id="project-scan-start"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
          >
            {isPending('scan') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            {isPending('scan') ? (vi ? 'Đang quét…' : 'Scanning…') : copy.scanProject}
          </button>
        </div>
      )}

      {scanActive && (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          <span className="font-semibold">
            {copy.scanPassBadge(scanActive.run.scanPass)} · +{scanActive.added.length} ~{scanActive.updated.length} −{scanActive.removed.length}
          </span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setDiffOpen(true)} className="rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20">{copy.viewDiff}</button>
            <button
              type="button"
              disabled={actionPending}
              onClick={() => runAction(() => postMessage({ type: 'keepDiscoverRun', runId: scanActive.run.id }), 'keep')}
              className="inline-flex items-center gap-1 rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending('keep') && <Loader2 className="h-3 w-3 animate-spin" />}
              {isPending('keep') ? (vi ? 'Đang giữ…' : 'Keeping…') : copy.keep}
            </button>
            <button
              type="button"
              disabled={actionPending}
              onClick={() => runAction(() => postMessage({ type: 'revertDiscoverRun', runId: scanActive.run.id }), 'revert')}
              className="inline-flex items-center gap-1 rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending('revert') && <Loader2 className="h-3 w-3 animate-spin" />}
              {isPending('revert') ? (vi ? 'Đang hoàn tác…' : 'Reverting…') : copy.revert}
            </button>
          </span>
        </div>
      )}

      {campaign?.status === 'active' && (
        <div className="flex justify-end px-5 pt-3">
          <button
            type="button"
            disabled={actionPending}
            onClick={() => runAction(() => postMessage({ type: 'abandonDiscoverScan' }), 'abandon')}
            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:underline disabled:cursor-wait disabled:opacity-70"
          >
            {isPending('abandon') ? (vi ? 'Đang hủy…' : 'Abandoning…') : copy.abandonScan}
          </button>
        </div>
      )}

      <div className="divide-y divide-border">
        {PASSES.map((pass) => {
          const state = passState(pass.id, discover);
          const clickable = state === 'next' || state === 'kept' || state === 'idle' || (!campaign && Boolean(discover));
          const busy = Boolean(discover?.activeRun) || actionPending;
          const enabled = clickable && !busy && state !== 'locked';
          const label = vi ? pass.labelVi : pass.labelEn;
          const detail = vi ? pass.detailVi : pass.detailEn;
          const passPending = isPending(`pass:${pass.id}`) || (isPending('scan') && pass.id === 1);
          return (
            <button
              key={pass.id}
              type="button"
              disabled={!enabled}
              onClick={() => runPass(pass.id)}
              className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors enabled:hover:bg-accent/50 disabled:cursor-default"
            >
              <div className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                state === 'kept' || state === 'next' || state === 'idle'
                  ? 'bg-primary/10 text-primary'
                  : state === 'running' || state === 'review' || passPending
                    ? 'bg-warning/15 text-warning'
                    : 'bg-secondary text-muted-foreground',
              )}>
                {passPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{pass.id}. {label}</span>
                  <code className="text-[10px] text-muted-foreground">pass {pass.id}/3</code>
                </div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">{detail}</p>
              </div>
              <span className={cn(
                'mt-1 text-[9px] font-bold uppercase tracking-wide',
                passPending ? 'text-warning'
                  : state === 'kept' ? 'text-success'
                    : state === 'next' || state === 'idle' ? 'text-primary'
                      : state === 'running' || state === 'review' ? 'text-warning'
                        : 'text-muted-foreground',
              )}>
                {passPending ? (vi ? 'Đang chạy' : 'Starting') : statusLabel(state, vi)}
              </span>
            </button>
          );
        })}
      </div>

      {pending.length > 0 && (
        <>
          <div className="border-t border-border px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {vi ? 'Context Proposal chờ review' : 'Context Proposals awaiting review'}
          </div>
          <div className="divide-y divide-border border-t border-border">
            {pending.map((proposal) => (
              <button
                key={proposal.id}
                type="button"
                data-tour-id={proposal === pending[0] ? 'context-proposal-review' : undefined}
                onClick={() => setProposalOpen(true)}
                className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-accent/50"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ScanSearch className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{proposal.origin}</span>
                    <code className="text-[10px] text-muted-foreground">{proposal.id}</code>
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                    {vi ? 'Review, rebase hoặc discard — không ghi đè Context.' : 'Review, rebase, or discard — never overwrite Context.'}
                  </p>
                </div>
                <span className="mt-1 text-[9px] font-bold uppercase tracking-wide text-primary">
                  {proposal.status.replace(/-/g, ' ')}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {proposalOpen && (
        <ContextProposalReview
          proposals={proposals}
          contextHead={contextHead}
          onClose={() => setProposalOpen(false)}
        />
      )}
      {diffOpen && discover && (
        <DiffView discover={discover} copy={copy} onClose={() => setDiffOpen(false)} />
      )}
    </section>
  );
}
