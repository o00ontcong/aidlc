/**
 * Filesystem-only detection helpers shared by adapters. No process spawning —
 * detect() must stay cheap enough to run on every sidebar refresh without
 * blocking (docs/prompts/quota-tracker-implementation.md §2.5).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ProbeEnv } from '../types';

/** True if `binaryName` exists in any directory on PATH (platform-aware extensions). */
export function isOnPath(binaryName: string, env: ProbeEnv): boolean {
  const pathVar = env.env.PATH ?? env.env.Path ?? '';
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        if (fs.existsSync(path.join(dir, binaryName + ext))) return true;
      } catch {
        /* unreadable dir entry — not installed there */
      }
    }
  }
  return false;
}

/** Resolve a provider's config dir: env override first, else `~/.<defaultRelative>`. */
export function resolveConfigDir(env: ProbeEnv, envVarName: string, defaultRelative: string): string {
  const override = env.env[envVarName];
  return override && override.length > 0 ? override : path.join(env.home, defaultRelative);
}

export function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
