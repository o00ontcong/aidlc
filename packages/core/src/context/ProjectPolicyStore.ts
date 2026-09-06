/**
 * `.aidlc/project-policy.yaml` reader (implementation plan §9.4, §D9). Never
 * writes it implicitly — plan §18.2: "project.setup preview/apply duoc mo
 * rong de tao chi file con thieu, khong overwrite policy da co", and that
 * setup flow is out of this milestone's scope; a missing file just means
 * every read falls back to the locked default, read-only.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { DEFAULT_PROJECT_POLICY, parseProjectPolicy, type ProjectPolicy } from '../contracts/projectPolicy';

export class ProjectPolicyStore {
  constructor(private readonly workspaceRoot: string) {}

  file(): string {
    return path.join(this.workspaceRoot, '.aidlc', 'project-policy.yaml');
  }

  /** The effective policy: parsed file if present, else `DEFAULT_PROJECT_POLICY` unchanged. */
  load(): ProjectPolicy {
    if (!fs.existsSync(this.file())) return DEFAULT_PROJECT_POLICY;
    return parseProjectPolicy(yaml.load(fs.readFileSync(this.file(), 'utf8')));
  }
}
