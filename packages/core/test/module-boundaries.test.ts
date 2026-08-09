import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(__dirname, '../src');
const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && target.endsWith('.ts') && !target.endsWith('.d.ts') ? [target] : [];
  });
}

function resolveImport(importer: string, specifier: string): string | undefined {
  const target = path.resolve(path.dirname(importer), specifier);
  const candidates = [`${target}.ts`, path.join(target, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function dependencyGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const dependencies: string[] = [];
    for (const match of fs.readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) dependencies.push(resolved);
    }
    graph.set(file, dependencies);
  }
  return graph;
}

function cycles(graph: Map<string, string[]>): string[][] {
  const active: string[] = [];
  const visited = new Set<string>();
  const found: string[][] = [];
  const visit = (file: string): void => {
    const activeIndex = active.indexOf(file);
    if (activeIndex >= 0) {
      found.push([...active.slice(activeIndex), file]);
      return;
    }
    if (visited.has(file)) return;
    active.push(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    active.pop();
    visited.add(file);
  };
  for (const file of graph.keys()) visit(file);
  return found;
}

describe('core module boundaries', () => {
  it('keeps the public core source import graph acyclic', () => {
    const found = cycles(dependencyGraph()).map((cycle) => cycle.map((file) => path.relative(SOURCE_ROOT, file)).join(' -> '));
    expect(found, `Circular imports:\n${found.join('\n')}`).toEqual([]);
  });
});
