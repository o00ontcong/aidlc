import type { V3ApplicationClient, V3StageId } from '../../contracts';
import { createV3CommandFactory } from '../../contracts';

/** A contextual link only: AST graph remains an optional supporting surface. */
export function AstGraphContextAction({ epicId, stageId, enabled, client }: {
  epicId: string;
  stageId?: V3StageId;
  enabled: boolean;
  client: V3ApplicationClient;
}) {
  const command = createV3CommandFactory('ast');
  if (!enabled) return null;
  return <button type="button" onClick={() => client.dispatch(command('capability.ast.graph.open', { epicId, stageId }))} className="text-xs font-medium text-primary hover:underline">Inspect code structure with AST graph</button>;
}
