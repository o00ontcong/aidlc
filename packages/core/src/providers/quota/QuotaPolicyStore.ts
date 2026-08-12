/**
 * Durable per-provider enable/disable overrides — same shape and atomic-write
 * discipline as CapabilityPolicyStore (packages/core/src/capabilities/CapabilityRegistry.ts),
 * stored separately under `.aidlc/quota.yaml` since it's a distinct policy
 * (routing eligibility, not capability gating).
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

/** Missing entries default to enabled — a newly-registered provider starts on. */
export type QuotaPolicy = Readonly<Record<string, boolean>>;

export class QuotaPolicyStore {
  constructor(private readonly workspaceRoot: string) {}

  file(): string {
    return path.join(this.workspaceRoot, '.aidlc', 'quota.yaml');
  }

  load(): QuotaPolicy {
    if (!fs.existsSync(this.file())) return {};
    const raw = yaml.load(fs.readFileSync(this.file(), 'utf8')) as { schemaVersion?: unknown; enabled?: unknown };
    if (raw?.schemaVersion !== 1 || !raw.enabled || typeof raw.enabled !== 'object' || Array.isArray(raw.enabled)) {
      throw new Error(`Invalid quota policy at ${this.file()}.`);
    }
    const entries = Object.entries(raw.enabled as Record<string, unknown>);
    if (entries.some(([, value]) => typeof value !== 'boolean')) {
      throw new Error(`Quota policy values at ${this.file()} must be boolean.`);
    }
    return Object.fromEntries(entries) as QuotaPolicy;
  }

  save(policy: QuotaPolicy): void {
    fs.mkdirSync(path.dirname(this.file()), { recursive: true });
    const temp = `${this.file()}.tmp`;
    fs.writeFileSync(temp, yaml.dump({ schemaVersion: 1, enabled: policy }, { noRefs: true }), 'utf8');
    fs.renameSync(temp, this.file());
  }
}
