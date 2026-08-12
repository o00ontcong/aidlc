/**
 * Recursively finds the most-recently-modified file matching `test` under
 * `root`, bounded to `maxDepth` (Codex's `sessions/YYYY/MM/DD/*.jsonl` and
 * Claude's `projects/<slug>/*.jsonl` layouts are both 2-3 levels deep).
 */

import * as fs from 'fs';
import * as path from 'path';

export function findLatestFile(root: string, test: (name: string) => boolean, maxDepth = 4): string | undefined {
  let best: { path: string; mtimeMs: number } | undefined;

  function walk(dir: string, depth: number): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(full, depth + 1);
      } else if (entry.isFile() && test(entry.name)) {
        try {
          const stat = fs.statSync(full);
          if (!best || stat.mtimeMs > best.mtimeMs) best = { path: full, mtimeMs: stat.mtimeMs };
        } catch {
          /* file disappeared between readdir and stat — skip */
        }
      }
    }
  }

  walk(root, 0);
  return best?.path;
}
