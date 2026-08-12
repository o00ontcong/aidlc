// Real quota data for the sidebar QuotaTracker — replaces MOCK_QUOTA once a
// webview host is present. All %, tone, and reset-label math already
// happened on the extension side (core's presentQuotaSnapshot); this hook
// only moves bytes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { callCommand, onHostState } from '../lib/applicationClient';
import type { QuotaCardVM } from '../data/types';

export interface QuotaState {
  cards: QuotaCardVM[];
  connectedCount: number;
  notConnectedCount: number;
  generatedAt: string;
}

interface UseQuotaResult {
  quota: QuotaState | null;
  /** True until the first snapshot (cached or fresh) has arrived. */
  loading: boolean;
  /** True while an explicit user-triggered refresh is in flight. */
  refreshing: boolean;
  refresh: () => Promise<void>;
  setEnabled: (providerId: string, enabled: boolean) => Promise<void>;
}

export function useQuota(): UseQuotaResult {
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => onHostState((state) => {
    const next = state.quota as QuotaState | undefined;
    if (next) setQuota(next);
  }), []);

  useEffect(() => {
    // Instant paint from the host's cache; a live push (or the refresh()
    // below) supersedes it once the background probe completes.
    callCommand<QuotaState>('quota.list').then((data) => { if (mounted.current) setQuota(data); }).catch(() => { /* surfaced via status:'error' cards, not here */ });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await callCommand<QuotaState>('quota.refresh');
      if (mounted.current) setQuota(data);
    } catch {
      // No webview host (e.g. a browser dev preview) or a transport failure —
      // leave whatever we already have; cards fall back to their '—' state.
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setEnabled = useCallback(async (providerId: string, enabled: boolean) => {
    try {
      const data = await callCommand<QuotaState>('quota.setEnabled', { providerId, enabled });
      if (mounted.current) setQuota(data);
    } catch {
      // Toggle stays visually unchanged — no confirmed state to show instead.
    }
  }, []);

  return { quota, loading: quota === null, refreshing, refresh, setEnabled };
}
