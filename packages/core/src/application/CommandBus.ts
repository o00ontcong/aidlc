import {
  CommandNameSchema,
  ERROR_CODE_PATTERN,
  nowIso,
  parseApplicationCommand,
  parseCommandResult,
  type ActorRef,
  type ApplicationCommand,
  type CommandResult,
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
      const candidate = error as { code?: unknown; message?: unknown };
      const code = typeof candidate.code === 'string' && ERROR_CODE_PATTERN.test(candidate.code)
        ? candidate.code
        : 'command.execution_failed';
      return this.error(commandId, code, error instanceof Error ? error.message : String(error));
    }
  }
  command<Payload>(id: string, name: string, actor: ActorRef, payload: Payload): ApplicationCommand<Payload> {
    return parseApplicationCommand({ schemaVersion: 1, id, name, issuedAt: nowIso(), actor, payload }) as ApplicationCommand<Payload>;
  }

  private error(commandId: string, code: string, summary: string): CommandResult {
    return {
      schemaVersion: 1,
      commandId,
      status: 'error',
      warnings: [],
      evidence: [],
      recoveryActions: [],
      error: { code, summary, detail: summary, at: nowIso(), recoveryActions: [] },
    };
  }
}
