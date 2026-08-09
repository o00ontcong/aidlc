import type { V3ApplicationClient, V3RecoveryAction } from '../contracts';
import { createV3CommandFactory, recoveryPayload } from '../contracts';

export function RecoveryActions({ epicId, actions, client }: {
  epicId?: string;
  actions: readonly V3RecoveryAction[];
  client: V3ApplicationClient;
}) {
  const command = createV3CommandFactory('recovery');
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Recovery actions">
      {actions.map((action) => (
        <button
          type="button"
          key={`${action.kind}-${action.label}`}
          title={action.description}
          className="rounded border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary hover:bg-accent"
          onClick={() => {
            const reason = action.requiresReason ? window.prompt(`${action.label}: add a reason`) ?? undefined : undefined;
            if (action.requiresReason && !reason) return;
            client.dispatch(command('recovery.apply', recoveryPayload(epicId, action, reason)));
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
