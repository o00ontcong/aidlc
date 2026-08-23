import * as fs from 'fs';
import * as path from 'path';

import {
  architectureGraphFromJson,
  catalogFeaturesFromJson,
  catalogScreensFromJson,
} from '@aidlc/core';

export const ARCHITECTURE_STUDIO_RELATIVE_PATH = path.join(
  'docs',
  'project',
  'architecture',
  'ARCHITECTURE-STUDIO.json',
);

export function architectureStudioArtifactPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ARCHITECTURE_STUDIO_RELATIVE_PATH);
}

export interface ArchitectureStudioNodeUi {
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

export interface ArchitectureStudioEdgeUi {
  id?: string;
  source: string;
  target: string;
  label?: string;
  protocol?: string;
  role?: string;
  confidence?: string;
  evidence?: string[];
}

export interface ArchitectureStudioFeatureUi {
  id: string;
  name: string;
  kind?: string;
  summary?: string;
  confidence?: string;
  evidence?: string[];
  parent?: string;
  area?: string;
  module?: string;
  children?: string[];
  entrypoints?: Array<{ label: string; file: string; symbol?: string }>;
  layers?: string[];
}

export interface ArchitectureStudioFeatureFlowUi {
  featureId: string;
  title?: string;
  nodes: ArchitectureStudioNodeUi[];
  edges: ArchitectureStudioEdgeUi[];
}

export interface ArchitectureStudioStateUi {
  available: boolean;
  message?: string;
  revision?: string;
  generatedAt?: string;
  freshness: 'fresh' | 'stale' | 'unknown';
  sourcePaths: string[];
  warnings: string[];
  nodes: ArchitectureStudioNodeUi[];
  edges: ArchitectureStudioEdgeUi[];
  features: ArchitectureStudioFeatureUi[];
  screens: ArchitectureStudioFeatureUi[];
  screenEdges: ArchitectureStudioEdgeUi[];
  structuralNodes: ArchitectureStudioNodeUi[];
  structuralEdges: ArchitectureStudioEdgeUi[];
  featureFlows: Record<string, ArchitectureStudioFeatureFlowUi>;
}

interface ReadJsonResult {
  value?: Record<string, unknown>;
  warning?: string;
  modifiedAt?: string;
}

function readJsonObject(file: string, root: string): ReadJsonResult {
  if (!fs.existsSync(file)) return { warning: `Missing ${path.relative(root, file)}` };
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { warning: `Invalid JSON object in ${path.relative(root, file)}` };
    }
    return {
      value: value as Record<string, unknown>,
      modifiedAt: fs.statSync(file).mtime.toISOString(),
    };
  } catch {
    return { warning: `Could not read ${path.relative(root, file)}` };
  }
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return undefined;
}

function screenEdgesFromJson(catalog: Record<string, unknown> | undefined): ArchitectureStudioEdgeUi[] {
  if (!catalog) return [];
  const rawScreens = objects(catalog.screens).length ? objects(catalog.screens) : objects(catalog.features);
  const screenIds = new Set(rawScreens.map((screen) => stringValue(screen, ['id', 'name', 'label'])).filter((id): id is string => Boolean(id)));
  const edges: ArchitectureStudioEdgeUi[] = [];
  const seen = new Set<string>();
  const add = (source: string | undefined, target: string | undefined, label?: string, role?: string) => {
    if (!source || !target || !screenIds.has(source) || !screenIds.has(target) || source === target) return;
    const key = `${source}\u0000${target}\u0000${label ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: `screen:${edges.length + 1}`, source, target, ...(label ? { label } : {}), ...(role ? { role } : {}) });
  };

  for (const transition of objects(catalog.transitions)) {
    add(
      stringValue(transition, ['source', 'from']),
      stringValue(transition, ['target', 'to']),
      stringValue(transition, ['trigger', 'label', 'action', 'condition']),
      stringValue(transition, ['kind', 'type']),
    );
  }
  for (const screen of rawScreens) {
    const id = stringValue(screen, ['id', 'name', 'label']);
    add(stringValue(screen, ['parent', 'parentId', 'parent_id']), id, stringValue(screen, ['kind', 'type']), 'parent');
  }
  return edges;
}

export function emptyArchitectureStudio(message: string, warnings: string[] = []): ArchitectureStudioStateUi {
  return {
    available: false,
    message,
    freshness: 'unknown',
    sourcePaths: [],
    warnings,
    nodes: [],
    edges: [],
    features: [],
    screens: [],
    screenEdges: [],
    structuralNodes: [],
    structuralEdges: [],
    featureFlows: {},
  };
}

/** Build the standalone, agent-generated contract sent to Architecture Studio. */
export function readArchitectureStudio(workspaceRoot: string): ArchitectureStudioStateUi {
  const artifactFile = architectureStudioArtifactPath(workspaceRoot);
  const artifact = readJsonObject(artifactFile, workspaceRoot);
  if (!artifact.value) {
    return emptyArchitectureStudio(
      `No standalone architecture artifact exists at ${ARCHITECTURE_STUDIO_RELATIVE_PATH}. Run the Architecture Agent to generate it.`,
      artifact.warning?.startsWith('Invalid ') || artifact.warning?.startsWith('Could not ')
        ? [artifact.warning]
        : [],
    );
  }

  const system = objectValue(artifact.value.system);
  const layers = objectValue(artifact.value.layers);
  const projectGraph = architectureGraphFromJson(system);
  const structuralGraph = architectureGraphFromJson(layers);
  const primaryGraph = projectGraph.nodes.length >= 2 ? projectGraph : structuralGraph;
  const features = catalogFeaturesFromJson({ features: artifact.value.features }) as ArchitectureStudioFeatureUi[];
  const screens = catalogScreensFromJson({ screens: artifact.value.screens }) as ArchitectureStudioFeatureUi[];
  const warnings: string[] = [];
  if (artifact.value.schemaVersion !== 1) warnings.push('Unsupported or missing Architecture Studio schemaVersion; expected 1.');
  if (projectGraph.nodes.length < 2) warnings.push('The generated system map has fewer than two nodes.');
  if (primaryGraph.nodes.length < 2 && !features.length && !screens.length) {
    return emptyArchitectureStudio(
      `The standalone artifact at ${ARCHITECTURE_STUDIO_RELATIVE_PATH} does not contain a usable diagram. Run the Architecture Agent again.`,
      warnings,
    );
  }

  const featureFlows: Record<string, ArchitectureStudioFeatureFlowUi> = {};
  for (const flow of objects(artifact.value.flows)) {
    const featureId = stringValue(flow, ['featureId', 'id']);
    if (!featureId) continue;
    const graph = architectureGraphFromJson(flow);
    if (graph.nodes.length < 2) continue;
    featureFlows[featureId] = {
        featureId,
        ...(typeof flow.title === 'string' && flow.title.trim() ? { title: flow.title.trim() } : {}),
        nodes: graph.nodes,
        edges: graph.edges,
    };
  }

  const revisionRaw = artifact.value.revision ?? artifact.value.generatedAt;
  const revision = typeof revisionRaw === 'string' || typeof revisionRaw === 'number' ? String(revisionRaw) : undefined;
  const generatedAt = typeof artifact.value.generatedAt === 'string' && artifact.value.generatedAt.trim()
    ? artifact.value.generatedAt.trim()
    : artifact.modifiedAt;
  return {
    available: true,
    ...(revision ? { revision } : {}),
    ...(generatedAt ? { generatedAt } : {}),
    freshness: warnings.length ? 'stale' : 'fresh',
    sourcePaths: [path.relative(workspaceRoot, artifactFile)],
    warnings,
    nodes: primaryGraph.nodes,
    edges: primaryGraph.edges,
    features,
    screens,
    screenEdges: screenEdgesFromJson({ screens: artifact.value.screens, transitions: artifact.value.screenEdges }),
    structuralNodes: structuralGraph.nodes,
    structuralEdges: structuralGraph.edges,
    featureFlows,
  };
}
