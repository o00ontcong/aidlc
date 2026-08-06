import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** Optional left-aligned action (e.g. "View guide") that does not dismiss. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
  secondaryLabel,
  onSecondary,
}: Props) {
  const submit = () => {
    onConfirm();
    onClose();
  };
  return (
    <Modal title={title} onClose={onClose} onSubmit={submit}>
      <div className="text-[12px] leading-relaxed text-foreground/85">{message}</div>
      <ModalFooter>
        <div className="mr-auto flex items-center gap-2">
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-md border border-border px-3 py-1.5 text-[11.5px] font-medium text-primary hover:border-primary/50 hover:bg-primary/10"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label={confirmLabel} danger={danger} />
      </ModalFooter>
    </Modal>
  );
}
