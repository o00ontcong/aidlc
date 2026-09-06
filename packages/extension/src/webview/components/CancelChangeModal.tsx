import { useState } from 'react';
import { Modal, ModalFooter, ModalConfirmButton } from './Modal';
import { useHostAction } from '@/hooks/useHostAction';

interface Props {
  changeId: string;
  title: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/**
 * Confirms the terminal `change.cancel` transition for a Change that never
 * got an Epic. There is no `change.reopen` path out of `cancelled` (only
 * `shelved` can reopen), so this is the one control that lets a user retire
 * a stuck/unwanted Change for good.
 */
export function CancelChangeModal({ changeId, title, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('');
  const { pending, run } = useHostAction({ onSettled: onClose });

  const submit = () => {
    if (pending) { return; }
    run(() => onConfirm(reason.trim()));
  };

  return (
    <Modal title={`Cancel ${changeId}`} subtitle={title || 'Untitled change'} onClose={onClose} onSubmit={submit} busy={pending}>
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-foreground/85">
          This retires the Change permanently — it drops out of Active work and cannot be reopened afterwards.
        </p>
        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Reason <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='e.g. "duplicate of CHG-…", "no longer needed"'
            rows={3}
            disabled={pending}
            className="w-full resize-y rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-40"
          />
        </div>
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground hover:border-border/80 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Keep it
        </button>
        <ModalConfirmButton
          onClick={submit}
          label="Cancel change"
          danger
          loading={pending}
          loadingLabel="Cancelling…"
        />
      </ModalFooter>
    </Modal>
  );
}
