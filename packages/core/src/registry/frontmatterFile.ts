/**
 * Shared read/write for the `<id>.md` frontmatter files that back
 * `AgentStore`/`SkillStore` (IMPLEMENT.md §1 — "Frontmatter agent"). Both
 * stores are otherwise identical filesystem shapes: a directory of markdown
 * files, one per id, YAML frontmatter + a markdown body.
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

import { writeFileAtomic } from '../epic';

export interface FrontmatterFile {
  data: Record<string, unknown>;
  body: string;
}

export function readFrontmatterFile(file: string): FrontmatterFile | null {
  if (!fs.existsSync(file)) return null;
  const parsed = matter(fs.readFileSync(file, 'utf8'));
  return { data: parsed.data, body: parsed.content.trim() };
}

export function writeFrontmatterFile(file: string, data: Record<string, unknown>, body: string): void {
  const content = matter.stringify(body ? `${body}\n` : '', data);
  writeFileAtomic(file, content);
}

/** List every `<id>.md` file directly inside `dir` (non-recursive), sorted by id. */
export function listFrontmatterIds(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.basename(entry.name, '.md'))
    .sort();
}
