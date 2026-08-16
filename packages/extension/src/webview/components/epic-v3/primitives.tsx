/* v3 Epic primitives.
 *
 * Every number here is transcribed from the matching block of
 * `AIDLC Workspace v3.dc.html` (line refs in comments). Values are written as
 * inline styles rather than Tailwind utilities on purpose:
 *
 *   - The design file itself is inline-styled, so transcription is 1:1 and the
 *     "colour deviation = 0, spacing ≤1px" bar is verifiable by diffing values.
 *   - Reproducing V3_HANDOFF §2's tailwind.config.ts font-size/radius scale
 *     would mean editing this repo's SHARED Tailwind v4 `@theme inline` block,
 *     which every other screen also compiles against. Inline styles keep the
 *     v3 look strictly inside the Epic subtree.
 */

import type { CSSProperties, ReactNode } from 'react';

export type Tone = 'acc' | 'warn' | 'err' | 'txt2' | 'txt3' | 'info';

export const toneVar = (t: Tone): string =>
  t === 'acc' ? 'var(--acc-txt)'
    : t === 'warn' ? 'var(--warn)'
      : t === 'err' ? 'var(--err)'
        : t === 'info' ? 'var(--info)'
          : t === 'txt2' ? 'var(--txt2)'
            : 'var(--txt3)';

/** Mono run — ids, paths, commands, scopes, %, branches, PR numbers (§2 rule 4). */
export function Mono({
  children, style, onClick, title,
}: {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <span className="v3-mono" style={style} onClick={onClick} title={title}>
      {children}
    </span>
  );
}

/* dc.html:945 — dot 8px · :618 — dot 7px · :756 — dot 6px · quota dot 5px */
export function IconDot({ size = 7, color, style }: { size?: number; color: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', background: color, flex: 'none', ...style,
      }}
    />
  );
}

/* dc.html:679 — h6 epic header · :620 — h2 epic row · quota h3 */
export function ProgressBar({
  pct, height = 6, width, fill = 'var(--acc)',
}: { pct: number; height?: number; width?: number; fill?: string }) {
  const r = height / 2;
  return (
    <div
      style={{
        flex: width ? 'none' : 1,
        width,
        height,
        borderRadius: r,
        background: 'var(--track)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height, borderRadius: r, background: fill, width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/* dc.html:673 — StatusBadge. Map table: V3_HANDOFF §6.2. */
export function StatusBadgeV3({ icon, label, bg, fg }: { icon: string; label: string; bg: string; fg: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 9px',
        borderRadius: 999, background: bg, color: fg, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap',
      }}
    >
      <div>{icon}</div>
      <div>{label}</div>
    </div>
  );
}

/* dc.html:706 — chip mono on --hover · :707 — badge r999 on --acc-bg */
export function Chip({
  label, mono, bg = 'var(--hover)', fg = 'var(--txt2)', radius = 5, weight,
}: { label: ReactNode; mono?: boolean; bg?: string; fg?: string; radius?: number; weight?: number }) {
  return (
    <div
      className={mono ? 'v3-mono' : undefined}
      style={{
        flex: 'none', whiteSpace: 'nowrap', fontSize: 10.5, padding: '2px 8px',
        borderRadius: radius, background: bg, color: fg, fontWeight: weight,
      }}
    >
      {label}
    </div>
  );
}

export type BtnVariant = 'primary' | 'default' | 'danger' | 'warn' | 'ghost';

/**
 * Button. `pad`/`fs` are explicit because the design file does NOT use one
 * uniform size scale: the gate banner's Approve is `8px 14px / 12.5px`
 * (dc.html:864) while a card-header button is `5px 10px / 11.5px` (:719).
 * V3_HANDOFF §5's lg = `9px 14px` disagrees with the file — the file wins.
 */
export function Btn({
  label, onClick, variant = 'default', pad = '5px 10px', fs = 11.5, title, disabled, flex, mono, style,
}: {
  label: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  pad?: string;
  fs?: number;
  title?: string;
  disabled?: boolean;
  flex?: boolean;
  mono?: boolean;
  style?: CSSProperties;
}) {
  const skin: CSSProperties =
    variant === 'primary' ? { background: 'var(--acc)', color: 'var(--on-acc)', fontWeight: 600 }
      : variant === 'danger' ? { border: '1px solid var(--err-bd)', color: 'var(--err)' }
        : variant === 'warn' ? { border: '1px solid var(--warn-bd)', color: 'var(--warn)' }
          : variant === 'ghost' ? { color: 'var(--acc-txt)' }
            : { border: '1px solid var(--bd)', color: 'var(--txt)' };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={mono ? 'v3-mono' : undefined}
      style={{
        flex: flex ? 1 : 'none',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontSize: fs,
        padding: pad,
        borderRadius: 6,
        background: 'transparent',
        font: 'inherit',
        fontFamily: mono ? undefined : 'inherit',
        textAlign: 'center',
        ...skin,
        ...style,
      }}
    >
      {label}
    </button>
  );
}

/* dc.html:703 / :751 / :820 / :872 — card shell */
export function Card({
  children, style, mockId,
}: { children: ReactNode; style?: CSSProperties; mockId?: string }) {
  const mockAttrs = mockId
    ? { 'data-mock': 'true', 'data-mock-id': mockId, 'data-mock-level': 'block' as const }
    : {};
  return (
    <div
      {...mockAttrs}
      style={{
        flex: 'none',
        background: 'var(--panel)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Card header. dc.html:704 uses `10px 14px`, :725/:821/:873 use `11px 14px`. */
export function CardHeader({
  children, pad = '11px 14px', wrap, style,
}: { children: ReactNode; pad?: string; wrap?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: pad,
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flexWrap: wrap ? 'wrap' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* dc.html:705 — 12.5px/600 */
export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--txt)', fontWeight: 600 }}>
      {children}
    </div>
  );
}

/** Header note — `min-width:0` + --txt3 11px (dc.html:709). */
export function CardNote({ children }: { children: ReactNode }) {
  return <div style={{ minWidth: 0, fontSize: 11, color: 'var(--txt3)' }}>{children}</div>;
}

export const Spacer = () => <div style={{ flex: 1 }} />;

/** Expand/collapse control — label always names the action, never an icon alone. */
export function DisclosureBtn({
  open,
  onClick,
  expandLabel = 'Mở rộng',
  collapseLabel = 'Thu gọn',
  title,
  compact,
  style,
}: {
  open: boolean;
  onClick: () => void;
  expandLabel?: string;
  collapseLabel?: string;
  title?: string;
  compact?: boolean;
  style?: CSSProperties;
}) {
  const label = open ? collapseLabel : expandLabel;
  return (
    <button
      type="button"
      aria-expanded={open}
      title={title ?? label}
      onClick={onClick}
      style={{
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
        border: '1px solid var(--bd)', borderRadius: 6,
        background: 'transparent', color: 'var(--txt2)',
        font: 'inherit', fontSize: compact ? 10.5 : 11,
        padding: compact ? '3px 7px' : '4px 8px',
        whiteSpace: 'nowrap', flex: 'none',
        ...style,
      }}
    >
      <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
      {label}
    </button>
  );
}

/* dc.html:792 / :837 — 11px uppercase .08em · :927/:941 — 10.5px uppercase .09em */
export function SectionLabel({
  children, fs = 11, tracking = '.08em', color = 'var(--txt3)',
}: { children: ReactNode; fs?: number; tracking?: string; color?: string }) {
  return (
    <div style={{ fontSize: fs, letterSpacing: tracking, textTransform: 'uppercase', color, fontWeight: 600 }}>
      {children}
    </div>
  );
}

/** Ellipsised flexible text cell (§2 rule 6). */
export function Ellipsis({
  children, style, mono, className,
}: { children: ReactNode; style?: CSSProperties; mono?: boolean; className?: string }) {
  return (
    <div
      className={[mono ? 'v3-mono' : '', className ?? ''].filter(Boolean).join(' ') || undefined}
      style={{
        flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style,
      }}
    >
      {children}
    </div>
  );
}
