import {
  CommandNameSchema,
  ERROR_CODE_PATTERN,
  RECOVERY_ACTION_KINDS,
  nowIso,
  parseApplicationCommand,
  parseCommandResult,
  type ActorRef,
  type AidlcErrorMetadata,
  type ApplicationCommand,
  type CommandResult,
  type RecoveryAction,
} from '../contracts';

export type CommandHandler<Payload = unknown, Data = unknown> = (command: ApplicationCommand<Payload>) => Promise<CommandResult<Data>> | CommandResult<Data>;
export class CommandBus {
  private readonly handlers = new Map<string, CommandHandler>();
  names(): string[] { return [...this.handlers.keys()].sort(); }
  register<Payload, Data = unknown>(name: string, handler: CommandHandler<Payload, Data>): void {
    CommandNameSchema.parse(name);
    if (this.handlers.has(name)) throw new Error(`Command handler ${name} is already registered.`);
    this.handlers.set(name, handler as CommandHandler);
  }
  async dispatch<Payload>(command: ApplicationCommand<Payload>): Promise<CommandResult> {
    const commandId = typeof command?.id === 'string' && command.id ? command.id : 'invalid-command';
    try {
      const parsed = parseApplicationCommand(command) as ApplicationCommand<Payload>;
      const handler = this.handlers.get(parsed.name);
      if (!handler) return this.error(commandId, 'command.not_found', `No handler for ${parsed.name}.`);
      return parseCommandResult(await handler(parsed));
    } catch (error) {
      const candidate = error as { code?: unknown; message?: unknown; recoveryActions?: unknown; metadata?: unknown };
      const code = typeof candidate.code === 'string' && ERROR_CODE_PATTERN.test(candidate.code)
        ? candidate.code
        : 'command.execution_failed';
      const recoveryActions = extractRecoveryActions(candidate.recoveryActions);
      const metadata = extractMetadata(candidate.metadata);
      return this.error(commandId, code, error instanceof Error ? error.message : String(error), recoveryActions, metadata);
    }
  }
  command<Payload>(id: string, name: string, actor: ActorRef, payload: Payload): ApplicationCommand<Payload> {
    return parseApplicationCommand({ schemaVersion: 1, id, name, issuedAt: nowIso(), actor, payload }) as ApplicationCommand<Payload>;
  }

  private error(
    commandId: string,
    code: string,
    summary: string,
    recoveryActions: RecoveryAction[] = [],
    metadata?: AidlcErrorMetadata,
  ): CommandResult {
    return {
      schemaVersion: 1,
      commandId,
      status: 'error',
      warnings: [],
      evidence: [],
      recoveryActions: [],
      error: { code, summary, detail: summary, at: nowIso(), recoveryActions, metadata },
    };
  }
}

/**
 * A thrown domain error may carry `.recoveryActions`/`.metadata` (plan
 * §18.6) so a caller doesn't have to catch-and-reformat known errors by
 * hand in every command handler; this only trusts values already shaped
 * like a `RecoveryAction`/metadata record; anything else is dropped rather
 * than risk echoing something unexpected (e.g. file content) into a result.
 */
function extractRecoveryActions(value: unknown): RecoveryAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecoveryAction =>
    Boolean(item) && typeof item === 'object' && typeof (item as { kind?: unknown }).kind === 'string'
    && (RECOVERY_ACTION_KINDS as readonly string[]).includes((item as { kind: string }).kind)
    && typeof (item as { label?: unknown }).label === 'string');
}

function extractMetadata(value: unknown): AidlcErrorMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, entryValue]) => typeof entryValue === 'string' || typeof entryValue === 'number' || typeof entryValue === 'boolean' || entryValue === null,
  );
  return entries.length ? Object.fromEntries(entries) as AidlcErrorMetadata : undefined;
}
