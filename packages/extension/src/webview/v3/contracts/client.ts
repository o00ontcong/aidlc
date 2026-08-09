import type { V3AutonomyMode, V3GatePreview, V3RecoveryAction } from './types';

/** Names intentionally map to the application command bus, never to VS Code commands. */
export const V3_COMMAND_NAMES = [
  'project.analyze', 'project.context.refresh', 'project.context.status', 'project.recommend',
  'epic.create', 'epic.prepare', 'epic.next', 'epic.status', 'epic.explain', 'epic.resume', 'epic.review', 'epic.ship',
  'epic.stage.autonomy.set', 'gate.approve', 'gate.reject', 'recovery.apply', 'workflow.compile', 'model.diagnose',
  'artifact.policy.update', 'model.provider.default.set', 'capability.enabled.set', 'capability.ast.graph.open', 'capability.annotation.open', 'epic.review.feedback',
  'migration.preview',
] as const;
export type V3CommandName = (typeof V3_COMMAND_NAMES)[number];

export interface V3Command<Payload = Record<string, unknown>> {
  readonly id: string;
  readonly name: V3CommandName;
  readonly payload: Payload;
}

/**
 * The only browser-to-host boundary used by v3 components.  W3I adapts this
 * envelope to ApplicationCommand/CommandBus; UI components must not call
 * `vscode.commands` or implement orchestration themselves.
 */
export interface V3ApplicationClient {
  dispatch(command: V3Command): void;
}

export interface V3CommandTransport {
  postMessage(message: { type: 'aidlc.v3.command'; command: V3Command }): void;
}

export function createV3ApplicationClient(transport: V3CommandTransport): V3ApplicationClient {
  return {
    dispatch(command) {
      transport.postMessage({ type: 'aidlc.v3.command', command });
    },
  };
}

/** Testable command id factory; the host may replace it with its correlation id. */
export function createV3CommandFactory(
  prefix = 'ui',
  nextId: () => string = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
) {
  return function command<Payload extends Record<string, unknown>>(name: V3CommandName, payload: Payload): V3Command<Payload> {
    return { id: `${prefix}-${nextId()}`, name, payload };
  };
}

export function setStageAutonomyPayload(epicId: string, stageId: string, autonomy: V3AutonomyMode) {
  return { epicId, stageId, autonomy };
}

export function gateDecisionPayload(epicId: string, preview: V3GatePreview, decision: 'approved' | 'rejected') {
  return { epicId, gateId: preview.id, decision };
}

export function recoveryPayload(epicId: string | undefined, action: V3RecoveryAction, reason?: string) {
  return { epicId, action: action.command ?? action.kind, reason };
}
