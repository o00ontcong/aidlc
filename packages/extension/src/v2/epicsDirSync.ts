/**
 * Pure helpers for reading / writing the epics directory (`state.root`)
 * in workspace.yaml. No VS Code dependency — safe to import from tests.
 *
 * The VS Code glue (setting sync, config listener) lives in extension.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readYaml, writeYaml } from './yamlIO';

export const DEFAULT_EPICS_DIR = 'docs/epics';

/**
 * Read `state.root` from workspace.yaml. Returns the default when the
 * file is missing or the field is absent.
 */
export function readEpicsDirFromYaml(workspaceRoot: string): string {
  const doc = readYaml(workspaceRoot);
  if (!doc) { return DEFAULT_EPICS_DIR; }
  const state = doc.state as Record<string, unknown> | undefined;
  if (state && typeof state.root === 'string' && state.root.trim()) {
    return state.root;
  }
  return DEFAULT_EPICS_DIR;
}

/**
 * Write `state.root` in workspace.yaml. No-op when workspace.yaml
 * doesn't exist (nothing to update).
 */
export function writeEpicsDirToYaml(workspaceRoot: string, dir: string): void {
  const doc = readYaml(workspaceRoot);
  if (!doc) { return; }
  if (!doc.state) { doc.state = {}; }
  (doc.state as Record<string, unknown>).root = dir;
  writeYaml(workspaceRoot, doc);
}

/**
 * True when `<workspaceRoot>/<epicsDir>/<epicId>/state.json` already exists —
 * i.e. this id is already a live, interactive epic in the currently active
 * epics directory. Legacy migration must not project a duplicate over it: a
 * legacy record (e.g. a stale `.aidlc/runs/<id>.json`) can be leftover audit
 * data for an id whose real epic already lives here, and shadowing it with a
 * separately-named `EPIC-<id>` projection would create a duplicate the user
 * can't interact with, next to the real epic.
 */
export function hasActiveEpicAtId(workspaceRoot: string, epicsDir: string, epicId: string): boolean {
  return fs.existsSync(path.join(path.resolve(workspaceRoot, epicsDir), epicId, 'state.json'));
}
