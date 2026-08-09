import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { writeFileAtomic } from '../epic';

export interface ModelProviderConfig { schemaVersion: 1; defaultProvider: string; }

/** Durable provider preference; credentials remain provider-owned and are never stored here. */
export class ModelProviderConfigStore {
  constructor(private readonly workspaceRoot: string) {}
  file(): string { return path.join(this.workspaceRoot, '.aidlc', 'providers.yaml'); }
  load(): ModelProviderConfig | null {
    if (!fs.existsSync(this.file())) return null;
    const raw = yaml.load(fs.readFileSync(this.file(), 'utf8')) as Partial<ModelProviderConfig> | null;
    if (raw?.schemaVersion !== 1 || typeof raw.defaultProvider !== 'string' || !raw.defaultProvider.trim()) throw new Error(`Invalid provider config at ${this.file()}.`);
    return { schemaVersion: 1, defaultProvider: raw.defaultProvider };
  }
  save(defaultProvider: string): ModelProviderConfig {
    if (!defaultProvider.trim()) throw new Error('Default provider id must not be empty.');
    const config: ModelProviderConfig = { schemaVersion: 1, defaultProvider };
    writeFileAtomic(this.file(), yaml.dump(config, { noRefs: true }));
    return config;
  }
}
