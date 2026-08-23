/**
 * Connect-Jira dialog: site, email and API token in one form.
 *
 * This replaces a chain of three `showInputBox` prompts, which had a real flaw
 * rather than just being ugly: a wrong token surfaced only after the third
 * prompt, and recovering meant retyping all three. Here the fields stay filled,
 * the error lands next to the field that caused it, and the user fixes one thing.
 *
 * ## Handling the token
 *
 * The token is typed here and posted to the host, which stores it straight into
 * SecretStorage. Three rules keep it from leaking anywhere else:
 *
 *   1. it never goes into `setState`/`getState`, so VS Code cannot persist it
 *      with the webview;
 *   2. it is cleared from component state the moment a connect succeeds;
 *   3. the host never echoes it back — `SprintState` carries no credentials, and
 *      the result message carries only a display name.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, KeyRound, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';

const TOKEN_DOCS = 'https://id.atlassian.com/manage-profile/security/api-tokens';

export interface JiraConnectResult {
  ok: boolean;
  /** Display name of the verified account, on success. */
  account?: string;
  /** Why it failed, on failure. */
  message?: string;
  /** Which field the failure points at, when we can tell. */
  field?: 'site' | 'email' | 'token';
}

export interface JiraConnectModalProps {
  /** Prefilled from settings — the token is never prefilled. */
  initialSite: string;
  initialEmail: string;
  busy: boolean;
  result: JiraConnectResult | null;
  onSubmit: (values: { site: string; email: string; token: string }) => void;
  onOpenDocs: (url: string) => void;
  onClose: () => void;
}

export function JiraConnectModal({
  initialSite, initialEmail, busy, result, onSubmit, onOpenDocs, onClose,
}: JiraConnectModalProps) {
  const [site, setSite] = useState(initialSite);
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState('');
  const [touched, setTouched] = useState(false);
  const siteRef = useRef<HTMLInputElement>(null);

  useEffect(() => { siteRef.current?.focus(); }, []);

  // Drop the token from memory as soon as it is no longer needed.
  useEffect(() => {
    if (result?.ok) { setToken(''); }
  }, [result?.ok]);

  const siteError = validateSite(site);
  const emailError = validateEmail(email);
  const tokenError = token.trim() ? '' : 'Nhập API token';
  const canSubmit = !siteError && !emailError && !tokenError && !busy;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) { return; }
    onSubmit({ site: site.trim(), email: email.trim(), token: token.trim() });
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-background/70 p-6 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { onClose(); }
      }}
    >
      <form
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">Kết nối Jira</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Chỉ hỗ trợ Jira Cloud. Token lưu trong VS Code SecretStorage, không vào{' '}
              <code className="font-mono">settings.json</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 px-4 py-3.5">
          <Field
            label="Jira site"
            hint="Chỉ cần tên site, không cần https://"
            error={touched ? siteError : ''}
            highlight={result?.field === 'site'}
          >
            <input
              ref={siteRef}
              type="text"
              value={site}
              onChange={(event) => setSite(event.target.value)}
              placeholder="acme.atlassian.net"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </Field>

          <Field
            label="Email"
            hint="Email của account Atlassian"
            error={touched ? emailError : ''}
            highlight={result?.field === 'email'}
          >
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </Field>

          <Field
            label="API token"
            error={touched ? tokenError : ''}
            highlight={result?.field === 'token'}
          >
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="••••••••••••"
              // Not a browser password field: nothing should offer to save it.
              autoComplete="new-password"
              spellCheck={false}
              className={cn(inputClass, 'font-mono')}
            />
            <button
              type="button"
              onClick={() => onOpenDocs(TOKEN_DOCS)}
              className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
            >
              Tạo API token trên Atlassian
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </Field>

          {result && !result.ok && result.message && (
            <div className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] leading-relaxed text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <b>Không kết nối được.</b> {result.message}
              </div>
            </div>
          )}
          {result?.ok && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-2.5 text-[11px] text-primary">
              Đã kết nối{result.account ? ` — ${result.account}` : ''}.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-surface/40 px-4 py-3">
          <button
            type="submit"
            disabled={busy}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold',
              busy
                ? 'cursor-wait border border-border bg-secondary text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Đang xác thực…' : 'Kết nối'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Huỷ
          </button>
          <span className="ml-auto text-[10.5px] text-muted-foreground">
            Chỉ lưu sau khi Jira xác nhận token đúng.
          </span>
        </div>
      </form>
    </div>
  );
}

const inputClass = 'w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] '
  + 'text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none '
  + 'focus:ring-1 focus:ring-primary/40';

function Field({ label, hint, error, highlight, children }: {
  label: string;
  hint?: string;
  error?: string;
  /** The host blamed this field for the last failure. */
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className={cn(
          'mb-1 block font-mono text-[9.5px] uppercase tracking-[0.1em]',
          highlight || error ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {children}
      {error
        ? <span className="mt-1 block text-[10.5px] text-destructive">{error}</span>
        : hint ? <span className="mt-1 block text-[10.5px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/**
 * Client-side checks only catch obvious typos so the user is not made to wait on
 * a round trip for them. The host still validates authoritatively — it is the
 * only side that can actually ask Jira.
 */
function validateSite(value: string): string {
  const site = value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!site) { return 'Nhập Jira site'; }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(site)) {
    return 'Không giống một site — ví dụ acme.atlassian.net';
  }
  return '';
}

function validateEmail(value: string): string {
  const email = value.trim();
  if (!email) { return 'Nhập email'; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return 'Email không hợp lệ'; }
  return '';
}
