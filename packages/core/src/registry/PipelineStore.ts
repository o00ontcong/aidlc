/**
 * Pipeline registry (IMPLEMENT.md §1/§2 step 2, §2 step 7): `.aidlc/pipelines/<id>.yaml`
 * in the project. Bundled pipelines ship with the extension, not the
 * filesystem, so they're supplied to the constructor rather than read from
 * disk; a project file with the same id is a versioned override and wins
 * over the bundled one on read (IMPLEMENT.md §2 step 7: "Không ghi đè pipeline
 * bundled — tạo bản copy project có version").
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EventEmitter } from 'events';

import { parsePipeline, type Pipeline } from '../contracts';
import { writeFileAtomic } from '../epic';

const PROJECT_REL_DIR = path.join('.aidlc', 'pipelines');

export class PipelineStore {
  private readonly emitter = new EventEmitter();
  private readonly bundled: Map<string, Pipeline>;

  constructor(
    private readonly workspaceRoot: string,
    bundled: Pipeline[] = [],
  ) {
    this.bundled = new Map(bundled.map((p) => [p.id, parsePipeline(p)]));
  }

  projectDir(): string { return path.join(this.workspaceRoot, PROJECT_REL_DIR); }
  private projectFile(id: string): string { return path.join(this.projectDir(), `${id}.yaml`); }

  exists(id: string): boolean {
    return fs.existsSync(this.projectFile(id)) || this.bundled.has(id);
  }

  isProject(id: string): boolean { return fs.existsSync(this.projectFile(id)); }

  scopeOf(id: string): 'project' | 'bundled' | null {
    if (this.isProject(id)) return 'project';
    return this.bundled.has(id) ? 'bundled' : null;
  }

  read(id: string): Pipeline | null {
    const projectFile = this.projectFile(id);
    if (fs.existsSync(projectFile)) {
      return parsePipeline(yaml.load(fs.readFileSync(projectFile, 'utf8')));
    }
    return this.bundled.get(id) ?? null;
  }

  list(): Pipeline[] {
    const ids = new Set<string>(this.bundled.keys());
    if (fs.existsSync(this.projectDir())) {
      for (const entry of fs.readdirSync(this.projectDir(), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.yaml')) ids.add(path.basename(entry.name, '.yaml'));
      }
    }
    return [...ids].sort().map((id) => this.read(id)).filter((p): p is Pipeline => p !== null);
  }

  /** Always writes a project-scoped copy — never mutates a bundled definition, matching IMPLEMENT.md §2 step 7. */
  write(pipeline: Pipeline): Pipeline {
    const validated = parsePipeline({ ...pipeline, source: 'project' as const });
    writeFileAtomic(this.projectFile(validated.id), yaml.dump(validated, { noRefs: true, lineWidth: 120 }));
    this.emitter.emit('change', { id: validated.id });
    return validated;
  }

  /** Removes a project override only. Bundled definitions are intentionally read-only. */
  remove(id: string): boolean {
    const file = this.projectFile(id);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    this.emitter.emit('change', { id });
    return true;
  }

  onChange(listener: (event: { id: string }) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }
}
