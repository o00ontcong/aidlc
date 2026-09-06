import { useEffect, useState } from 'react';
import { onHostMessage } from '../lib/bridge';

/**
 * True while the extension host is handling a webview action or rebuilding
 * workspace state. Used for global busy chrome (tour coach, top progress)
 * when the delay is not tied to a single clicked control.
 */
export function useHostBusy(): boolean {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const off = onHostMessage((msg) => {
      if (msg.type !== 'hostBusy') { return; }
      if (!alive) { return; }
      setBusy(msg.busy === true);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return busy;
}
