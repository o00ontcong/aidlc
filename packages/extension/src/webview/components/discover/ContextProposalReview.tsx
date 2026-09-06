/**
 * Review surface for a `ContextProposal` (plan §5.1/§12.4, M4/M6) — the
 * Git-like isolation area a scan/Shape/delivery result stages a canonical
 * Project Context change into. Distinct from `DiffView.tsx`'s legacy
 * Keep/Revert scan-run reviewer (a different domain object entirely, still
 * used for runs already in flight during migration) — this is the review
 * queue for anything staged as a real `ContextProposal`.
 */
import { useState } from 'react';
import { AlertTriangle, Check, GitBranch, Trash2 } from 'lucide-react';
import type { ContextProposal, ProjectContextHead } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { Modal, ModalFooter } from '../Modal';

const REVIEW_WORTHY_STATUSES = new Set(['review', 'needs-rebase', 'changes-requested', 'partially-applied']);

export function reviewWorthyProposals(proposals: ContextProposal[]): ContextProposal[] {
  return proposals.filter((p) => REVIEW_WORTHY_STATUSES.has(p.status));
}

export function ContextProposalReview({
  proposals, contextHead, onClose,
}: { proposals: ContextProposal[]; contextHead?: ProjectContextHead; onClose: () => void }) {
  const pending = reviewWorthyProposals(proposals);
  const [selectedId, setSelectedId] = useState<string | null>(pending[0]?.id ?? null);
  const selected = pending.find((p) => p.id === selectedId) ?? null;

  if (pending.length === 0) {
    return (
      <Modal title="Context Proposals" onClose={onClose} maxWidth="max-w-md">
        <p className="text-xs text-muted-foreground">Nothing waiting for review right now.</p>
      </Modal>
    );
  }

  return (
    <Modal title="Context Proposals" subtitle={`${pending.length} waiting for review`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {pending.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`w-full rounded-md border px-2.5 py-2 text-left text-[11px] ${p.id === selectedId ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{p.id.slice(0, 12)}…</span>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground capitalize">{p.origin}</div>
            </button>
          ))}
        </div>
        {selected && <ProposalDetail proposal={selected} contextHead={contextHead} />}
      </div>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground hover:bg-accent">
          Close
        </button>
      </ModalFooter>
    </Modal>
  );
}

function StatusBadge({ status }: { status: ContextProposal['status'] }) {
  const tone = status === 'needs-rebase' || status === 'changes-requested'
    ? 'bg-warning/15 text-warning'
    : status === 'partially-applied'
      ? 'bg-primary/15 text-primary'
      : 'bg-secondary text-muted-foreground';
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${tone}`}>{status.replace(/-/g, ' ')}</span>;
}

function ProposalDetail({ proposal, contextHead }: { proposal: ContextProposal; contextHead?: ProjectContextHead }) {
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState('');
  const guard = { expectedRevision: proposal.revision, expectedContentHash: proposal.contentHash };
  const contextGuard = contextHead ? { expectedRevision: contextHead.currentRevisionNumber, expectedContentHash: contextHead.rootHash } : undefined;
  const needsRebase = proposal.status === 'needs-rebase';

  const approve = (groupId: string) => {
    postMessage({ type: 'contextProposalApprove', proposalId: proposal.id, guard, groupIds: [groupId] });
  };
  const applyGroup = (groupId: string) => {
    if (!contextGuard) return;
    postMessage({ type: 'contextProposalApply', proposalId: proposal.id, guard, contextGuard, groupIds: [groupId] });
  };
  const applyAll = () => {
    if (!contextGuard) return;
    const groupIds = proposal.groups.filter((g) => g.decision !== 'applied' && g.decision !== 'discarded').map((g) => g.id);
    postMessage({ type: 'contextProposalApply', proposalId: proposal.id, guard, contextGuard, groupIds });
  };
  const rebase = () => {
    postMessage({ type: 'contextProposalRebase', proposalId: proposal.id, guard, contextGuard: { expectedRevisionId: proposal.baseContext.revisionId, expectedRootHash: proposal.baseContext.rootHash } });
  };
  const discard = () => {
    if (!reason.trim()) return;
    postMessage({ type: 'contextProposalDiscard', proposalId: proposal.id, guard, reason: reason.trim() });
    setDiscarding(false);
    setReason('');
  };

  return (
    <div className="min-w-0 space-y-3">
      {needsRebase && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            The canonical Context moved since this proposal was based. Rebase before applying.
            <button type="button" data-tour-id="context-proposal-rebase" onClick={rebase} className="ml-2 inline-flex items-center gap-1 rounded border border-warning/50 px-1.5 py-0.5 font-semibold hover:bg-warning/10">
              <GitBranch className="h-3 w-3" />Rebase
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {proposal.groups.map((group) => (
          <div key={group.id} className="rounded-md border border-border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] font-semibold text-foreground">{group.title}</span>
              <RiskBadge risk={group.risk} />
              <DecisionBadge decision={group.decision} />
            </div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">{group.summary}</p>
            {group.affectedDocumentPaths.length > 0 && (
              <p className="mt-1 font-mono text-[9.5px] text-muted-foreground/70">{group.affectedDocumentPaths.join(', ')}</p>
            )}
            {group.decision === 'pending' && (
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={() => approve(group.id)} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Check className="h-2.5 w-2.5" />Approve
                </button>
                <button type="button" disabled={needsRebase || !contextGuard} onClick={() => applyGroup(group.id)} className="inline-flex items-center gap-1 rounded border border-primary/50 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10 disabled:opacity-40">
                  Apply this group
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button type="button" disabled={needsRebase || !contextGuard} onClick={applyAll} className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          Apply all pending groups
        </button>
        {!discarding ? (
          <button type="button" onClick={() => setDiscarding(true)} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-[11px] text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3 w-3" />Discard
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-1.5">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for discarding"
              autoFocus
              className="flex-1 rounded border border-border bg-input/50 px-2 py-1 text-[11px]"
            />
            <button type="button" disabled={!reason.trim()} onClick={discard} className="rounded border border-destructive/50 px-2 py-1 text-[10.5px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-40">
              Confirm
            </button>
            <button type="button" onClick={() => { setDiscarding(false); setReason(''); }} className="rounded border border-border px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent">
              Cancel
            </button>
          </div>
        )}
      </div>
      {!contextGuard && (
        <p className="text-[10px] text-warning">Project Context has not been bootstrapped yet in this workspace — Apply is unavailable until it is.</p>
      )}
    </div>
  );
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const tone = risk === 'high' ? 'bg-destructive/15 text-destructive' : risk === 'medium' ? 'bg-warning/15 text-warning' : 'bg-secondary text-muted-foreground';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${tone}`}>{risk}</span>;
}

function DecisionBadge({ decision }: { decision: 'pending' | 'changes-requested' | 'applied' | 'discarded' }) {
  const tone = decision === 'applied' ? 'bg-success/15 text-success' : decision === 'discarded' ? 'bg-secondary text-muted-foreground' : decision === 'changes-requested' ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${tone}`}>{decision.replace(/-/g, ' ')}</span>;
}
