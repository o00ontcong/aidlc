import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { ResolvedModelSchema, nowIso, type ResolvedModel } from '../contracts';

export interface ModelSelectionLock {
  schemaVersion: 1;
  selections: Record<string, ResolvedModel>;
  updatedAt: string;
}

export function createModelSelectionLock(selections: Record<string, ResolvedModel> = {}, updatedAt: string = nowIso()): ModelSelectionLock {
  return { schemaVersion: 1, selections: { ...selections }, updatedAt };
}

export class ModelSelectionLockStore {
  constructor(private readonly workspaceRoot: string, private readonly clock: () => string = nowIso) {}

  file(): string {
    return path.join(this.workspaceRoot, '.aidlc', 'catalog', 'selection.lock.yaml');
  }

  load(): ModelSelectionLock | null {
    const file = this.file();
    if (!fs.existsSync(file)) return null;
    try {
      const raw = yaml.load(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      if (!raw || raw.schemaVersion !== 1 || !raw.selections || typeof raw.selections !== 'object' || Array.isArray(raw.selections)) {
        throw new Error('expected schemaVersion 1 with a selections object');
      }
      const selections = Object.fromEntries(Object.entries(raw.selections).map(([key, value]) => [key, ResolvedModelSchema.parse(value)]));
      if (typeof raw.updatedAt !== 'string') throw new Error('expected updatedAt timestamp');
      return { schemaVersion: 1, selections, updatedAt: raw.updatedAt };
    } catch (error) {
      throw new Error(`Invalid model selection lock at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  save(lock: ModelSelectionLock): void {
    const file = this.file();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const content = yaml.dump(lock, { noRefs: true, lineWidth: 120 });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, content, 'utf8');
    fs.renameSync(temp, file);
  }

  record(key: string, model: ResolvedModel): ModelSelectionLock {
    if (!key.trim()) throw new Error('Model selection lock key must not be empty.');
    const prior = this.load() ?? createModelSelectionLock({}, this.clock());
    const next: ModelSelectionLock = {
      schemaVersion: 1,
      selections: { ...prior.selections, [key]: model },
      updatedAt: this.clock(),
    };
    this.save(next);
    return next;
  }
}
