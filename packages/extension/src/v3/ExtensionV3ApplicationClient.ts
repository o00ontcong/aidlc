/**
 * Extension-host half of the v3 UI boundary.
 *
 * W3I supplies the bridge and the real CommandBus dispatcher. This module is
 * purposely unaware of VS Code, workspace files, and orchestration so it is
 * safe to unit-test and cannot fork the application state machine.
 */

export type RegistryScope = 'project' | 'global';

export interface RegistryAgentInput {
  readonly id: string; readonly name: string; readonly description: string; readonly model: string;
  readonly tier: 'fast' | 'balanced' | 'deep' | 'review'; readonly skills: readonly string[];
  readonly capabilities: readonly ('figma' | 'files' | 'github' | 'web')[];
}
export interface RegistrySkillInput {
  readonly id: string; readonly source: 'bundled' | 'design' | 'custom'; readonly description: string; readonly body: string;
}
export interface RegistryPipelineStepInput {
  readonly id: string; readonly agent?: string; readonly skills: readonly string[]; readonly outputs: readonly string[];
  readonly autoReview: boolean; readonly humanReview: boolean;
  readonly onReject?: { readonly rerun: string; readonly withFeedback: boolean };
  readonly gate?: string;
}
export interface RegistryPipelineInput {
  readonly id: string; readonly version: string; readonly steps: readonly RegistryPipelineStepInput[];
}
export interface RegistryTemplate {
  readonly id: string;
  readonly kind: 'agent' | 'skill';
  readonly label: string;
  readonly description: string;
  readonly agent?: RegistryAgentInput;
  readonly skill?: RegistrySkillInput;
}

export type ExtensionV3CommandName = string
  | 'registry.agent.create' | 'registry.agent.update' | 'registry.agent.delete'
  | 'registry.skill.create' | 'registry.skill.update' | 'registry.skill.delete'
  | 'registry.pipeline.create' | 'registry.pipeline.update' | 'registry.pipeline.copyToProject' | 'registry.pipeline.delete' | 'registry.pipeline.generateFromRecipe';

export interface ExtensionV3Command {
  readonly id: string;
  readonly name: ExtensionV3CommandName;
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
