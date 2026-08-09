import { nowIso, type ActorRef, type ApplicationCommand, type CommandResult } from '../contracts';

export type CommandHandler<Payload = unknown, Data = unknown> = (command: ApplicationCommand<Payload>) => Promise<CommandResult<Data>> | CommandResult<Data>;
export class CommandBus {
  private readonly handlers = new Map<string, CommandHandler>();
  register<Payload, Data>(name: string, handler: CommandHandler<Payload, Data>): void { this.handlers.set(name, handler as CommandHandler); }
  async dispatch<Payload>(command: ApplicationCommand<Payload>): Promise<CommandResult> {
    const handler = this.handlers.get(command.name);
    if (!handler) return { schemaVersion: 1, commandId: command.id, status: 'error', warnings: [], evidence: [], recoveryActions: [], error: { code: 'command.not_found', summary: `No handler for ${command.name}.`, at: nowIso(), recoveryActions: [] } };
    return handler(command);
  }
  command<Payload>(id: string, name: string, actor: ActorRef, payload: Payload): ApplicationCommand<Payload> { return { schemaVersion: 1, id, name, issuedAt: nowIso(), actor, payload }; }
}
