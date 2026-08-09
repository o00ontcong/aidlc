import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { toEpicId, type EpicId } from '../contracts';
import { writeFileAtomic } from '../epic';
import { CompiledWorkflowSchema, type CompiledWorkflow } from './WorkflowCompiler';

/** Durable compiler output. Runtime execution always loads this file. */
export class CompiledWorkflowStore {
  constructor(private readonly workspaceRoot: string) {}

  file(epicId: EpicId | string): string {
    return path.join(this.workspaceRoot, '.aidlc', 'epics', toEpicId(String(epicId)), 'workflow.json');
  }

  planFile(epicId: EpicId | string): string {
    return path.join(this.workspaceRoot, '.aidlc', 'epics', toEpicId(String(epicId)), 'plan.md');
  }

  loadProjectDefault(): { schemaVersion: 1; pack: string; profile?: CompiledWorkflow['profile'] } | null {
    const file = path.join(this.workspaceRoot, '.aidlc', 'workflows', 'default.yaml');
    if (!fs.existsSync(file)) return null;
    const raw = yaml.load(fs.readFileSync(file, 'utf8')) as { schemaVersion?: unknown; pack?: unknown; profile?: unknown } | null;
    if (raw?.schemaVersion !== 1 || typeof raw.pack !== 'string' || !raw.pack.trim()) throw new Error(`Invalid default workflow config at ${file}.`);
    if (raw.profile !== undefined && !['quick', 'standard', 'parallel', 'regulated'].includes(String(raw.profile))) throw new Error(`Invalid workflow profile at ${file}.`);
    return { schemaVersion: 1, pack: raw.pack, profile: raw.profile as CompiledWorkflow['profile'] | undefined };
  }

  load(epicId: EpicId | string): CompiledWorkflow | null {
    const file = this.file(epicId);
    if (!fs.existsSync(file)) return null;
    return CompiledWorkflowSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  save(workflow: CompiledWorkflow): CompiledWorkflow {
    const validated = CompiledWorkflowSchema.parse(workflow);
    writeFileAtomic(this.file(validated.epicId), `${JSON.stringify(validated, null, 2)}\n`);
    const plan = [
      `# ${validated.pack.id} workflow`,
      '',
      `Compiled hash: \`${validated.hash}\``,
      '',
      ...validated.stages.flatMap((stage) => [
        `## ${stage.id}`,
        '',
        ...stage.actions.map((action) => `- [ ] ${action.name} (\`${action.id}\`)`),
        '',
      ]),
    ].join('\n');
    writeFileAtomic(this.planFile(validated.epicId), `${plan.trimEnd()}\n`);
    return validated;
  }
}
