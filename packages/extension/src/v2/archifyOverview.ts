import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const ARCHIFY_OVERVIEW_SPEC = 'ARCHIFY-OVERVIEW.json';
export const ARCHIFY_OVERVIEW_HTML = 'ARCHIFY-OVERVIEW.html';

export interface ArchitectureLayerInput {
  id: string;
  label: string;
  kind?: string;
  layer?: string;
  role?: string;
}

export interface ArchitectureEdgeInput {
  source: string;
  target: string;
  label?: string;
}

type ArchifyComponentType = 'frontend' | 'backend' | 'database' | 'cloud' | 'security' | 'messagebus' | 'external';

export interface ArchifyOverviewSpec {
  schema_version: 1;
  diagram_type: 'architecture';
  meta: {
    title: string;
    subtitle: string;
    quality_profile: 'standard';
    visual_preset: 'blueprint';
  };
  layout: {
    mode: 'grid';
    origin: [number, number];
    cols: number;
    gapX: number;
    gapY: number;
    cellW: number;
    cellH: number;
  };
  components: Array<{
    id: string;
    type: ArchifyComponentType;
    label: string;
    size: [number, number];
    row: number;
    col: number;
  }>;
  connections: Array<{
    id: string;
    from: string;
    to: string;
    label?: string;
  }>;
  cards: Array<{ dot: 'cyan' | 'emerald' | 'violet'; title: string; items: string[] }>;
}

export interface ArchifyRenderResult {
  ok: boolean;
  specPath: string;
  htmlPath: string;
  message?: string;
}

/**
 * Turn Archify's standalone HTML into a passive SVG image for the VS Code
 * webview. A nested HTML frame inherits the host CSP and Archify's inline
 * bootstrap scripts are consequently blocked; an SVG image needs no script
 * and keeps the renderer's authored geometry and theme styles intact.
 */
export function buildArchifySvgPreview(html: string): string | undefined {
  const style = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i)?.[1];
  const svg = html.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0];
  if (!style || !svg) return undefined;

  const safeStyle = style.replace(/]]>/g, ']]]]><![CDATA[>');
  // Archify emits HTML-valid boolean data attributes (for example
  // `data-legend`). image/svg+xml is parsed as XML, where those attributes
  // need explicit values.
  const xmlSvg = svg.replace(/<[^>]+>/g, (tag) => tag.replace(/\s(data-[\w-]+)(?=\s|\/?>)/g, ' $1=""'));
  return xmlSvg.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const namespace = /\bxmlns=/.test(attributes) ? '' : ' xmlns="http://www.w3.org/2000/svg"';
    return `<svg${attributes}${namespace}><style type="text/css"><![CDATA[${safeStyle}]]></style>`;
  });
}

// Project Context intentionally publishes a 3–8 layer overview. Keeping that
// same cap and placing it on one primary spine gives Archify an unambiguous,
// verifiable overview rather than a dense, crossing graph.
const MAX_COMPONENTS = 8;
const MAX_CONNECTIONS = 7;

function compact(value: string | undefined, maximum = 72): string | undefined {
  const normalized = value?.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function archifyId(value: string, index: number, used: Set<string>): string {
  const raw = value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  const base = /^[A-Za-z]/.test(raw) ? raw : `layer_${raw || index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function componentType(layer: ArchitectureLayerInput): ArchifyComponentType {
  const value = [layer.kind, layer.layer, layer.role, layer.label].filter(Boolean).join(' ').toLocaleLowerCase();
  if (/(auth|security|identity|permission|access)/.test(value)) return 'security';
  if (/(queue|event|message|stream|broker|kafka)/.test(value)) return 'messagebus';
  if (/(database|storage|persist|cache|data)/.test(value)) return 'database';
  if (/(cloud|infra|platform|hosting|deploy)/.test(value)) return 'cloud';
  if (/(external|third.party|integration|vendor)/.test(value)) return 'external';
  if (/(presentation|frontend|client|screen|webview|ui)/.test(value)) return 'frontend';
  return 'backend';
}

/**
 * Convert AIDLC's curated layer graph into Archify's small, typed architecture
 * IR. It intentionally never reads raw source or adds inferred topology.
 */
export function buildArchifyOverviewSpec(
  workspaceRoot: string,
  layers: readonly ArchitectureLayerInput[],
  edges: readonly ArchitectureEdgeInput[],
): ArchifyOverviewSpec {
  const selectedLayers = layers.slice(0, MAX_COMPONENTS);
  const cols = Math.max(selectedLayers.length, 1);
  const usedIds = new Set<string>();
  const idByLayer = new Map<string, string>();
  const indexByLayer = new Map(selectedLayers.map((layer, index) => [layer.id, index]));
  const components = selectedLayers.map((layer, index) => {
    const id = archifyId(layer.id, index, usedIds);
    idByLayer.set(layer.id, id);
    const displayLabel = compact(layer.label, 36) ?? `Layer ${index + 1}`;
    return {
      id,
      type: componentType(layer),
      label: displayLabel,
      // The Overview is intentionally sparse. Roles often contain whole
      // sentences and make Archify reject a small component box; users can
      // inspect that detail in Technical Overview instead.
      size: [Math.max(180, Math.min(340, displayLabel.length * 9 + 42)), 68] as [number, number],
      row: 0,
      col: index,
    };
  });
  const seenConnections = new Set<string>();
  let connectionCount = 0;
  const connections = edges.flatMap((edge, index) => {
    const from = idByLayer.get(edge.source);
    const to = idByLayer.get(edge.target);
    if (!from || !to || from === to || connectionCount >= MAX_CONNECTIONS) return [];
    // Archify's overview should have one readable primary path. Non-adjacent
    // cross-links remain available in AIDLC's Technical Overview instead of
    // being auto-routed through unrelated component boxes.
    if (Math.abs((indexByLayer.get(edge.source) ?? -99) - (indexByLayer.get(edge.target) ?? 99)) !== 1) return [];
    const key = `${from}:${to}`;
    if (seenConnections.has(key)) return [];
    seenConnections.add(key);
    connectionCount += 1;
    // Edge labels belong in the technical Mermaid view. Keeping the visual
    // overview label-free prevents long relationship prose from overlapping
    // its deliberately compact component spine.
    return [{ id: `connection_${index + 1}`, from, to }];
  });
  const projectName = compact(path.basename(workspaceRoot), 48) ?? 'Project';
  const componentWidth = Math.max(...components.map((component) => component.size[0]));

  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: `${projectName} architecture`,
      subtitle: 'Verified overview from AIDLC project-context artifacts',
      quality_profile: 'standard',
      visual_preset: 'blueprint',
    },
    layout: { mode: 'grid', origin: [40, 80], cols, gapX: 84, gapY: 52, cellW: componentWidth, cellH: 68 },
    components,
    connections,
    cards: [
      { dot: 'cyan', title: 'Layers', items: components.map((component) => component.label) },
      { dot: 'emerald', title: 'Relationships', items: connections.length ? connections.map((connection) => `${connection.from} → ${connection.to}`) : ['No layer relationships were published.'] },
      { dot: 'violet', title: 'Source', items: ['AIDLC project-context visualization artifacts', 'Rendered with Archify validation'] },
    ],
  };
}

export async function renderArchifyOverview({
  workspaceRoot,
  extensionPath,
  layers,
  edges,
}: {
  workspaceRoot: string;
  extensionPath: string;
  layers: readonly ArchitectureLayerInput[];
  edges: readonly ArchitectureEdgeInput[];
}): Promise<ArchifyRenderResult> {
  const visualizationDir = path.join(workspaceRoot, 'docs', 'project', 'context', 'visualization');
  const specPath = path.join(visualizationDir, ARCHIFY_OVERVIEW_SPEC);
  const htmlPath = path.join(visualizationDir, ARCHIFY_OVERVIEW_HTML);
  if (!layers.length) return { ok: false, specPath, htmlPath, message: 'No architecture layers are available to render.' };

  // A packaged VSIX contains the renderer below its extension root. During F5
  // development `vsce` may clean generated vendor files after packaging, so
  // fall back to the repository's tracked vendor source as well.
  const cliCandidates = [
    path.join(extensionPath, 'vendor', 'archify', 'bin', 'archify.mjs'),
    path.resolve(extensionPath, '..', '..', 'vendor', 'archify', 'bin', 'archify.mjs'),
  ];
  const cliPath = cliCandidates.find((candidate) => fs.existsSync(candidate));
  if (!cliPath) {
    return { ok: false, specPath, htmlPath, message: 'The bundled Archify renderer is missing. Rebuild the extension or reinstall the current VSIX.' };
  }

  fs.mkdirSync(visualizationDir, { recursive: true });
  fs.writeFileSync(specPath, `${JSON.stringify(buildArchifyOverviewSpec(workspaceRoot, layers, edges), null, 2)}\n`, 'utf8');
  try {
    await execFileAsync(process.execPath, [cliPath, 'deliver', 'architecture', specPath, htmlPath, '--json', '--quality', 'standard'], {
      cwd: workspaceRoot,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, specPath, htmlPath };
  } catch (error) {
    const detail = error as { stderr?: string; stdout?: string; message?: string };
    const stderr = detail.stderr?.trim();
    const stdout = detail.stdout?.trim();
    let renderedError: string | undefined;
    try { renderedError = JSON.parse(stdout ?? '').error; } catch { /* fall through to process text */ }
    return { ok: false, specPath, htmlPath, message: renderedError || stderr || stdout || detail.message || 'Archify could not render the architecture overview.' };
  }
}
