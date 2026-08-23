/**
 * Pure readers that turn checked-in architecture / feature / screen JSON into
 * graph structures and Mermaid diagrams for the Architecture explorer.
 *
 * No pipeline coupling: everything here takes a parsed JSON document and
 * returns UI-ready data, so any producer of those files works.
 */
export function mermaidSafeId(value: string): string {
  return `n_${value.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

export function mermaidSafeLabel(value: string): string {
  return value.replace(/[\\"\[\]{}|<>]/g, '').replace(/[\r\n]+/g, ' ').trim();
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

function firstParagraph(text: string): string {
  const clean = text.trim();
  if (!clean) return '';
  const [first] = clean.split(/\n\s*\n/g);
  return first?.trim() ?? '';
}

function codingAgentBriefBody(projectContext: string, review: string): string {
  const reviewSummary = markdownSection(review, 'Summary');
  const projectOverview = markdownSection(projectContext, 'Overview')
    || markdownSection(projectContext, 'Summary');
  const keyPoint = firstParagraph(reviewSummary || projectOverview)
    || '_Chưa có tóm tắt ngữ cảnh dự án._';
  const engineeringRules = markdownSection(projectContext, 'Engineering Rules');
  const sharedContracts = markdownSection(projectContext, 'Shared Contracts');
  const domainModel = markdownSection(projectContext, 'Domain Model');
  const navigationCoverage = markdownSection(projectContext, 'Navigation coverage');
  const graphCoverage = markdownSection(review, 'Graph coverage');

  const sections: string[] = [
    '# Coding Agent Brief',
    '',
    '## Project key point',
    '',
    keyPoint,
    '',
    '## Pointers',
    '',
    '- `docs/project/context/PROJECT-CONTEXT.md`',
    '- `docs/project/context/ARCHITECTURE-MAP.md`',
    '- `docs/project/context/visualization/PROJECT-ARCHITECTURE.mmd`',
    '- `docs/project/context/visualization/FEATURE-CATALOG.mmd`',
    '- `docs/project/context/visualization/SCREEN-CATALOG.mmd`',
    '',
  ];

  const pushSection = (heading: string, content: string) => {
    if (!content.trim()) return;
    sections.push(`## ${heading}`, '', content.trim(), '');
  };
  pushSection('Engineering rules (for implementation)', engineeringRules);
  pushSection('Shared contracts (for integration)', sharedContracts);
  pushSection('Domain model (for behavior)', domainModel);
  pushSection('Navigation coverage (for UI work)', navigationCoverage);
  pushSection('Graph coverage receipt', graphCoverage);

  return sections.join('\n').trimEnd() + '\n';
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
  layer?: string;
  file?: string;
  symbol?: string;
  role?: string;
  summary?: string;
  confidence?: string;
  evidence?: string[];
}

export interface ArchitectureGraphEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  protocol?: string;
  role?: string;
  confidence?: string;
  evidence?: string[];
}

function scalarText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function firstScalar(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = scalarText(raw[key]);
    if (value) return value;
  }
  return '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = scalarText(item);
    return text ? [text] : [];
  });
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
    const kind = firstScalar(raw, ['kind', 'type']) || undefined;
    const layer = firstScalar(raw, ['layer', 'tier', 'zone']) || undefined;
    const file = firstScalar(raw, ['file', 'path', 'filePath']) || undefined;
    const symbol = firstScalar(raw, ['symbol', 'symbolName']) || undefined;
    const role = firstScalar(raw, ['role', 'category']) || undefined;
    const summary = firstScalar(raw, ['summary', 'responsibility', 'description', 'notes']) || undefined;
    const confidence = firstScalar(raw, ['confidence']) || undefined;
    const evidence = stringList(raw.evidence);
    nodes.push({
      ...node,
      ...(kind ? { kind } : {}),
      ...(layer ? { layer } : {}),
      ...(file ? { file } : {}),
      ...(symbol ? { symbol } : {}),
      ...(role ? { role } : {}),
      ...(summary ? { summary } : {}),
      ...(confidence ? { confidence } : {}),
      ...(evidence.length ? { evidence } : {}),
    });
  }
  const edges: ArchitectureGraphEdge[] = [];
  for (const raw of objects(doc.edges)) {
    const edge = edgeEndpoints(raw);
    if (!edge) continue;
    const id = firstScalar(raw, ['id']) || undefined;
    const label = firstScalar(raw, ['label', 'name', 'trigger', 'action']) || undefined;
    const protocol = firstScalar(raw, ['protocol', 'transport']) || undefined;
    const role = firstScalar(raw, ['role', 'kind', 'type']) || undefined;
    const confidence = firstScalar(raw, ['confidence']) || undefined;
    const evidence = stringList(raw.evidence);
    edges.push({
      ...edge,
      ...(id ? { id } : {}),
      ...(label ? { label } : {}),
      ...(protocol ? { protocol } : {}),
      ...(role ? { role } : {}),
      ...(confidence ? { confidence } : {}),
      ...(evidence.length ? { evidence } : {}),
    });
  }
  return { nodes, edges };
}

export interface CatalogFeatureNode {
  id: string;
  name: string;
  kind?: string;
  parent?: string;
  area?: string;
  module?: string;
  children?: string[];
  summary?: string;
  confidence?: string;
  evidence?: string[];
  entrypoints?: Array<{ label: string; file: string; symbol?: string }>;
  layers?: string[];
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
    const kind = fieldString(raw, ['kind', 'type']) || undefined;
    const confidence = firstScalar(raw, ['confidence']) || undefined;
    const evidence = stringList(raw.evidence);
    const layers = stringList(raw.layers);
    const entrypoints = objects(raw.entrypoints).flatMap((entry) => {
      const label = fieldString(entry, ['label', 'name', 'symbol', 'file']);
      const file = fieldString(entry, ['file', 'path', 'filePath']);
      const symbol = fieldString(entry, ['symbol', 'symbolName']) || undefined;
      return label && file ? [{ label, file, ...(symbol ? { symbol } : {}) }] : [];
    });
    rows.push({
      id: node.id,
      name,
      ...(kind ? { kind } : {}),
      ...(parent ? { parent } : {}),
      ...(area ? { area } : {}),
      ...(moduleName ? { module: moduleName } : {}),
      ...(children.length ? { children } : {}),
      ...(summary ? { summary } : {}),
      ...(confidence ? { confidence } : {}),
      ...(evidence.length ? { evidence } : {}),
      ...(entrypoints.length ? { entrypoints } : {}),
      ...(layers.length ? { layers } : {}),
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

export interface ScreenCatalogAreaDiagram {
  id: string;
  name: string;
  count: number;
  mermaid: string;
}

function isGroupScreen(raw: Record<string, unknown>): boolean {
  const id = fieldString(raw, ['id']);
  return id.startsWith('tab:') || id.startsWith('flow:');
}

function screenGroup(raw: Record<string, unknown>): string {
  return fieldString(raw, ['tab', 'flow', 'area', 'nav', 'section']);
}

function catalogScreenRows(catalog: Record<string, unknown> | undefined): Array<{
  id: string; label: string; group: string; raw: Record<string, unknown>;
}> {
  const screens = objects(catalog?.screens).length ? objects(catalog?.screens) : objects(catalog?.features);
  const rows: Array<{ id: string; label: string; group: string; raw: Record<string, unknown> }> = [];
  const seen = new Set<string>();
  for (const screen of screens) {
    const node = nodeIdentity(screen);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    rows.push({
      id: node.id,
      label: fieldString(screen, ['name']) || node.label,
      group: screenGroup(screen),
      raw: screen,
    });
  }
  return rows;
}

/** Screen-structure: small catalogs stay a flow graph; multi-area catalogs use a hub map. */
export function screenCatalogMermaidFromJson(catalog: Record<string, unknown> | undefined): string | undefined {
  if (!catalog) return undefined;
  const rows = catalogScreenRows(catalog);
  const transitions = objects(catalog.transitions);
  if (rows.length && transitions.length) {
    const groups = new Set(rows.filter((row) => !isGroupScreen(row.raw) && row.group).map((row) => row.group));
    if (groups.size >= 2) return screenCatalogOverviewMermaidFromJson(catalog);
    const discovery = catalog.discovery && typeof catalog.discovery === 'object' && !Array.isArray(catalog.discovery)
      ? catalog.discovery as Record<string, unknown>
      : undefined;
    return screenTransitionMermaidFromJson(rows.map((row) => row.raw), transitions, catalog.roots, discovery?.entryPoints);
  }
  return nestedCatalogMermaidFromJson(catalog, {
    listKeys: ['screens', 'features'],
    rootId: 'UI',
    rootLabel: 'UI',
    groupKeys: ['flow', 'tab', 'area', 'nav', 'section'],
    useEvidenceDirs: false,
    useIdPrefix: false,
    nodePrefix: 'screen',
  });
}

/**
 * Grouped navigation diagram: each distinct tab/flow/area/nav/section value becomes a
 * Mermaid subgraph; ungrouped screens are placed in an "Other" subgraph. Every screen
 * gets its own node and every real transition becomes its own labeled edge — no count
 * buckets, no data loss.
 */
export function screenCatalogOverviewMermaidFromJson(catalog: Record<string, unknown> | undefined): string | undefined {
  const rows = catalogScreenRows(catalog);
  if (!rows.length) return undefined;
  const realRows = rows.filter((row) => !isGroupScreen(row.raw));
  if (!realRows.length) return undefined;

  const nid = (id: string) => mermaidNodeId(id, 'screen');
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Build group → rows map; ungrouped screens go into a virtual "" group (rendered last, top-level)
  const groupMap = new Map<string, typeof realRows>();
  for (const row of realRows) {
    const g = row.group || '';
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(row);
  }

  const lines = ['flowchart LR', '  ui["UI"]'];

  // Named groups → subgraphs
  const namedGroups = [...groupMap.keys()].filter((g) => g).sort((a, b) => a.localeCompare(b));
  const ungrouped = groupMap.get('') ?? [];

  for (const group of namedGroups) {
    const subId = mermaidSafeId(`sg_${group}`);
    lines.push(`  subgraph ${subId}["${mermaidSafeLabel(group)}"]`);
    for (const row of groupMap.get(group)!) {
      lines.push(`    ${nid(row.id)}["${mermaidSafeLabel(row.label)}"]`);
    }
    lines.push('  end');
    lines.push(`  ui --> ${subId}`);
  }

  // Ungrouped screens sit top-level (no subgraph wrapping)
  for (const row of ungrouped) {
    lines.push(`  ${nid(row.id)}["${mermaidSafeLabel(row.label)}"]`);
    lines.push(`  ui --> ${nid(row.id)}`);
  }

  // Real transitions — every edge with real source and target
  const seen = new Set<string>();
  const addTransitionEdge = (source: string, target: string, label: string) => {
    if (!byId.has(source) || !byId.has(target)) return;
    if (isGroupScreen(byId.get(source)!.raw) || isGroupScreen(byId.get(target)!.raw)) return;
    const key = `${source}-->${target}-->${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    const arrow = label && !WEAK_EDGE.has(label) ? `-->|"${mermaidEdgeLabel(label)}"|` : '-->';
    lines.push(`  ${nid(source)} ${arrow} ${nid(target)}`);
  };

  for (const raw of objects(catalog?.transitions)) {
    const edge = transitionEndpoints(raw);
    if (!edge) continue;
    addTransitionEdge(edge.source, edge.target, transitionEdgeLabel(edge));
  }

  return lines.join('\n');
}

/** One mermaid per tab/flow so the explorer can show a readable slice. */
export function screenCatalogAreaMermaidsFromJson(catalog: Record<string, unknown> | undefined): ScreenCatalogAreaDiagram[] {
  const rows = catalogScreenRows(catalog);
  const transitions = objects(catalog?.transitions);
  if (!rows.length) return [];
  const groups = new Map<string, number>();
  for (const row of rows) {
    if (isGroupScreen(row.raw) || !row.group) continue;
    groups.set(row.group, (groups.get(row.group) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      id: name,
      name,
      count,
      mermaid: screenAreaMermaidFromJson(rows, transitions, name),
    }))
    .filter((area) => area.mermaid.split('\n').length > 2);
}

function mermaidEdgeLabel(value: string): string {
  return value.replace(/[\\"|]/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 48);
}

function transitionEndpoints(raw: Record<string, unknown>): { source: string; target: string; trigger?: string; kind?: string; condition?: string } | undefined {
  const source = fieldString(raw, ['source', 'from']);
  const target = fieldString(raw, ['target', 'to']);
  if (!source || !target) return undefined;
  const trigger = fieldString(raw, ['trigger', 'label', 'action']) || undefined;
  const kind = fieldString(raw, ['kind', 'type']) || undefined;
  const condition = fieldString(raw, ['condition', 'when', 'guard']) || undefined;
  return { source, target, trigger, kind, condition };
}

function transitionEdgeLabel(edge: { trigger?: string; kind?: string; condition?: string }): string {
  return edge.trigger || edge.condition || (edge.kind && edge.kind !== 'push' ? edge.kind : '');
}

const WEAK_EDGE = new Set(['present', 'sheet', 'modal', 'parent', 'root']);

function screenAreaMermaidFromJson(
  rows: Array<{ id: string; label: string; group: string; raw: Record<string, unknown> }>,
  transitions: Record<string, unknown>[],
  area: string,
): string {
  const inAreaRows = rows.filter((row) => !isGroupScreen(row.raw) && row.group === area);
  const inArea = new Set(inAreaRows.map((row) => row.id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const needed = new Set(inArea);
  const edges: Array<{ source: string; target: string; label: string }> = [];
  const pair = new Set<string>();
  const add = (source: string, target: string, label: string) => {
    if (!inArea.has(source) && !inArea.has(target)) return;
    if (isGroupScreen(byId.get(source)?.raw ?? {}) || isGroupScreen(byId.get(target)?.raw ?? {})) return;
    const pairKey = `${source}-->${target}`;
    const key = `${pairKey}-->${label}`;
    if (pair.has(key)) return;
    if (!label && [...pair].some((item) => item.startsWith(`${pairKey}-->`))) return;
    pair.add(key);
    needed.add(source);
    needed.add(target);
    edges.push({ source, target, label });
  };
  for (const raw of transitions) {
    const edge = transitionEndpoints(raw);
    if (!edge) continue;
    add(edge.source, edge.target, transitionEdgeLabel(edge));
  }
  for (const row of inAreaRows) {
    const parent = fieldString(row.raw, ['parent', 'parentId', 'parent_id']);
    if (!parent || !inArea.has(parent)) continue;
    if ([...pair].some((item) => item.startsWith(`${parent}-->${row.id}-->`))) continue;
    const kind = fieldString(row.raw, ['kind']);
    add(parent, row.id, kind === 'sheet' || kind === 'modal' ? kind : '');
  }
  const hub = inAreaRows.find((row) => row.id === area.toLowerCase())
    ?? inAreaRows.find((row) => !fieldString(row.raw, ['parent', 'parentId', 'parent_id']) || !inArea.has(fieldString(row.raw, ['parent', 'parentId', 'parent_id'])))
    ?? inAreaRows[0];
  if (hub) {
    const incoming = new Set(edges.map((edge) => edge.target));
    for (const row of inAreaRows) {
      if (row.id === hub.id || incoming.has(row.id)) continue;
      add(hub.id, row.id, '');
    }
  }
  const nid = (id: string) => mermaidNodeId(id, 'screen');
  const lines = ['flowchart LR'];
  for (const id of [...needed].sort()) {
    const row = byId.get(id);
    if (!row) continue;
    lines.push(`  ${nid(id)}["${mermaidSafeLabel(row.label)}"]`);
  }
  const strongPairs = new Set(
    edges.filter((edge) => edge.label && !WEAK_EDGE.has(edge.label)).map((edge) => `${edge.source}-->${edge.target}`),
  );
  for (const edge of edges) {
    if (WEAK_EDGE.has(edge.label) && strongPairs.has(`${edge.source}-->${edge.target}`)) continue;
    const labeled = edge.label && !WEAK_EDGE.has(edge.label);
    const arrow = labeled ? `-->|"${mermaidEdgeLabel(edge.label)}"|` : '-->';
    lines.push(`  ${nid(edge.source)} ${arrow} ${nid(edge.target)}`);
  }
  return lines.join('\n');
}

/**
 * Navigation-flow diagram: screens as nodes, transitions as labeled edges.
 * Skips tab/flow containers and duplicate present edges.
 */
export function screenTransitionMermaidFromJson(
  screens: Record<string, unknown>[],
  transitions: Record<string, unknown>[],
  rootsRaw: unknown,
  entryPointsRaw?: unknown,
): string | undefined {
  const rows: Array<{ id: string; label: string; raw: Record<string, unknown> }> = [];
  const seen = new Set<string>();
  for (const screen of screens) {
    const node = nodeIdentity(screen);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    rows.push({ id: node.id, label: fieldString(screen, ['name']) || node.label, raw: screen });
  }
  if (!rows.length) return undefined;

  const nid = (id: string) => mermaidNodeId(id, 'screen');
  const lines = ['flowchart LR'];
  const drawn = new Set<string>();
  const draw = (id: string, label: string) => {
    if (drawn.has(id) || (id !== 'UI' && isGroupScreen(rows.find((row) => row.id === id)?.raw ?? {}))) return;
    drawn.add(id);
    lines.push(`  ${nid(id)}["${mermaidSafeLabel(label)}"]`);
  };

  for (const row of rows) {
    if (!isGroupScreen(row.raw)) draw(row.id, row.label);
  }

  const incoming = new Set<string>();
  const pairs = new Set<string>();
  const addEdge = (source: string, target: string, label: string) => {
    if (source !== 'UI' && !seen.has(source)) return;
    if (!seen.has(target)) return;
    if (source !== 'UI' && isGroupScreen(rows.find((row) => row.id === source)?.raw ?? {})) return;
    if (isGroupScreen(rows.find((row) => row.id === target)?.raw ?? {})) return;
    const key = `${source}-->${target}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    incoming.add(target);
    draw(source, source === 'UI' ? 'UI' : (rows.find((row) => row.id === source)?.label || source));
    draw(target, rows.find((row) => row.id === target)?.label || target);
    const arrow = label && !WEAK_EDGE.has(label) ? `-->|"${mermaidEdgeLabel(label)}"|` : '-->';
    lines.push(`  ${nid(source)} ${arrow} ${nid(target)}`);
  };

  for (const raw of transitions) {
    const edge = transitionEndpoints(raw);
    if (!edge) continue;
    addEdge(edge.source, edge.target, transitionEdgeLabel(edge));
  }

  for (const row of rows) {
    if (isGroupScreen(row.raw)) continue;
    const parent = fieldString(row.raw, ['parent', 'parentId', 'parent_id']);
    if (!parent || !seen.has(parent)) continue;
    if (isGroupScreen(rows.find((item) => item.id === parent)?.raw ?? {})) continue;
    if (pairs.has(`${parent}-->${row.id}`)) continue;
    const kind = fieldString(row.raw, ['kind']);
    addEdge(parent, row.id, kind === 'sheet' || kind === 'modal' ? kind : '');
  }

  const declaredRoots = Array.isArray(rootsRaw)
    ? rootsRaw.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : [];
  const roots = declaredRoots.length
    ? declaredRoots.filter((id) => seen.has(id) && !isGroupScreen(rows.find((row) => row.id === id)?.raw ?? {}))
    : rows
      .filter((row) => !isGroupScreen(row.raw) && !incoming.has(row.id))
      .map((row) => row.id);

  const entryPoints = objects(entryPointsRaw).filter((raw) => {
    const target = fieldString(raw, ['target']);
    return target && seen.has(target) && !isGroupScreen(rows.find((row) => row.id === target)?.raw ?? {});
  });
  if (declaredRoots.length || entryPoints.length) {
    draw('UI', 'UI');
    for (const root of declaredRoots.length ? roots : []) addEdge('UI', root, '');
    for (const raw of entryPoints) {
      addEdge('UI', fieldString(raw, ['target']), fieldString(raw, ['kind', 'type']) || '');
    }
  }

  return lines.length > 1 ? lines.join('\n') : undefined;
}
