import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { createDefaultAutonomyPolicy, parseAutonomyPolicy, type AutonomyPolicy } from '../contracts';
import { writeFileAtomic } from '../epic';

/** Project-level autonomy configuration used as the snapshot for new Epics. */
export class AutonomyPolicyStore {
  constructor(private readonly workspaceRoot: string) {}
  file(): string { return path.join(this.workspaceRoot, '.aidlc', 'autonomy.yaml'); }
  load(): AutonomyPolicy {
    return fs.existsSync(this.file())
      ? parseAutonomyPolicy(yaml.load(fs.readFileSync(this.file(), 'utf8')))
      : createDefaultAutonomyPolicy();
  }
  save(policy: AutonomyPolicy): AutonomyPolicy {
    const validated = parseAutonomyPolicy(policy);
    writeFileAtomic(this.file(), yaml.dump({
      schemaVersion: validated.schemaVersion,
      default: validated.default,
      stages: validated.stages,
      gates: validated.gates,
      recovery: {
        max_attempts: validated.recovery.maxAttempts,
        on_validation_failure: validated.recovery.onValidationFailure,
        on_ambiguous_requirement: validated.recovery.onAmbiguousRequirement,
      },
    }, { noRefs: true, lineWidth: 120 }));
    return validated;
  }
}
