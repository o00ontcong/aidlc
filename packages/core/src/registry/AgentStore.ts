/**
 * Agent registry (IMPLEMENT.md §1/§2 step 2): `.claude/agents/<id>.md` in the
 * project, `~/.claude/agents/<id>.md` globally. Project entries win on id
 * collision. Writes emit a change event so the webview can refresh without a
 * reload.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

import { parseAgent, type Agent } from '../contracts';
import { readFrontmatterFile, writeFrontmatterFile, listFrontmatterIds } from './frontmatterFile';

const PROJECT_REL_DIR = path.join('.claude', 'agents');
const GLOBAL_REL_DIR = path.join('.claude', 'agents');

export class AgentStore {
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly workspaceRoot: string,
    private readonly globalRoot: string = os.homedir(),
  ) {}

  projectDir(): string { return path.join(this.workspaceRoot, PROJECT_REL_DIR); }
  globalDir(): string { return path.join(this.globalRoot, GLOBAL_REL_DIR); }

  private fileFor(id: string, scope: 'project' | 'global'): string {
    return path.join(scope === 'project' ? this.projectDir() : this.globalDir(), `${id}.md`);
  }

  exists(id: string): boolean {
    return fs.existsSync(this.fileFor(id, 'project')) || fs.existsSync(this.fileFor(id, 'global'));
  }

  read(id: string): Agent | null {
    const project = readFrontmatterFile(this.fileFor(id, 'project'));
    const raw = project ?? readFrontmatterFile(this.fileFor(id, 'global'));
    return raw ? parseAgent({ ...raw.data, id }) : null;
  }

  /** Project ids first, then global ids not already shadowed by a project entry — sorted, de-duplicated. */
  list(): Agent[] {
    const ids = new Set([...listFrontmatterIds(this.projectDir()), ...listFrontmatterIds(this.globalDir())]);
    // ~/.claude/agents can contain legacy Claude files that are not AIDLC
    // registry agents. One malformed legacy entry must not blank the Builder.
    return [...ids].sort().flatMap((id) => {
      try {
        const agent = this.read(id);
        return agent ? [agent] : [];
      } catch {
        return [];
      }
    });
  }

  write(agent: Agent, scope: 'project' | 'global' = 'project'): Agent {
    const validated = parseAgent(agent);
    writeFrontmatterFile(this.fileFor(validated.id, scope), validated, '');
    this.emitter.emit('change', { id: validated.id, scope });
    return validated;
  }

  onChange(listener: (event: { id: string; scope: 'project' | 'global' }) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }
}
