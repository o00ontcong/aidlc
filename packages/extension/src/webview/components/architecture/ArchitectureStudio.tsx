import * as React from 'react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  ChevronDown,
  CircleDot,
  Crosshair,
  Download,
  FolderTree,
  Layers3,
  Loader2,
  Minus,
  Monitor,
  Network,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

import { onHostMessage, postMessage } from '@/lib/bridge';
import type {
  ArchitectureStudioEdge,
  ArchitectureStudioFeature,
  ArchitectureStudioNode,
  ArchitectureStudioState,
} from '@/lib/types';

type Language = 'en' | 'vi';
type StudioView = 'system' | 'layers' | 'features' | 'screens' | 'flows';
type ComponentRole = 'focal' | 'backend' | 'store' | 'external' | 'input' | 'security' | 'optional';
type LayoutDirection = 'horizontal' | 'vertical';

interface SceneNode {
  id: string;
  label: string;
  tag?: string;
  sublabel?: string;
  kind?: string;
  role: ComponentRole;
  summary?: string;
  file?: string;
  symbol?: string;
  confidence?: string;
  evidence?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  virtual?: boolean;
}

interface SceneEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  protocol?: string;
  role?: string;
  confidence?: string;
  evidence?: string[];
}

interface SceneZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DiagramScene {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
  zones: SceneZone[];
  receipt: string[];
}

interface ViewDefinition {
  id: StudioView;
  icon: typeof Network;
  label: string;
  hint: string;
}

const COPY = {
  en: {
    title: 'Architecture',
    fresh: 'Fresh', stale: 'Needs refresh', unknown: 'Source status unknown',
    system: 'System map', layers: 'Layers', features: 'Features', screens: 'Screens', flows: 'Flows',
    systemHint: 'Components, boundaries, and primary relationships.',
    layersHint: 'The application spine, one layer at a time.',
    featuresHint: 'Code ownership and feature boundaries.',
    screensHint: 'Navigation areas and screen relationships.',
    flowsHint: 'A focused code or surface flow.',
    outline: 'Outline', inspector: 'Inspector', details: 'Details', relationships: 'Relationships', evidence: 'Evidence',
    search: 'Search components, files, and features', filters: 'Filters', export: 'Export', exportSvg: 'SVG snapshot', exportHtml: 'Editorial HTML',
    fit: 'Fit', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset view', hideNavigator: 'Hide navigator', hideInspector: 'Hide inspector',
    showNavigator: 'Show navigator', showInspector: 'Show inspector', refresh: 'Refresh artifact',
    generate: 'Generate with Agent', generating: 'Agent running…', generationStarted: 'Agent is generating the standalone architecture artifact in the provider terminal.', generationComplete: 'Standalone architecture artifact updated.', generationFailed: 'Could not start the Architecture Agent.',
    noSelection: 'Select a component or relationship to inspect its context.',
    noFlow: 'Choose a feature with a published feature flow.',
    noDiagram: 'No diagram is available for this perspective yet.',
    openSource: 'Open source', sourceFiles: 'Source artifacts', warnings: 'Data quality notes',
    mainFlow: 'Primary flow', relation: 'relation', relations: 'relations', node: 'node', nodes: 'nodes',
    emptyTitle: 'Architecture map is not available yet', emptyAction: 'Generate with Agent',
    focusedFlow: 'Focused flow', clear: 'Clear', selected: 'Selected',
    receipt: 'Layout receipt',
  },
  vi: {
    title: 'Kiến trúc',
    fresh: 'Mới', stale: 'Cần làm mới', unknown: 'Chưa rõ trạng thái nguồn',
    system: 'Bản đồ hệ thống', layers: 'Lớp', features: 'Tính năng', screens: 'Màn hình', flows: 'Luồng',
    systemHint: 'Thành phần, boundary và quan hệ chính.',
    layersHint: 'Trục ứng dụng, xem từng lớp một.',
    featuresHint: 'Sở hữu code và boundary tính năng.',
    screensHint: 'Khu vực điều hướng và quan hệ màn hình.',
    flowsHint: 'Luồng code hoặc surface được focus.',
    outline: 'Dàn ý', inspector: 'Chi tiết', details: 'Chi tiết', relationships: 'Quan hệ', evidence: 'Bằng chứng',
    search: 'Tìm component, file, hoặc tính năng', filters: 'Bộ lọc', export: 'Xuất', exportSvg: 'Ảnh SVG', exportHtml: 'HTML biên tập',
    fit: 'Căn vừa', zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', reset: 'Đặt lại góc nhìn', hideNavigator: 'Ẩn dàn ý', hideInspector: 'Ẩn chi tiết',
    showNavigator: 'Hiện dàn ý', showInspector: 'Hiện chi tiết', refresh: 'Làm mới artifact',
    generate: 'Tạo bằng Agent', generating: 'Agent đang chạy…', generationStarted: 'Agent đang tạo architecture artifact độc lập trong terminal của provider.', generationComplete: 'Architecture artifact độc lập đã được cập nhật.', generationFailed: 'Không thể khởi chạy Architecture Agent.',
    noSelection: 'Chọn một component hoặc quan hệ để xem ngữ cảnh.',
    noFlow: 'Chọn tính năng có feature flow đã được publish.',
    noDiagram: 'Perspective này chưa có sơ đồ.',
    openSource: 'Mở mã nguồn', sourceFiles: 'Artifact nguồn', warnings: 'Ghi chú chất lượng dữ liệu',
    mainFlow: 'Luồng chính', relation: 'quan hệ', relations: 'quan hệ', node: 'node', nodes: 'node',
    emptyTitle: 'Chưa có architecture map', emptyAction: 'Tạo bằng Agent',
    focusedFlow: 'Luồng đang xem', clear: 'Bỏ chọn', selected: 'Đã chọn',
    receipt: 'Biên nhận layout',
  },
} as const;

const PALETTE = {
  paper: '#f6f7f3',
  paper2: '#ecefe8',
  ink: '#19231d',
  muted: '#53645a',
  soft: '#7b8980',
  rule: 'rgba(25,35,29,.16)',
  accent: '#16a36a',
  accentTint: 'rgba(22,163,106,.10)',
  link: '#2e64a8',
} as const;

const NODE_WIDTH = 176;
const NODE_HEIGHT = 72;
const GRID = 4;

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

function short(value: string | undefined, maximum: number): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > maximum ? `${compact.slice(0, maximum - 1).trimEnd()}…` : compact;
}

function normalize(value: string | undefined): string {
  return (value ?? '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function roleFor(node: Pick<ArchitectureStudioNode, 'kind' | 'layer' | 'role' | 'label'>): ComponentRole {
  const value = [node.kind, node.layer, node.role, node.label].filter(Boolean).join(' ').toLocaleLowerCase();
  if (/(auth|security|identity|permission|access|trust)/.test(value)) return 'security';
  if (/(database|storage|persist|cache|redis|postgres|data)/.test(value)) return 'store';
  if (/(external|third.party|integration|vendor|browser|reader|client)/.test(value)) return 'external';
  if (/(user|input|form)/.test(value)) return 'input';
  if (/(optional|async|queue|event)/.test(value)) return 'optional';
  return 'backend';
}

function edgeRole(edge: ArchitectureStudioEdge): string {
  return `${edge.role ?? ''} ${edge.label ?? ''}`.toLocaleLowerCase();
}

function sceneNodeFromArchitecture(node: ArchitectureStudioNode): Omit<SceneNode, 'x' | 'y' | 'width' | 'height'> {
  const role = roleFor(node);
  return {
    id: node.id,
    label: node.label,
    tag: short(node.kind || node.role || node.layer, 14)?.toUpperCase(),
    sublabel: short(node.symbol || node.file || node.summary, 32),
    kind: node.kind,
    role,
    summary: node.summary,
    file: node.file,
    symbol: node.symbol,
    confidence: node.confidence,
    evidence: node.evidence,
  };
}

function sceneNodeFromFeature(feature: ArchitectureStudioFeature): Omit<SceneNode, 'x' | 'y' | 'width' | 'height'> {
  return {
    id: feature.id,
    label: feature.name,
    tag: short(feature.kind || feature.module || feature.area, 14)?.toUpperCase(),
    sublabel: short(feature.summary || feature.evidence?.[0], 32),
    kind: feature.kind,
    role: roleFor({ kind: feature.kind, layer: feature.module ?? feature.area, role: undefined, label: feature.name }),
    summary: feature.summary,
    confidence: feature.confidence,
    evidence: feature.evidence,
  };
}

function layoutGraph(
  id: string,
  title: string,
  description: string,
  rawNodes: Array<Omit<SceneNode, 'x' | 'y' | 'width' | 'height'>>,
  rawEdges: SceneEdge[],
  direction: LayoutDirection,
  zoneKey?: (node: SceneNode) => string | undefined,
): DiagramScene {
  const nodeById = new Map(rawNodes.map((node) => [node.id, node]));
  const edges = rawEdges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target) && edge.source !== edge.target);
  const depth = new Map<string, number>(rawNodes.map((node) => [node.id, 0]));
  const incoming = new Map<string, number>(rawNodes.map((node) => [node.id, 0]));
  for (const edge of edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  const queue = rawNodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges.filter((candidate) => candidate.source === current)) {
      depth.set(edge.target, Math.max(depth.get(edge.target) ?? 0, (depth.get(current) ?? 0) + 1));
      incoming.set(edge.target, (incoming.get(edge.target) ?? 1) - 1);
      if ((incoming.get(edge.target) ?? 0) <= 0) queue.push(edge.target);
    }
  }
  // Cycles remain legible and stable: propagate at most nodeCount rounds,
  // then cap the final rank instead of force-simulating arbitrary positions.
  for (let pass = 0; pass < rawNodes.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const sourceDepth = depth.get(edge.source) ?? 0;
      const targetDepth = depth.get(edge.target) ?? 0;
      if (targetDepth < sourceDepth + 1 && sourceDepth < rawNodes.length - 1) {
        depth.set(edge.target, sourceDepth + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, Array<Omit<SceneNode, 'x' | 'y' | 'width' | 'height'>>>();
  for (const node of rawNodes) {
    const column = Math.min(depth.get(node.id) ?? 0, Math.max(0, rawNodes.length - 1));
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column)!.push(node);
  }
  for (const column of columns.values()) column.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  const maxRows = Math.max(1, ...[...columns.values()].map((column) => column.length));
  const margin = 72;
  const columnGap = 104;
  const rowGap = 48;
  const placed: SceneNode[] = [];
  for (const [columnIndex, column] of [...columns.entries()].sort((left, right) => left[0] - right[0])) {
    for (const [rowIndex, raw] of column.entries()) {
      const crossOffset = (maxRows - column.length) * (direction === 'horizontal' ? (NODE_HEIGHT + rowGap) : (NODE_WIDTH + rowGap)) / 2;
      const x = direction === 'horizontal'
        ? margin + columnIndex * (NODE_WIDTH + columnGap)
        : margin + crossOffset + rowIndex * (NODE_WIDTH + rowGap);
      const y = direction === 'horizontal'
        ? margin + crossOffset + rowIndex * (NODE_HEIGHT + rowGap)
        : margin + columnIndex * (NODE_HEIGHT + columnGap);
      placed.push({ ...raw, x: snap(x), y: snap(y), width: NODE_WIDTH, height: NODE_HEIGHT });
    }
  }
  const width = Math.max(720, ...placed.map((node) => node.x + node.width + margin));
  const height = Math.max(440, ...placed.map((node) => node.y + node.height + margin));
  const zones: SceneZone[] = [];
  if (zoneKey) {
    const groups = new Map<string, SceneNode[]>();
    for (const node of placed) {
      const key = zoneKey(node);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(node);
    }
    for (const [label, nodes] of groups) {
      if (nodes.length < 2) continue;
      const left = Math.min(...nodes.map((node) => node.x)) - 28;
      const top = Math.min(...nodes.map((node) => node.y)) - 38;
      const right = Math.max(...nodes.map((node) => node.x + node.width)) + 28;
      const bottom = Math.max(...nodes.map((node) => node.y + node.height)) + 28;
      zones.push({ id: `zone:${label}`, label, x: snap(left), y: snap(top), width: snap(right - left), height: snap(bottom - top) });
    }
  }
  const receipt = [
    `${placed.length} ${placed.length === 1 ? 'node' : 'nodes'} · ${edges.length} ${edges.length === 1 ? 'relation' : 'relations'}`,
    ...(rawNodes.length > 12 ? ['Large graph: use the outline and focus views to inspect detail.'] : []),
  ];
  return { id, title, description, width: snap(width), height: snap(height), nodes: placed, edges, zones, receipt };
}

function systemScene(state: ArchitectureStudioState, text: typeof COPY.en | typeof COPY.vi): DiagramScene | undefined {
  const nodes = state.nodes.length ? state.nodes : state.structuralNodes;
  const edges = state.nodes.length ? state.edges : state.structuralEdges;
  if (!nodes.length) return undefined;
  return layoutGraph(
    'system', text.system, text.systemHint,
    nodes.map((node, index) => ({ ...sceneNodeFromArchitecture(node), role: index === Math.ceil(nodes.length / 2) - 1 ? 'focal' : roleFor(node) })),
    edges.map((edge, index) => ({ id: edge.id ?? `system:${index + 1}`, ...edge })),
    'horizontal',
    (node) => nodes.find((candidate) => candidate.id === node.id)?.layer,
  );
}

function layersScene(state: ArchitectureStudioState, text: typeof COPY.en | typeof COPY.vi): DiagramScene | undefined {
  const nodes = state.structuralNodes.length ? state.structuralNodes : state.nodes;
  const edges = state.structuralNodes.length ? state.structuralEdges : state.edges;
  if (!nodes.length) return undefined;
  return layoutGraph(
    'layers', text.layers, text.layersHint,
    nodes.map((node) => ({ ...sceneNodeFromArchitecture(node), tag: short(node.layer || node.kind || node.role, 14)?.toUpperCase() })),
    edges.map((edge, index) => ({ id: edge.id ?? `layer:${index + 1}`, ...edge })),
    'vertical',
  );
}

function featuresScene(state: ArchitectureStudioState, text: typeof COPY.en | typeof COPY.vi): DiagramScene | undefined {
  if (!state.features.length) return undefined;
  const nodes: Array<Omit<SceneNode, 'x' | 'y' | 'width' | 'height'>> = [{ id: 'app', label: 'APP', tag: 'ROOT', role: 'focal', virtual: true }];
  const edges: SceneEdge[] = [];
  const ids = new Set(state.features.map((feature) => feature.id));
  const groupIds = new Map<string, string>();
  for (const feature of state.features) {
    const group = feature.area || feature.module;
    if (group && !feature.parent && !groupIds.has(group)) {
      const groupId = `group:${group}`;
      groupIds.set(group, groupId);
      nodes.push({ id: groupId, label: group, tag: 'AREA', role: 'input', virtual: true });
      edges.push({ id: `feature:root:${group}`, source: 'app', target: groupId });
    }
  }
  for (const feature of state.features) {
    nodes.push(sceneNodeFromFeature(feature));
    const group = feature.area || feature.module;
    const parent = feature.parent && ids.has(feature.parent)
      ? feature.parent
      : group && groupIds.has(group) ? groupIds.get(group)! : 'app';
    edges.push({ id: `feature:${feature.id}`, source: parent, target: feature.id });
    for (const [index, entry] of (feature.entrypoints ?? []).slice(0, 4).entries()) {
      const id = `entry:${feature.id}:${index}`;
      nodes.push({
        id,
        label: entry.label,
        tag: 'ENTRY',
        sublabel: short(entry.symbol || entry.file, 32),
        role: 'optional',
        file: entry.file,
        symbol: entry.symbol,
        virtual: true,
      });
      edges.push({ id: `feature:${feature.id}:entry:${index}`, source: feature.id, target: id, role: 'async' });
    }
  }
  return layoutGraph('features', text.features, text.featuresHint, nodes, edges, 'horizontal');
}

function screensScene(state: ArchitectureStudioState, text: typeof COPY.en | typeof COPY.vi): DiagramScene | undefined {
  if (!state.screens.length) return undefined;
  const nodes: Array<Omit<SceneNode, 'x' | 'y' | 'width' | 'height'>> = [{ id: 'ui', label: 'UI', tag: 'ROOT', role: 'focal', virtual: true }];
  const edges: SceneEdge[] = [];
  const screenIds = new Set(state.screens.map((screen) => screen.id));
  const groupIds = new Map<string, string>();
  for (const screen of state.screens) {
    const group = screen.area || screen.module;
    if (group && !screen.parent && !groupIds.has(group)) {
      const id = `screen-area:${group}`;
      groupIds.set(group, id);
      nodes.push({ id, label: group, tag: 'AREA', role: 'input', virtual: true });
      edges.push({ id: `screen:root:${group}`, source: 'ui', target: id });
    }
  }
  for (const screen of state.screens) {
    nodes.push(sceneNodeFromFeature(screen));
    const group = screen.area || screen.module;
    const parent = screen.parent && screenIds.has(screen.parent)
      ? screen.parent
      : group && groupIds.has(group) ? groupIds.get(group)! : 'ui';
    if (!state.screenEdges.some((edge) => edge.source === parent && edge.target === screen.id)) {
      edges.push({ id: `screen:tree:${screen.id}`, source: parent, target: screen.id, role: 'parent' });
    }
  }
  for (const [index, edge] of state.screenEdges.entries()) {
    edges.push({ id: edge.id ?? `screen:transition:${index + 1}`, ...edge });
  }
  return layoutGraph('screens', text.screens, text.screensHint, nodes, edges, 'horizontal');
}

function flowScene(state: ArchitectureStudioState, featureId: string | undefined, text: typeof COPY.en | typeof COPY.vi): DiagramScene | undefined {
  const flow = featureId ? state.featureFlows[featureId] : undefined;
  if (!flow?.nodes.length) return undefined;
  return layoutGraph(
    `flow:${flow.featureId}`,
    flow.title || text.focusedFlow,
    text.flowsHint,
    flow.nodes.map((node, index) => ({ ...sceneNodeFromArchitecture(node), role: index === 0 ? 'focal' : roleFor(node) })),
    flow.edges.map((edge, index) => ({ id: edge.id ?? `flow:${flow.featureId}:${index + 1}`, ...edge })),
    'horizontal',
  );
}

function pathForEdge(source: SceneNode, target: SceneNode): { path: string; labelX: number; labelY: number } {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const predominantlyVertical = Math.abs(targetCenterY - sourceCenterY) > Math.abs(targetCenterX - sourceCenterX);
  if (predominantlyVertical) {
    const fromY = targetCenterY >= sourceCenterY ? source.y + source.height : source.y;
    const toY = targetCenterY >= sourceCenterY ? target.y : target.y + target.height;
    const mid = snap((fromY + toY) / 2);
    const bend = targetCenterX >= sourceCenterX ? 8 : -8;
    return {
      path: `M ${snap(sourceCenterX)} ${snap(fromY)} V ${mid - (targetCenterY >= sourceCenterY ? 8 : -8)} Q ${snap(sourceCenterX)} ${mid} ${snap(sourceCenterX + bend)} ${mid} H ${snap(targetCenterX)}` +
        ` Q ${snap(targetCenterX)} ${mid} ${snap(targetCenterX)} ${mid + (targetCenterY >= sourceCenterY ? 8 : -8)} V ${snap(toY)}`,
      labelX: snap((sourceCenterX + targetCenterX) / 2),
      labelY: mid - 8,
    };
  }
  const fromX = targetCenterX >= sourceCenterX ? source.x + source.width : source.x;
  const toX = targetCenterX >= sourceCenterX ? target.x : target.x + target.width;
  const mid = snap((fromX + toX) / 2);
  const bend = targetCenterY >= sourceCenterY ? 8 : -8;
  if (Math.abs(targetCenterY - sourceCenterY) < 4) {
    return { path: `M ${snap(fromX)} ${snap(sourceCenterY)} H ${snap(toX)}`, labelX: mid, labelY: snap(sourceCenterY - 10) };
  }
  return {
    path: `M ${snap(fromX)} ${snap(sourceCenterY)} H ${mid - (targetCenterX >= sourceCenterX ? 8 : -8)} Q ${mid} ${snap(sourceCenterY)} ${mid} ${snap(sourceCenterY + bend)} V ${snap(targetCenterY - (targetCenterY >= sourceCenterY ? 8 : -8))} Q ${mid} ${snap(targetCenterY)} ${mid + (targetCenterX >= sourceCenterX ? 8 : -8)} ${snap(targetCenterY)} H ${snap(toX)}`,
    labelX: mid,
    labelY: snap((sourceCenterY + targetCenterY) / 2 - 8),
  };
}

function edgeHitbox(source: SceneNode, target: SceneNode): { x: number; y: number; width: number; height: number } {
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterY = target.y + target.height / 2;
  const sourceSide = target.x >= source.x ? source.x + source.width : source.x;
  const targetSide = target.x >= source.x ? target.x : target.x + target.width;
  return {
    x: Math.min(sourceSide, targetSide),
    y: Math.min(sourceCenterY, targetCenterY) - 8,
    width: Math.max(16, Math.abs(targetSide - sourceSide)),
    height: Math.max(16, Math.abs(targetCenterY - sourceCenterY) + 16),
  };
}

function nodeColors(node: SceneNode, selected: boolean): { fill: string; stroke: string; text: string } {
  if (node.role === 'focal') return { fill: PALETTE.accentTint, stroke: PALETTE.accent, text: PALETTE.ink };
  if (node.role === 'store') return { fill: PALETTE.paper2, stroke: PALETTE.muted, text: PALETTE.ink };
  if (node.role === 'external') return { fill: 'rgba(83,100,90,.06)', stroke: 'rgba(25,35,29,.36)', text: PALETTE.ink };
  if (node.role === 'input') return { fill: 'rgba(83,100,90,.12)', stroke: PALETTE.soft, text: PALETTE.ink };
  if (node.role === 'security') return { fill: 'rgba(22,163,106,.05)', stroke: PALETTE.accent, text: PALETTE.ink };
  if (node.role === 'optional') return { fill: 'rgba(25,35,29,.02)', stroke: 'rgba(25,35,29,.28)', text: PALETTE.ink };
  return { fill: PALETTE.paper, stroke: selected ? PALETTE.accent : PALETTE.ink, text: PALETTE.ink };
}

function iconForView(view: StudioView): typeof Network {
  return view === 'system' ? Network : view === 'layers' ? Layers3 : view === 'features' ? FolderTree : view === 'screens' ? Monitor : Route;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function exportScene(scene: DiagramScene, svg: SVGSVGElement | null, format: 'svg' | 'html'): void {
  if (!svg) return;
  const source = new XMLSerializer().serializeToString(svg);
  const safeSvg = source.replace(/<script[\s\S]*?<\/script>/gi, '');
  const content = format === 'svg'
    ? safeSvg
    : `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(scene.title)}</title><style>body{margin:0;padding:32px;background:${PALETTE.paper};font-family:ui-sans-serif,system-ui,sans-serif;color:${PALETTE.ink}}main{max-width:1200px;margin:auto}h1{font-family:ui-serif,Georgia,serif;font-size:30px;font-weight:500}p{color:${PALETTE.muted};max-width:68ch;line-height:1.5}svg{width:100%;height:auto;display:block}</style></head><body><main><p>ARCHITECTURE · AIDLC</p><h1>${escapeHtml(scene.title)}</h1><p>${escapeHtml(scene.description)}</p>${safeSvg}</main></body></html>`;
  postMessage({ type: 'exportArchitectureSnapshot', format, content, suggestedName: `${scene.id.replace(/[^A-Za-z0-9_-]+/g, '-')}-architecture` });
}

export function ArchitectureStudio({ architecture, language }: {
  architecture: ArchitectureStudioState;
  language: Language;
}) {
  const text = COPY[language];
  const [view, setView] = useState<StudioView>('system');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [flowFeatureId, setFlowFeatureId] = useState<string>();
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activePan, setActivePan] = useState<{ pointerId: number; x: number; y: number; panX: number; panY: number }>();
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentNotice, setAgentNotice] = useState<string>();
  const generationBaseline = useRef<string | undefined>(undefined);
  const svgRef = useRef<SVGSVGElement>(null);

  const generateWithAgent = () => {
    if (agentRunning) return;
    generationBaseline.current = architecture.generatedAt;
    setAgentRunning(true);
    setAgentNotice(undefined);
    postMessage({ type: 'generateArchitectureStudio' });
  };

  useEffect(() => onHostMessage((message) => {
    if (message.type === 'architectureGenerationStarted') {
      setAgentRunning(true);
      setAgentNotice(text.generationStarted);
    }
    if (message.type === 'architectureGenerationFailed') {
      setAgentRunning(false);
      setAgentNotice(typeof message.message === 'string' ? message.message : text.generationFailed);
    }
  }), [text]);

  useEffect(() => {
    if (!agentRunning || !architecture.generatedAt || architecture.generatedAt === generationBaseline.current) return;
    setAgentRunning(false);
    setAgentNotice(text.generationComplete);
  }, [agentRunning, architecture.generatedAt, text]);

  useEffect(() => {
    if (!agentRunning) return;
    const timeout = window.setTimeout(() => setAgentRunning(false), 5 * 60_000);
    return () => window.clearTimeout(timeout);
  }, [agentRunning]);

  const viewDefinitions = useMemo<ViewDefinition[]>(() => [
    { id: 'system', icon: Network, label: text.system, hint: text.systemHint },
    { id: 'layers', icon: Layers3, label: text.layers, hint: text.layersHint },
    { id: 'features', icon: FolderTree, label: text.features, hint: text.featuresHint },
    { id: 'screens', icon: Monitor, label: text.screens, hint: text.screensHint },
    { id: 'flows', icon: Route, label: text.flows, hint: text.flowsHint },
  ], [text]);

  const resolvedFlowFeatureId = flowFeatureId
    ?? Object.keys(architecture.featureFlows)[0]
    ?? architecture.features.find((feature) => architecture.featureFlows[feature.id])?.id;
  const scene = useMemo(() => {
    if (view === 'system') return systemScene(architecture, text);
    if (view === 'layers') return layersScene(architecture, text);
    if (view === 'features') return featuresScene(architecture, text);
    if (view === 'screens') return screensScene(architecture, text);
    return flowScene(architecture, resolvedFlowFeatureId, text);
  }, [architecture, resolvedFlowFeatureId, text, view]);

  useEffect(() => {
    setSelectedId(undefined);
    setPan({ x: 0, y: 0 });
    setZoom(100);
  }, [view, resolvedFlowFeatureId]);

  const selectedNode = scene?.nodes.find((node) => node.id === selectedId);
  const selectedEdge = scene?.edges.find((edge) => edge.id === selectedId);
  const normalizedQuery = normalize(query);
  const matchingNodeIds = useMemo(() => {
    if (!normalizedQuery || !scene) return undefined;
    return new Set(scene.nodes.filter((node) => normalize([node.label, node.tag, node.sublabel, node.file, node.symbol].filter(Boolean).join(' ')).includes(normalizedQuery)).map((node) => node.id));
  }, [normalizedQuery, scene]);

  if (!architecture.available) {
    return <ArchitectureEmptyState architecture={architecture} text={text} generating={agentRunning} notice={agentNotice} onGenerate={generateWithAgent} />;
  }

  const selectNode = (id: string) => {
    setSelectedId(id);
    setInspectorOpen(true);
  };
  const selectEdge = (id: string) => {
    setSelectedId(id);
    setInspectorOpen(true);
  };
  const activateNode = (node: SceneNode) => {
    selectNode(node.id);
    if (view === 'system' && architecture.features.some((feature) => feature.id === node.id)) setView('features');
  };
  const zoomBy = (delta: number) => setZoom((value) => Math.max(45, Math.min(220, value + delta)));
  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (target.closest('[data-architecture-node], [data-architecture-edge]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setActivePan({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  };
  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePan || activePan.pointerId !== event.pointerId) return;
    setPan({ x: activePan.panX + event.clientX - activePan.x, y: activePan.panY + event.clientY - activePan.y });
  };
  const onCanvasPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePan?.pointerId === event.pointerId) setActivePan(undefined);
  };
  const onCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -10 : 10);
  };
  const onCanvasKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { setSelectedId(undefined); return; }
    if (event.key.toLocaleLowerCase() === 'f') { setPan({ x: 0, y: 0 }); setZoom(100); return; }
    if (event.key === '0') { setPan({ x: 0, y: 0 }); setZoom(100); return; }
    if (event.key === '+' || event.key === '=') { zoomBy(15); return; }
    if (event.key === '-') zoomBy(-15);
  };

  return (
    <div className="architecture-studio flex min-h-[680px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background/90 px-3 py-2.5 backdrop-blur-sm">
        <div className="min-w-36 pr-2">
          <p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">AIDLC · Architecture Studio</p>
          <h1 className="mt-0.5 font-serif text-lg font-medium tracking-tight text-foreground">{text.title}</h1>
        </div>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} className="h-8 w-full rounded-md border border-border bg-background px-8 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15" />
          {query && <button type="button" title={text.clear} onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium ${architecture.freshness === 'fresh' ? 'border-primary/25 bg-primary/10 text-primary' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
          <CircleDot className="h-2.5 w-2.5" />
          {architecture.freshness === 'fresh' ? text.fresh : architecture.freshness === 'stale' ? text.stale : text.unknown}
        </span>
        <button type="button" disabled={agentRunning} onClick={generateWithAgent} title={agentNotice ?? text.generate} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70">{agentRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}<span>{agentRunning ? text.generating : text.generate}</span></button>
        <button type="button" onClick={() => postMessage({ type: 'refreshArchitectureStudio' })} title={text.refresh} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /><span className="hidden lg:inline">{text.refresh}</span></button>
        <ExportMenu text={text} disabled={!scene} onExport={(format) => scene && exportScene(scene, svgRef.current, format)} />
      </header>
      {agentNotice && <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary">{agentRunning ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <CircleDot className="h-3.5 w-3.5 shrink-0" />}<span className="min-w-0 flex-1 truncate">{agentNotice}</span><button type="button" title={text.clear} onClick={() => setAgentNotice(undefined)} className="rounded p-0.5 hover:bg-primary/10"><X className="h-3.5 w-3.5" /></button></div>}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {navigatorOpen && <ArchitectureNavigator
          text={text}
          views={viewDefinitions}
          activeView={view}
          onView={(next) => setView(next)}
          scene={scene}
          selectedId={selectedId}
          onSelect={selectNode}
          query={normalizedQuery}
          flowFeatureId={resolvedFlowFeatureId}
          features={architecture.features}
          flows={architecture.featureFlows}
          onFlowSelect={(featureId) => { setFlowFeatureId(featureId); setView('flows'); }}
        />}

        <main className="relative flex min-w-0 flex-1 flex-col bg-[#f6f7f3] dark:bg-[#171c19]">
          <div className="flex min-h-10 items-center justify-between border-b border-black/10 px-3 text-xs dark:border-white/10">
            <div className="flex min-w-0 items-center gap-2 text-[#53645a] dark:text-[#b3c0b7]">
              {React.createElement(iconForView(view), { className: 'h-3.5 w-3.5 shrink-0' })}
              <span className="truncate font-medium text-[#19231d] dark:text-[#f2f5f2]">{viewDefinitions.find((item) => item.id === view)?.label}</span>
              <span className="hidden truncate sm:inline">{viewDefinitions.find((item) => item.id === view)?.hint}</span>
            </div>
            <div className="flex items-center gap-1">
              <CanvasButton label={navigatorOpen ? text.hideNavigator : text.showNavigator} onClick={() => setNavigatorOpen((open) => !open)}><PanelLeftClose className="h-3.5 w-3.5" /></CanvasButton>
              <CanvasButton label={text.zoomOut} onClick={() => zoomBy(-15)}><Minus className="h-3.5 w-3.5" /></CanvasButton>
              <button type="button" title={text.reset} onClick={() => { setZoom(100); setPan({ x: 0, y: 0 }); }} className="min-w-12 rounded px-1.5 py-1 font-mono text-[10px] text-[#53645a] hover:bg-black/5 dark:text-[#b3c0b7] dark:hover:bg-white/10">{zoom}%</button>
              <CanvasButton label={text.zoomIn} onClick={() => zoomBy(15)}><Plus className="h-3.5 w-3.5" /></CanvasButton>
              <CanvasButton label={text.fit} onClick={() => { setZoom(100); setPan({ x: 0, y: 0 }); }}><Crosshair className="h-3.5 w-3.5" /></CanvasButton>
              <CanvasButton label={inspectorOpen ? text.hideInspector : text.showInspector} onClick={() => setInspectorOpen((open) => !open)}><PanelRightClose className="h-3.5 w-3.5" /></CanvasButton>
            </div>
          </div>
          {scene ? <div
            tabIndex={0}
            aria-label={`${scene.title}. ${scene.description}`}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerEnd}
            onPointerCancel={onCanvasPointerEnd}
            onWheel={onCanvasWheel}
            onKeyDown={onCanvasKeyDown}
            onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(undefined); }}
            className={`relative min-h-0 flex-1 overflow-hidden outline-none ${activePan ? 'cursor-grabbing' : 'cursor-grab'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
          >
            <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(rgba(25,35,29,.13)_0.8px,transparent_0.8px)] [background-size:22px_22px] dark:opacity-20" />
            <div className="absolute inset-0 overflow-auto">
              <div className="flex min-h-full min-w-full items-center justify-center p-10">
                <svg
                  ref={svgRef}
                  width={scene.width}
                  height={scene.height}
                  viewBox={`0 0 ${scene.width} ${scene.height}`}
                  role="img"
                  aria-labelledby={`${scene.id}-title ${scene.id}-desc`}
                  className="max-w-none select-none"
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`, transformOrigin: 'center center', transition: activePan ? 'none' : 'transform 120ms ease-out' }}
                >
                  <title id={`${scene.id}-title`}>{scene.title}</title>
                  <desc id={`${scene.id}-desc`}>{scene.description}. {scene.receipt.join('. ')}</desc>
                  <defs>
                    <marker id={`${scene.id}-arrow`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill={PALETTE.muted} /></marker>
                    <marker id={`${scene.id}-arrow-link`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill={PALETTE.link} /></marker>
                  </defs>
                  <rect width="100%" height="100%" fill={PALETTE.paper} rx="8" />
                  {scene.zones.map((zone) => <g key={zone.id}>
                    <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="8" fill="rgba(25,35,29,.025)" stroke="rgba(25,35,29,.18)" strokeWidth="0.8" />
                    <rect x={zone.x + 12} y={zone.y - 6} width={Math.max(56, zone.label.length * 7)} height="16" rx="2" fill={PALETTE.paper} />
                    <text x={zone.x + 18} y={zone.y + 6} fill={PALETTE.soft} fontSize="7" fontFamily="ui-monospace, SFMono-Regular, monospace" fontWeight="600" letterSpacing="1.4">{zone.label.toUpperCase()}</text>
                  </g>)}
                  <g>
                    {scene.edges.map((edge) => {
                      const source = scene.nodes.find((node) => node.id === edge.source);
                      const target = scene.nodes.find((node) => node.id === edge.target);
                      if (!source || !target) return null;
                      const route = pathForEdge(source, target);
                      const hitbox = edgeHitbox(source, target);
                      const isLink = Boolean(edge.protocol) || /http|api|external|integration/.test(edgeRole(edge));
                      const dashed = /async|return|optional|parent/.test(edgeRole(edge));
                      const selected = selectedId === edge.id;
                      const label = short(edge.protocol || edge.label, 22);
                      return <g key={edge.id}
                        data-architecture-edge={edge.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${source.label} to ${target.label}${edge.protocol || edge.label ? `, ${edge.protocol || edge.label}` : ''}`}
                        className="cursor-pointer outline-none"
                        onClick={(event) => { event.stopPropagation(); selectEdge(edge.id); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectEdge(edge.id); } }}
                      >
                        <rect x={hitbox.x} y={hitbox.y} width={hitbox.width} height={hitbox.height} fill="transparent" />
                        <path d={route.path} fill="none" stroke="transparent" strokeWidth="12" />
                        <path d={route.path} fill="none" stroke={selected ? PALETTE.accent : isLink ? PALETTE.link : PALETTE.muted} strokeWidth={selected ? 2.25 : isLink ? 1.2 : 1} strokeDasharray={dashed ? '4,3' : undefined} markerEnd={`url(#${scene.id}-${isLink ? 'arrow-link' : 'arrow'})`} />
                        {label && <g>
                          <rect x={route.labelX - Math.max(18, label.length * 2.8)} y={route.labelY - 9} width={Math.max(36, label.length * 5.6)} height="14" rx="2" fill={PALETTE.paper} />
                          <text x={route.labelX} y={route.labelY} textAnchor="middle" fill={isLink ? PALETTE.link : PALETTE.muted} fontSize="7.5" fontFamily="ui-monospace, SFMono-Regular, monospace" letterSpacing=".5">{label.toUpperCase()}</text>
                        </g>}
                      </g>;
                    })}
                  </g>
                  {scene.nodes.map((node) => <DiagramNode key={node.id} node={node} selected={selectedId === node.id} dimmed={Boolean(matchingNodeIds && !matchingNodeIds.has(node.id))} onSelect={() => selectNode(node.id)} onActivate={() => activateNode(node)} />)}
                </svg>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-black/10 bg-[#f6f7f3]/90 px-2 py-1 font-mono text-[9px] text-[#53645a] shadow-sm dark:border-white/10 dark:bg-[#171c19]/90 dark:text-[#b3c0b7]">Drag to pan · Ctrl/Cmd + scroll to zoom · F to fit</div>
          </div> : <div className="flex flex-1 items-center justify-center p-8 text-center"><div><Route className="mx-auto h-7 w-7 text-[#7b8980]" /><p className="mt-3 text-sm font-medium text-[#19231d] dark:text-[#f2f5f2]">{view === 'flows' ? text.noFlow : text.noDiagram}</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-[#53645a] dark:text-[#b3c0b7]">{view === 'flows' ? text.flowsHint : text.systemHint}</p></div></div>}
          <footer className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-t border-black/10 px-3 py-1.5 font-mono text-[9px] text-[#53645a] dark:border-white/10 dark:text-[#b3c0b7]">
            <span>{architecture.revision ? `REV ${architecture.revision}` : 'CURATED MODEL'}</span>
            <span>{scene?.nodes.length ?? 0} {text.nodes}</span>
            <span>{scene?.edges.length ?? 0} {text.relations}</span>
            {architecture.generatedAt && <span className="hidden xl:inline">{new Date(architecture.generatedAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}</span>}
            {architecture.warnings.length > 0 && <span className="ml-auto inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />{architecture.warnings.length} {text.warnings.toLocaleLowerCase()}</span>}
          </footer>
        </main>

        {inspectorOpen && <ArchitectureInspector text={text} node={selectedNode} edge={selectedEdge} scene={scene} architecture={architecture} onClear={() => setSelectedId(undefined)} />}
      </div>
    </div>
  );
}

function ArchitectureNavigator({
  text, views, activeView, onView, scene, selectedId, onSelect, query, features, flows, flowFeatureId, onFlowSelect,
}: {
  text: typeof COPY.en | typeof COPY.vi;
  views: ViewDefinition[];
  activeView: StudioView;
  onView: (view: StudioView) => void;
  scene?: DiagramScene;
  selectedId?: string;
  onSelect: (id: string) => void;
  query: string;
  features: ArchitectureStudioFeature[];
  flows: ArchitectureStudioState['featureFlows'];
  flowFeatureId?: string;
  onFlowSelect: (featureId: string) => void;
}) {
  const [outlineOpen, setOutlineOpen] = useState(true);
  const visibleNodes = scene?.nodes.filter((node) => !query || normalize([node.label, node.tag, node.sublabel].filter(Boolean).join(' ')).includes(query)) ?? [];
  return <aside className="z-10 flex w-56 shrink-0 flex-col border-r border-border bg-background">
    <div className="border-b border-border px-3 py-3">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Views</p>
      <nav className="mt-2 space-y-1" aria-label="Architecture views">
        {views.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => onView(item.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${activeView === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
            <Icon className="h-3.5 w-3.5" />
            <span className="truncate">{item.label}</span>
          </button>;
        })}
      </nav>
    </div>
    {activeView === 'flows' && <div className="border-b border-border px-3 py-3">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{text.focusedFlow}</p>
      <div className="mt-2 space-y-1">
        {features.filter((feature) => flows[feature.id]).map((feature) => <button key={feature.id} type="button" onClick={() => onFlowSelect(feature.id)} className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs ${flowFeatureId === feature.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}><Route className="h-3 w-3" /><span className="truncate">{feature.name}</span></button>)}
        {!features.some((feature) => flows[feature.id]) && <p className="rounded border border-dashed border-border px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">{text.noFlow}</p>}
      </div>
    </div>}
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <button type="button" onClick={() => setOutlineOpen((open) => !open)} className="flex w-full items-center gap-1 text-left font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground"><ChevronDown className={`h-3 w-3 transition-transform ${outlineOpen ? '' : '-rotate-90'}`} />{text.outline}</button>
      {outlineOpen && <div className="mt-2 space-y-0.5">
        {visibleNodes.map((node) => <button key={node.id} type="button" onClick={() => onSelect(node.id)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${selectedId === node.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${node.role === 'focal' ? 'bg-primary' : node.role === 'store' ? 'bg-slate-400' : 'bg-muted-foreground/50'}`} /><span className="truncate">{node.label}</span></button>)}
        {visibleNodes.length === 0 && <p className="px-2 py-3 text-[11px] text-muted-foreground">{text.noDiagram}</p>}
      </div>}
    </div>
  </aside>;
}

function DiagramNode({ node, selected, dimmed, onSelect, onActivate }: { node: SceneNode; selected: boolean; dimmed: boolean; onSelect: () => void; onActivate: () => void }) {
  const colors = nodeColors(node, selected);
  const dashed = node.role === 'optional' || node.role === 'security';
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate(); }
  };
  return <g
    data-architecture-node={node.id}
    role="button"
    tabIndex={0}
    aria-label={`${node.label}${node.tag ? `, ${node.tag}` : ''}`}
    onClick={(event) => { event.stopPropagation(); onSelect(); }}
    onDoubleClick={(event) => { event.stopPropagation(); onActivate(); }}
    onKeyDown={onKeyDown}
    opacity={dimmed ? 0.28 : 1}
    className="cursor-pointer outline-none"
  >
    <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="6" fill={colors.fill} stroke={colors.stroke} strokeWidth={selected ? 2 : 1.1} strokeDasharray={dashed ? '4,3' : undefined} />
    {node.tag && <text x={node.x + 12} y={node.y + 16} fill={node.role === 'focal' ? PALETTE.accent : PALETTE.soft} fontSize="7" fontFamily="ui-monospace, SFMono-Regular, monospace" fontWeight="600" letterSpacing="1">{node.tag}</text>}
    <text x={node.x + 12} y={node.y + (node.tag ? 38 : 31)} fill={colors.text} fontSize="12" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="600">{short(node.label, 22)}</text>
    {node.sublabel && <text x={node.x + 12} y={node.y + 56} fill={PALETTE.muted} fontSize="8.5" fontFamily="ui-monospace, SFMono-Regular, monospace">{node.sublabel}</text>}
  </g>;
}

function ArchitectureInspector({ text, node, edge, scene, architecture, onClear }: {
  text: typeof COPY.en | typeof COPY.vi;
  node?: SceneNode;
  edge?: SceneEdge;
  scene?: DiagramScene;
  architecture: ArchitectureStudioState;
  onClear: () => void;
}) {
  const relationships = node && scene ? scene.edges.filter((candidate) => candidate.source === node.id || candidate.target === node.id) : [];
  const openSource = (target?: string) => target && postMessage({ type: 'openPath', path: target });
  return <aside className="z-10 flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-background">
    <div className="flex items-center justify-between border-b border-border px-3 py-3"><div><p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{text.inspector}</p><p className="mt-0.5 truncate text-sm font-semibold text-foreground">{node?.label ?? edge?.label ?? text.noSelection}</p></div>{(node || edge) && <button type="button" title={text.clear} onClick={onClear} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}</div>
    {!node && !edge ? <div className="p-4 text-xs leading-relaxed text-muted-foreground">{text.noSelection}<div className="mt-4 border-t border-border pt-4"><p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{text.sourceFiles}</p><ul className="mt-2 space-y-1">{architecture.sourcePaths.map((path) => <li key={path} className="truncate font-mono text-[10px]">{path}</li>)}</ul></div></div> : <div className="space-y-5 p-4 text-xs">
      {node && <InspectorSection title={text.details}><dl className="space-y-2"><Definition label="Role" value={node.role} /><Definition label="Kind" value={node.kind} /><Definition label="Source" value={node.file} /><Definition label="Symbol" value={node.symbol} /><Definition label="Confidence" value={node.confidence} /></dl>{node.summary && <p className="mt-3 leading-relaxed text-muted-foreground">{node.summary}</p>}{node.file && <button type="button" onClick={() => openSource(node.file)} className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent"><ArrowUpRight className="h-3 w-3" />{text.openSource}</button>}</InspectorSection>}
      {node && <InspectorSection title={`${text.relationships} · ${relationships.length}`}><div className="space-y-1.5">{relationships.map((relation) => <div key={relation.id} className="rounded-md border border-border px-2.5 py-2"><p className="font-medium text-foreground">{relation.source === node.id ? '→' : '←'} {relation.source === node.id ? scene?.nodes.find((item) => item.id === relation.target)?.label : scene?.nodes.find((item) => item.id === relation.source)?.label}</p>{(relation.protocol || relation.label) && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{relation.protocol || relation.label}</p>}</div>)}{relationships.length === 0 && <p className="text-muted-foreground">—</p>}</div></InspectorSection>}
      {(node?.evidence?.length || edge?.evidence?.length) && <InspectorSection title={text.evidence}><ul className="space-y-1.5">{(node?.evidence ?? edge?.evidence ?? []).map((item) => <li key={item}><button type="button" onClick={() => openSource(item)} className="flex max-w-full items-center gap-1 text-left font-mono text-[10px] text-primary hover:underline"><ArrowUpRight className="h-3 w-3 shrink-0" /><span className="truncate">{item}</span></button></li>)}</ul></InspectorSection>}
      {edge && <InspectorSection title={text.details}><dl className="space-y-2"><Definition label="From" value={edge.source} /><Definition label="To" value={edge.target} /><Definition label="Protocol" value={edge.protocol} /><Definition label="Label" value={edge.label} /><Definition label="Role" value={edge.role} /><Definition label="Confidence" value={edge.confidence} /></dl></InspectorSection>}
    </div>}
  </aside>;
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{title}</h2><div className="mt-2">{children}</div></section>;
}

function Definition({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="truncate font-mono text-[10px] text-foreground" title={value}>{value}</dd></div>;
}

function CanvasButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className="inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-[#53645a] hover:border-black/10 hover:bg-black/5 dark:text-[#b3c0b7] dark:hover:border-white/10 dark:hover:bg-white/10">{children}</button>;
}

function ExportMenu({ text, disabled, onExport }: { text: typeof COPY.en | typeof COPY.vi; disabled: boolean; onExport: (format: 'svg' | 'html') => void }) {
  const [open, setOpen] = useState(false);
  return <div className="relative"><button type="button" disabled={disabled} onClick={() => setOpen((value) => !value)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"><Download className="h-3.5 w-3.5" />{text.export}<ChevronDown className="h-3 w-3" /></button>{open && <div className="absolute right-0 top-9 z-30 w-44 rounded-md border border-border bg-popover p-1 shadow-lg"><button type="button" onClick={() => { onExport('svg'); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"><ArrowDownToLine className="h-3.5 w-3.5" />{text.exportSvg}</button><button type="button" onClick={() => { onExport('html'); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"><Box className="h-3.5 w-3.5" />{text.exportHtml}</button></div>}</div>;
}

function ArchitectureEmptyState({ architecture, text, generating, notice, onGenerate }: { architecture: ArchitectureStudioState; text: typeof COPY.en | typeof COPY.vi; generating: boolean; notice?: string; onGenerate: () => void }) {
  return <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-8 text-center"><div className="max-w-md"><Network className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-4 text-base font-semibold text-foreground">{text.emptyTitle}</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{architecture.message}</p>{notice && <p className="mt-3 rounded-md bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">{notice}</p>}{architecture.warnings.length > 0 && <ul className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-left text-xs text-amber-800 dark:text-amber-200">{architecture.warnings.map((warning) => <li key={warning} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</li>)}</ul>}<div className="mt-5 flex items-center justify-center gap-2"><button type="button" disabled={generating} onClick={onGenerate} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70">{generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{generating ? text.generating : text.emptyAction}</button><button type="button" title={text.refresh} onClick={() => postMessage({ type: 'refreshArchitectureStudio' })} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"><RefreshCw className="h-3.5 w-3.5" />{text.refresh}</button></div></div></div>;
}
