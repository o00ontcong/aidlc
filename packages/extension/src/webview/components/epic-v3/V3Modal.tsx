/* v3 modal shell — V3_HANDOFF §11 + dc.html:58-88.
 *
 * Deliberately NOT built on components/Modal.tsx: that shell is shared by 20
 * modals across Builder / Analyze / Tests / Studio, and restyling it would
 * change every one of those screens. This shell is used only by Epic modals.
 *
 * Adaptation: the design's overlay is `position:absolute` because it lives
 * inside the mocked 1440×920 frame. In the real webview there is no such frame,
 * so the overlay is `fixed` (same as the existing modals) — otherwise it would
 * be clipped by the Epic screen's scroll container.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

export function V3Modal({
  width = 620,
  maxHeight,
  danger,
  header,
  footer,
  children,
  onClose,
  paddingTop = 90,
  closeOnBackdrop = true,
}: {
  width?: number;
  maxHeight?: number;
  /** Gate modal uses a 2px --err-bd border (§11.1). */
  danger?: boolean;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  paddingTop?: number;
  /** When false a backdrop click does not dismiss (Esc still does). Use for
   *  forms where an accidental outside click would discard typed input. */
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxHeight,
          background: 'var(--panel2)',
          border: danger ? '2px solid var(--err-bd)' : '1px solid var(--bd)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 30px 70px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {header}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
          }}
        >
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}

/** dc.html:61-68 — header row. `tone` paints the --err-bg strip of the Gate modal. */
export function V3ModalHeader({
  icon, title, sub, onClose, tone,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  onClose: () => void;
  tone?: 'err';
}) {
  return (
    <div
      style={{
        flex: 'none',
        padding: '14px 16px',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: tone === 'err' ? 'var(--err-bg)' : undefined,
      }}
    >
      {icon && <div style={{ fontSize: 15 }}>{icon}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--txt)', fontWeight: 700 }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginTop: 2 }}>{sub}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Đóng (Esc)"
        style={{
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--txt2)',
          border: '1px solid var(--bd)',
          borderRadius: 5,
          padding: '3px 8px',
          background: 'transparent',
          fontFamily: 'inherit',
        }}
      >
        esc
      </button>
    </div>
  );
}

/** dc.html:82 — footer. `cli` renders the equivalent command on the left (§11). */
export function V3ModalFooter({ children, cli }: { children: ReactNode; cli?: string }) {
  return (
    <div
      style={{
        flex: 'none',
        padding: '12px 16px',
        borderTop: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'flex-end',
      }}
    >
      {cli && (
        <div
          className="v3-mono"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            color: 'var(--txt3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cli}
        </div>
      )}
      {children}
    </div>
  );
}

/** dc.html:106 — field label above an input. */
export function V3Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
      {children}
      {hint && <span style={{ color: 'var(--txt3)' }}> {hint}</span>}
    </div>
  );
}

/** Field group — label + control, gap 6 (dc.html:104). */
export function V3Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <V3Label hint={hint}>{label}</V3Label>
      {children}
    </div>
  );
}

/**
 * dc.html:111 — multiline box: same skin as the input, min-height 62.
 * `autoGrow` (opt-in, default off so existing callers keep their fixed-row
 * box) expands the textarea to fit its content on mount and on every value
 * change — needed once a field can hold an AI-authored paragraph rather than
 * a short phrase, where a static `rows={3}` box hides most of the text
 * behind an internal scrollbar (Ideas tab Understand/Research/... fields).
 */
export function V3Textarea({
  value, onChange, placeholder, rows = 3, autoFocus, selectOnFocus, mono, disabled, resize = 'none', autoGrow = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  selectOnFocus?: boolean;
  mono?: boolean;
  disabled?: boolean;
  resize?: 'none' | 'vertical';
  autoGrow?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) { return; }
    ref.current?.focus();
    if (selectOnFocus) { ref.current?.select(); }
  }, [autoFocus, selectOnFocus]);
  useLayoutEffect(() => {
    if (!autoGrow || !ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [autoGrow, value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={mono ? 'v3-mono' : undefined}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--panel)',
        border: '1px solid var(--bd)',
        borderRadius: 6,
        padding: '10px 12px',
        color: 'var(--txt)',
        fontSize: 12.5,
        fontFamily: mono ? undefined : 'inherit',
        lineHeight: 1.6,
        minHeight: 62,
        resize,
        outline: 'none',
        opacity: disabled ? 0.7 : 1,
        overflow: autoGrow ? 'hidden' : undefined,
      }}
    />
  );
}

/**
 * Callout box. `tone` picks the design's warn/err/acc palettes
 * (dc.html:127 for acc, :853 for err, :662 for warn).
 */
export function V3Callout({
  tone, label, children,
}: {
  tone: 'acc' | 'warn' | 'err';
  label?: string;
  children: ReactNode;
}) {
  const bd = tone === 'err' ? 'var(--err-bd)' : tone === 'warn' ? 'var(--warn-bd)' : 'var(--acc-bd)';
  const bg = tone === 'err' ? 'var(--err-bg)' : tone === 'warn' ? 'var(--warn-bg)' : 'var(--acc-bg)';
  const fg = tone === 'err' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : 'var(--acc-txt)';
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px',
        borderRadius: 7, border: `1px solid ${bd}`, background: bg,
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase',
            color: fg, fontWeight: 600,
          }}
        >
          {label}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

/** dc.html:78 — text input inside a modal body. */
export function V3Input({
  value, onChange, placeholder, mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={mono ? 'v3-mono' : undefined}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--bd)',
        borderRadius: 6,
        padding: '9px 11px',
        color: 'var(--txt)',
        fontSize: 12.5,
        fontFamily: mono ? undefined : 'inherit',
        outline: 'none',
      }}
    />
  );
}
