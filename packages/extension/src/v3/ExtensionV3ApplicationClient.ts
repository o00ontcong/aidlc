/**
 * Extension-host half of the v3 UI boundary.
 *
 * W3I supplies the bridge and the real CommandBus dispatcher. This module is
 * purposely unaware of VS Code, workspace files, and orchestration so it is
 * safe to unit-test and cannot fork the application state machine.
 */

export interface ExtensionV3Command {
  readonly id: string;
  readonly name: string;
  readonly payload: unknown;
}

export interface ExtensionV3InboundMessage {
  readonly type: 'aidlc.v3.command';
  readonly command: ExtensionV3Command;
}

export interface ExtensionV3CommandResult {
  readonly commandId: string;
  readonly status: 'ok' | 'waiting-for-user' | 'blocked' | 'error';
  readonly data?: unknown;
}

export type ExtensionV3Dispatcher = (command: ExtensionV3Command) => Promise<ExtensionV3CommandResult>;

export function isExtensionV3InboundMessage(value: unknown): value is ExtensionV3InboundMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; command?: { id?: unknown; name?: unknown } };
  return message.type === 'aidlc.v3.command'
    && typeof message.command?.id === 'string'
    && typeof message.command?.name === 'string';
}

export class ExtensionV3ApplicationClient {
  constructor(private readonly dispatcher: ExtensionV3Dispatcher) {}

  async handleMessage(message: unknown): Promise<ExtensionV3CommandResult | undefined> {
    if (!isExtensionV3InboundMessage(message)) return undefined;
    return this.dispatcher(message.command);
  }
}
