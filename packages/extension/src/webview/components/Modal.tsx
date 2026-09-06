import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** tailwind max-width — defaults to max-w-md. */
  maxWidth?: string;
  /** tailwind max-height on the panel — defaults to max-h-[90vh]. */
  maxHeight?: string;
  /** Optional Cmd/Ctrl+Enter handler. */
  onSubmit?: () => void;
  /** When true, suppresses Esc / backdrop-click handlers. Used by the
   * outer modal in a stacked-modal pair so the inner modal's Esc doesn't
   * also dismiss the outer one. */
  inactive?: boolean;
  /** When false, a backdrop click does NOT dismiss the modal (only the X /
   * Cancel / Esc do). Use for form modals where an accidental outside click
   * would throw away in-progress work. Defaults to true. */
  closeOnBackdrop?: boolean;
  /** Host action in flight — blocks Esc / backdrop / X dismiss so the user
   * cannot abandon a pending mutation mid-flight. */
  busy?: boolean;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'max-w-md',
  maxHeight = 'max-h-[90vh]',
  onSubmit,
  inactive = false,
  closeOnBackdrop = true,
  busy = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissBlocked = inactive || busy;

  useEffect(() => {
    if (inactive) { return; }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) { onClose(); }
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit && !busy) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onSubmit, inactive, busy]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(dismissBlocked || !closeOnBackdrop) ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className={cn(
          'flex w-full flex-col overflow-hidden rounded-lg border border-border bg-popover p-5 shadow-2xl',
          maxWidth,
          maxHeight,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-busy={busy || undefined}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title={busy ? 'Working…' : 'Cancel (Esc)'}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex items-center justify-end gap-2">{children}</div>;
}

export function ModalCancelButton({
  onClick,
  disabled,
  label = 'Cancel',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-border px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground hover:border-border/80 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export function ModalConfirmButton({
  onClick,
  label,
  danger,
  disabled,
  loading,
  loadingLabel,
  tourId,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** Optional Product Tour spotlight anchor. */
  tourId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-tour-id={tourId}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'border-destructive/50 bg-destructive/15 text-destructive enabled:hover:border-destructive enabled:hover:bg-destructive/25'
          : 'border-primary/50 bg-primary/15 text-primary enabled:hover:border-primary enabled:hover:bg-primary/25',
      )}
    >
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      {loading ? (loadingLabel ?? label) : label}
    </button>
  );
}
