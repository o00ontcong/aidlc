import { useCallback, useEffect, useRef, useState } from 'react';
import { onHostMessage } from '../lib/bridge';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Immediate pending feedback for fire-and-forget `postMessage` actions.
 *
 * Sets pending as soon as `run` is called, then clears when the host pushes
 * the next `{ type: 'state' }` (the common refresh path) or when `timeoutMs`
 * elapses. Optional `onSettled` runs once when pending clears after a run —
 * use it to close modals that previously closed before the host finished.
 */
export function useHostAction(options?: {
  timeoutMs?: number;
  onSettled?: () => void;
}): {
  pending: boolean;
  pendingKey: string | null;
  run: (send: () => void, key?: string) => void;
  isPending: (key: string) => boolean;
} {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const onSettledRef = useRef(options?.onSettled);
  onSettledRef.current = options?.onSettled;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const clearPending = useCallback((settled: boolean) => {
    if (pendingKeyRef.current === null) { return; }
    pendingKeyRef.current = null;
    setPendingKey(null);
    if (settled) {
      onSettledRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (pendingKey === null) { return; }
    const off = onHostMessage((msg) => {
      if (msg.type === 'state') {
        clearPending(true);
      }
    });
    // Timeout clears the spinner but does NOT settle (no modal close) — the
    // host may have shown an error without refreshing state.
    const timer = window.setTimeout(() => clearPending(false), timeoutMs);
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [pendingKey, timeoutMs, clearPending]);

  const run = useCallback((send: () => void, key = 'default') => {
    if (pendingKeyRef.current !== null) { return; }
    pendingKeyRef.current = key;
    setPendingKey(key);
    try {
      send();
    } catch {
      clearPending(false);
    }
  }, [clearPending]);

  return {
    pending: pendingKey !== null,
    pendingKey,
    run,
    isPending: (key: string) => pendingKey === key,
  };
}
