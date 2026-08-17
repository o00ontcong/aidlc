import * as fs from 'node:fs';
import * as path from 'node:path';

/** Canonical project-context briefing files. Pipeline writes here; UI reads here. */
export const PROJECT_BRIEFING_PATHS = {
  review: 'docs/project/context/CONTEXT-REVIEW.md',
  projectContext: 'docs/project/context/PROJECT-CONTEXT.md',
  architectureMap: 'docs/project/context/ARCHITECTURE-MAP.md',
  architectureJson: 'docs/project/context/visualization/PROJECT-ARCHITECTURE.json',
  architectureMmd: 'docs/project/context/visualization/PROJECT-ARCHITECTURE.mmd',
  catalogJson: 'docs/project/context/visualization/FEATURE-CATALOG.json',
  catalogMmd: 'docs/project/context/visualization/FEATURE-CATALOG.mmd',
  screensJson: 'docs/project/context/visualization/SCREEN-CATALOG.json',
  screensMmd: 'docs/project/context/visualization/SCREEN-CATALOG.mmd',
  structuralJson: 'docs/project/context/visualization/STRUCTURAL-GRAPH-MANIFEST.json',
} as const;

export interface ProjectContextBriefing {
  summary?: string;
  flowMermaid?: string;
  impactMermaid?: string;
  screensMermaid?: string;
  created: string[];
}

export function mermaidSafeId(value: string): string {
  return `n_${value.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

export function mermaidSafeLabel(value: string): string {
  return value.replace(/[\\"\[\]{}|<>]/g, '').replace(/[\r\n]+/g, ' ').trim();
}

function readText(file: string): string {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  } catch {
    return '';
  }
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function markdownSection(text: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'im');
  const match = re.exec(text);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function isMermaid(text: string): boolean {
  return /^(flowchart|sequenceDiagram)\b/m.test(text.trim());
}

function isPlaceholderMermaid(text: string): boolean {
  return /not generated yet/i.test(text);
}

function needsMermaidFile(abs: string): boolean {
  if (!fs.existsSync(abs)) return true;
  const text = fs.readFileSync(abs, 'utf8').trim();
  return !text || !isMermaid(text) || isPlaceholderMermaid(text);
}

function nodeIdentity(raw: Record<string, unknown>): { id: string; label: string } | undefined {
  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : typeof raw.label === 'string' && raw.label.trim()
        ? raw.label.trim()
        : '';
  if (!id) return undefined;
  const label = typeof raw.label === 'string' && raw.label.trim()
    ? raw.label.trim()
    : typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : id;
  return { id, label };
}

function edgeEndpoints(raw: Record<string, unknown>): { source: string; target: string } | undefined {
  const source = typeof raw.source === 'string' && raw.source.trim()
    ? raw.source.trim()
    : typeof raw.from === 'string' && raw.from.trim()
      ? raw.from.trim()
      : '';
  const target = typeof raw.target === 'string' && raw.target.trim()
    ? raw.target.trim()
    : typeof raw.to === 'string' && raw.to.trim()
      ? raw.to.trim()
      : '';
  if (!source || !target) return undefined;
  return { source, target };
}

export interface ArchitectureGraphNode {
  id: string;
  label: string;
  kind?: string;
}

export interface ArchitectureGraphEdge {
  source: string;
  target: string;
}

/** Normalize architecture JSON (`layers`/`nodes`, `source`/`from`, `target`/`to`). */
export function architectureGraphFromJson(doc: Record<string, unknown> | undefined): {
  nodes: ArchitectureGraphNode[];
  edges: ArchitectureGraphEdge[];
} {
  if (!doc) return { nodes: [], edges: [] };
  const rawNodes = objects(doc.layers).length ? objects(doc.layers) : objects(doc.nodes);
  const nodes: ArchitectureGraphNode[] = [];
  const seen = new Set<string>();
  for (const raw of rawNodes) {
    const node = nodeIdentity(raw);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : undefined;
    nodes.push(kind ? { ...node, kind } : node);
  }
  const edges: ArchitectureGraphEdge[] = [];
  for (const raw of objects(doc.edges)) {
    const edge = edgeEndpoints(raw);
    if (edge) edges.push(edge);
  }
  return { nodes, edges };
}

export interface CatalogFeatureNode {
  id: string;
  name: string;
  parent?: string;
  area?: string;
  module?: string;
  children?: string[];
  summary?: string;
}

function catalogRowsFromList(
  items: Record<string, unknown>[],
  areaKeys: string[],
  includeModule: boolean,
): CatalogFeatureNode[] {
  const rows: CatalogFeatureNode[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const node = nodeIdentity(raw);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    const name = (typeof raw.name === 'string' && raw.name.trim()) ? raw.name.trim() : node.label;
    const parent = fieldString(raw, ['parent', 'parentId', 'parent_id']) || undefined;
    const area = fieldString(raw, areaKeys) || undefined;
    const moduleName = includeModule ? (fieldString(raw, ['module']) || undefined) : undefined;
    const children = childIds(raw.children);
    const summary = fieldString(raw, ['summary', 'notes', 'responsibility']) || undefined;
    rows.push({
      id: node.id,
      name,
      ...(parent ? { parent } : {}),
      ...(area ? { area } : {}),
      ...(moduleName ? { module: moduleName } : {}),
      ...(children.length ? { children } : {}),
      ...(summary ? { summary } : {}),
    });
  }
  return rows;
}

/** Flatten FEATURE-CATALOG.json into explorer rows (`name`/`id`/`module`). */
export function catalogFeaturesFromJson(catalog: Record<string, unknown> | undefined): CatalogFeatureNode[] {
  return catalogRowsFromList(objects(catalog?.features), ['area', 'domain', 'capability'], true);
}

/** Flatten SCREEN-CATALOG.json into explorer rows nested by tab/flow, not code module. */
export function catalogScreensFromJson(catalog: Record<string, unknown> | undefined): CatalogFeatureNode[] {
  const items = objects(catalog?.screens).length ? objects(catalog?.screens) : objects(catalog?.features);
  return catalogRowsFromList(items, ['tab', 'flow', 'area', 'nav', 'section'], false);
}

export function architectureOverviewMermaidFromJson(doc: Record<string, unknown> | undefined): string | undefined {
  const { nodes, edges } = architectureGraphFromJson(doc);
  if (nodes.length < 2) return undefined;
  const lines = ['flowchart TD'];
  for (const node of nodes) {
    lines.push(`  ${mermaidSafeId(node.id)}["${mermaidSafeLabel(node.label)}"]`);
  }
  for (const edge of edges) {
    lines.push(`  ${mermaidSafeId(edge.source)} --> ${mermaidSafeId(edge.target)}`);
  }
  return lines.length > 2 ? lines.join('\n') : undefined;
}

const GENERIC_DIR = new Set([
  'src', 'source', 'sources', 'lib', 'libs', 'test', 'tests', 'spec', '__tests__',
  'include', 'internal', 'public', 'main', 'resources', 'assets', 'classes',
  'node_modules', 'features', 'feature',
]);

function fieldString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function childIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const id = fieldString(item as Record<string, unknown>, ['id']);
      return id ? [id] : [];
    }
    return [];
  });
}

function wouldCycle(parentOf: Map<string, string>, child: string, parent: string): boolean {
  let current = parent;
  const seen = new Set<string>();
  while (current) {
    if (current === child) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(current) ?? '';
  }
  return false;
}

function setParent(parentOf: Map<string, string>, child: string, parent: string): void {
  if (!child || !parent || child === parent || parentOf.has(child)) return;
  if (wouldCycle(parentOf, child, parent)) return;
  parentOf.set(child, parent);
}

function meaningfulDirs(filePath: string): string[] {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length > 1) parts.pop();
  return parts.filter((part) => !GENERIC_DIR.has(part.toLowerCase()));
}

function commonPrefix(lists: string[][]): string[] {
  if (!lists.length) return [];
  const prefix: string[] = [];
  for (let i = 0; ; i += 1) {
    const token = lists[0][i];
    if (!token || lists.some((list) => list[i] !== token)) return prefix;
    prefix.push(token);
  }
}

function idPrefix(id: string): string {
  const match = id.match(/^([a-z][a-z0-9]{2,})[-_.]/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function mermaidNodeId(id: string, nodePrefix = 'feature'): string {
  if (id === 'APP') return 'app';
  if (id === 'UI') return 'ui';
  if (id.startsWith('area:')) return mermaidSafeId(`area_${id.slice(5)}`);
  if (id.startsWith('dir:')) return mermaidSafeId(`dir_${id.slice(4)}`);
  if (id.startsWith('pfx:')) return mermaidSafeId(`pfx_${id.slice(4)}`);
  if (id.startsWith('entry:')) return mermaidSafeId(`entry_${id.slice(6)}`);
  return mermaidSafeId(`${nodePrefix}_${id}`);
}

export interface NestedCatalogMermaidOptions {
  listKeys?: string[];
  rootId?: string;
  rootLabel?: string;
  groupKeys?: string[];
  useEvidenceDirs?: boolean;
  useIdPrefix?: boolean;
  nodePrefix?: string;
}

/**
 * Nested catalog tree. Feature catalog: APP → module/area → feature.
 * Screen catalog: UI → tab/flow → screen → sheet.
 */
export function nestedCatalogMermaidFromJson(
  catalog: Record<string, unknown> | undefined,
  options: NestedCatalogMermaidOptions = {},
): string | undefined {
  const listKeys = options.listKeys ?? ['features'];
  const rootId = options.rootId ?? 'APP';
  const rootLabel = options.rootLabel ?? 'APP';
  const groupKeys = options.groupKeys ?? ['area', 'domain', 'capability', 'module'];
  const useEvidenceDirs = options.useEvidenceDirs !== false;
  const useIdPrefix = options.useIdPrefix !== false;
  const nodePrefix = options.nodePrefix ?? 'feature';
  const nid = (id: string) => mermaidNodeId(id, nodePrefix);

  let features: Record<string, unknown>[] = [];
  for (const key of listKeys) {
    features = objects(catalog?.[key]);
    if (features.length) break;
  }
  if (!features.length) return undefined;

  const rows: Array<{ id: string; label: string; raw: Record<string, unknown> }> = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const node = nodeIdentity(feature);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    rows.push({ id: node.id, label: fieldString(feature, ['name']) || node.label, raw: feature });
  }
  if (!rows.length) return undefined;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parentOf = new Map<string, string>();
  const groups = new Map<string, string>();

  for (const row of rows) {
    for (const child of childIds(row.raw.children)) {
      if (byId.has(child)) setParent(parentOf, child, row.id);
    }
  }
  for (const row of rows) {
    const parent = fieldString(row.raw, ['parent', 'parentId', 'parent_id']);
    if (parent && byId.has(parent)) setParent(parentOf, row.id, parent);
  }
  for (const row of rows) {
    if (parentOf.has(row.id)) continue;
    const area = fieldString(row.raw, groupKeys);
    if (!area) continue;
    const key = `area:${area}`;
    groups.set(key, area);
    setParent(parentOf, row.id, key);
  }

  if (useEvidenceDirs) {
    const dirLists: string[][] = [];
    const dirsByFeature = new Map<string, string[]>();
    for (const row of rows) {
      if (parentOf.has(row.id)) continue;
      const evidence = Array.isArray(row.raw.evidence) ? row.raw.evidence : [];
      const file = evidence.find((item): item is string => typeof item === 'string' && Boolean(item.trim()));
      const dirs = file ? meaningfulDirs(file) : [];
      dirsByFeature.set(row.id, dirs);
      if (dirs.length) dirLists.push(dirs);
    }
    const parentLists = dirLists.map((dirs) => dirs.slice(0, Math.max(0, dirs.length - 1))).filter((dirs) => dirs.length);
    const shared = commonPrefix(parentLists);
    for (const [id, dirs] of dirsByFeature) {
      if (!dirs.length) continue;
      const top = dirs.slice(shared.length)[0] ?? dirs[dirs.length - 1];
      const key = `dir:${top}`;
      groups.set(key, top);
      setParent(parentOf, id, key);
    }
  }

  if (useIdPrefix) {
    const prefixCount = new Map<string, number>();
    const prefixOf = new Map<string, string>();
    for (const row of rows) {
      if (parentOf.has(row.id)) continue;
      const prefix = idPrefix(row.id);
      if (!prefix) continue;
      prefixOf.set(row.id, prefix);
      prefixCount.set(prefix, (prefixCount.get(prefix) ?? 0) + 1);
    }
    for (const [id, prefix] of prefixOf) {
      if ((prefixCount.get(prefix) ?? 0) < 2) continue;
      const key = `pfx:${prefix}`;
      groups.set(key, prefix);
      setParent(parentOf, id, key);
    }
  }

  const lines = ['flowchart TD', `  ${nid(rootId)}["${mermaidSafeLabel(rootLabel)}"]`];
  const drawn = new Set<string>([rootId]);
  const draw = (id: string, label: string) => {
    if (drawn.has(id)) return;
    drawn.add(id);
    lines.push(`  ${nid(id)}["${mermaidSafeLabel(label)}"]`);
  };
  for (const [id, label] of [...groups.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    draw(id, label);
    lines.push(`  ${nid(rootId)} --> ${nid(id)}`);
  }
  for (const row of [...rows].sort((a, b) => a.label.localeCompare(b.label))) {
    draw(row.id, row.label);
    const parent = parentOf.get(row.id) ?? rootId;
    lines.push(`  ${nid(parent)} --> ${nid(row.id)}`);
  }
  for (const row of rows) {
    const entries = objects(row.raw.entrypoints).slice(0, 4);
    entries.forEach((entry, index) => {
      const label = fieldString(entry, ['label', 'name', 'symbol', 'file']) || `entry ${index + 1}`;
      const id = `entry:${row.id}:${index}`;
      lines.push(`  ${nid(id)}["${mermaidSafeLabel(label)}"]`);
      lines.push(`  ${nid(row.id)} --> ${nid(id)}`);
    });
  }
  return lines.join('\n');
}

/** Code-structure feature tree: APP → module/area → feature → sub-feature. */
export function featureCatalogMermaidFromJson(catalog: Record<string, unknown> | undefined): string | undefined {
  return nestedCatalogMermaidFromJson(catalog);
}

/** Screen-structure feature tree: UI → tab/flow → screen → sheet. */
export function screenCatalogMermaidFromJson(catalog: Record<string, unknown> | undefined): string | undefined {
  return nestedCatalogMermaidFromJson(catalog, {
    listKeys: ['screens', 'features'],
    rootId: 'UI',
    rootLabel: 'UI',
    groupKeys: ['flow', 'tab', 'area', 'nav', 'section'],
    useIdPrefix: false,
    nodePrefix: 'screen',
  });
}

const PENDING_ARCHITECTURE = 'flowchart TD\n  pending["Project architecture not generated yet"]\n';
const PENDING_CATALOG = 'flowchart TD\n  app["APP"]\n  app --> pending["Feature catalog not generated yet"]\n';
const PENDING_SCREENS = 'flowchart TD\n  ui["UI"]\n  ui --> pending["Screen catalog not generated yet"]\n';

function writeNew(abs: string, body: string): boolean {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const next = body.endsWith('\n') ? body : `${body}\n`;
  if (fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === next) return false;
  fs.writeFileSync(abs, next, 'utf8');
  return true;
}

/**
 * Make sure canonical briefing files exist at their pipeline paths.
 * Never invent a second location: JSON and mermaid live under
 * docs/project/context/visualization/. If the sibling .mmd is missing (or still
 * a placeholder), derive it from that folder's JSON and write it there. If the
 * JSON is also missing, create the .mmd anyway so the path exists.
 */
export function ensureProjectBriefingFiles(workspaceRoot: string): string[] {
  const created: string[] = [];
  const abs = (rel: string) => path.join(workspaceRoot, rel);

  const architectureJson = readJson(abs(PROJECT_BRIEFING_PATHS.architectureJson));
  const catalogJson = readJson(abs(PROJECT_BRIEFING_PATHS.catalogJson));
  const screensJson = readJson(abs(PROJECT_BRIEFING_PATHS.screensJson));

  const architectureMmd = abs(PROJECT_BRIEFING_PATHS.architectureMmd);
  if (needsMermaidFile(architectureMmd)) {
    const mermaid = architectureOverviewMermaidFromJson(architectureJson) || PENDING_ARCHITECTURE;
    if (writeNew(architectureMmd, mermaid)) created.push(PROJECT_BRIEFING_PATHS.architectureMmd);
  }

  const catalogMmd = abs(PROJECT_BRIEFING_PATHS.catalogMmd);
  if (catalogJson) {
    const mermaid = featureCatalogMermaidFromJson(catalogJson);
    if (mermaid && writeNew(catalogMmd, mermaid)) created.push(PROJECT_BRIEFING_PATHS.catalogMmd);
  } else if (needsMermaidFile(catalogMmd)) {
    if (writeNew(catalogMmd, PENDING_CATALOG)) created.push(PROJECT_BRIEFING_PATHS.catalogMmd);
  }

  const screensMmd = abs(PROJECT_BRIEFING_PATHS.screensMmd);
  if (screensJson) {
    const mermaid = screenCatalogMermaidFromJson(screensJson);
    if (mermaid && writeNew(screensMmd, mermaid)) created.push(PROJECT_BRIEFING_PATHS.screensMmd);
  } else if (needsMermaidFile(screensMmd)) {
    if (writeNew(screensMmd, PENDING_SCREENS)) created.push(PROJECT_BRIEFING_PATHS.screensMmd);
  }

  const reviewPath = abs(PROJECT_BRIEFING_PATHS.review);
  let review = readText(reviewPath);
  if (!review.trim()) {
    const fallback = markdownSection(readText(abs(PROJECT_BRIEFING_PATHS.projectContext)), 'Overview')
      || markdownSection(readText(abs(PROJECT_BRIEFING_PATHS.projectContext)), 'Summary')
      || '_Project baseline review has not been written yet._';
    const body = [
      '# Context Review',
      '',
      '## Summary',
      '',
      fallback,
      '',
      '**Verdict:** NO-GO',
      '',
    ].join('\n');
    if (writeNew(reviewPath, body)) created.push(PROJECT_BRIEFING_PATHS.review);
  } else if (!/^##\s+Summary\s*$/im.test(review)) {
    const fallback = markdownSection(readText(abs(PROJECT_BRIEFING_PATHS.projectContext)), 'Overview')
      || markdownSection(readText(abs(PROJECT_BRIEFING_PATHS.projectContext)), 'Summary')
      || '_Add a 1-2 paragraph summary of what this repository is._';
    const inserted = `## Summary\n\n${fallback}\n\n${review.replace(/^\uFEFF/, '')}`;
    if (writeNew(reviewPath, inserted)) created.push(PROJECT_BRIEFING_PATHS.review);
  }

  return created;
}

/** Ensure canonical files exist, then read only those paths. */
export function readProjectContextBriefing(workspaceRoot: string): ProjectContextBriefing {
  const created = ensureProjectBriefingFiles(workspaceRoot);
  const abs = (rel: string) => path.join(workspaceRoot, rel);
  const review = readText(abs(PROJECT_BRIEFING_PATHS.review));
  const flow = readText(abs(PROJECT_BRIEFING_PATHS.architectureMmd)).trim();
  const impact = readText(abs(PROJECT_BRIEFING_PATHS.catalogMmd)).trim();
  const screens = readText(abs(PROJECT_BRIEFING_PATHS.screensMmd)).trim();
  return {
    summary: markdownSection(review, 'Summary') || undefined,
    flowMermaid: isMermaid(flow) ? flow : undefined,
    impactMermaid: isMermaid(impact) ? impact : undefined,
    screensMermaid: isMermaid(screens) ? screens : undefined,
    created,
  };
}

export function isProjectContextPipeline(pipeline: string | null | undefined): boolean {
  return !!pipeline && (pipeline === 'project-context' || pipeline.startsWith('project-context'));
}
