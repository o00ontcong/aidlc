/**
 * Skill registry (IMPLEMENT.md §1/§2 step 2): `.aidlc/skills/<id>.md` in the
 * project, `~/.claude/skills/<id>.md` globally. Project entries win on id
 * collision. The markdown body is the skill's instructions
 * ({@link Skill.body}); frontmatter carries `source`/`description`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

import { parseSkill, type Skill } from '../contracts';
import { readFrontmatterFile, writeFrontmatterFile, listFrontmatterIds } from './frontmatterFile';

const PROJECT_REL_DIR = path.join('.aidlc', 'skills');
const GLOBAL_REL_DIR = path.join('.claude', 'skills');

export class SkillStore {
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

  read(id: string): Skill | null {
    const project = readFrontmatterFile(this.fileFor(id, 'project'));
    const raw = project ?? readFrontmatterFile(this.fileFor(id, 'global'));
    return raw ? parseSkill({ ...raw.data, id, body: raw.body }) : null;
  }

  list(): Skill[] {
    const ids = new Set([...listFrontmatterIds(this.projectDir()), ...listFrontmatterIds(this.globalDir())]);
    // ~/.claude/skills is shared with Claude Code and may contain legacy
    // skill markdown without AIDLC's registry frontmatter. Ignore those
    // unrelated files while retaining strict validation for an explicit read.
    return [...ids].sort().flatMap((id) => {
      try {
        const skill = this.read(id);
        return skill ? [skill] : [];
      } catch {
        return [];
      }
    });
  }

  write(skill: Skill, scope: 'project' | 'global' = 'project'): Skill {
    const validated = parseSkill(skill);
    writeFrontmatterFile(
      this.fileFor(validated.id, scope),
      { id: validated.id, source: validated.source, description: validated.description },
      validated.body,
    );
    this.emitter.emit('change', { id: validated.id, scope });
    return validated;
  }

  onChange(listener: (event: { id: string; scope: 'project' | 'global' }) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }
}
