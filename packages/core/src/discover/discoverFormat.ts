/**
 * The Discover Markdown contract as a rewrite, not just a checklist.
 *
 * Old titles (`# Features`, `# Data model`, `# Tech stack`, `# Skeleton`,
 * `# User flows`) and missing trees are bugs. Scan and step runs fold the
 * file back onto `DocSpec.ts` — headings, H1, fenced ASCII trees — while
 * keeping every existing id. Empty skeletons that already match the spec
 * are left untouched.
 */

import {
  DOC_DATA_FLOW,
  DOC_MODULES,
  type DocFileSpec,
  type SectionSpec,
} from './DocSpec';
import {
  findSection,
  parseDoc,
  type DocItem,
  type DocModel,
  type DocRecord,
} from './mdParse';

export interface FormatIssue {
  code: 'legacy-format';
  file: string;
  message: string;
}

export function isAsciiTreeSection(spec: SectionSpec): boolean {
  return spec.shape === 'ascii-tree';
}

export function isMermaidFlowchartSection(spec: SectionSpec): boolean {
  return spec.shape === 'mermaid-flowchart';
}

export function isDiagramSection(spec: SectionSpec): boolean {
  return isAsciiTreeSection(spec) || isMermaidFlowchartSection(spec);
}

export function hasFencedBlock(prose: string): boolean {
  return /```[\s\S]*```/.test(prose) || /~~~[\s\S]*~~~/.test(prose);
}

function looksLikeAsciiTree(prose: string): boolean {
  return /[├└│]|-->/.test(prose);
}

/** A previous synthesizer cut labels at ~72 chars and left `…` / `...`. */
function looksTruncated(prose: string): boolean {
  return /(?:\u2026|\.\.\.)\s*$/m.test(prose);
}

function fenceTree(body: string): string {
  const inner = body.replace(/^\s*```(?:text)?\s*/i, '').replace(/\s*```\s*$/, '').trimEnd();
  return `\`\`\`text\n${inner.replace(/\s+$/, '')}\n\`\`\``;
}

function fenceMermaid(body: string): string {
  const inner = body
    .replace(/^\s*```(?:mermaid|text)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const chart = /flowchart\s+TD/i.test(inner) ? inner : `flowchart TD\n${inner}`;
  return `\`\`\`mermaid\n${chart}\n\`\`\``;
}

function hasMermaidFence(prose: string): boolean {
  return /```mermaid\b/i.test(prose) || /~~~mermaid\b/i.test(prose);
}

function looksLikeMermaidFlowchart(prose: string): boolean {
  return /flowchart\s+TD/i.test(prose);
}

const FENCE_OPEN = /^\s*(```|~~~)/;

function fencedLineSet(lines: string[]): Set<number> {
  const inside = new Set<number>();
  let fence: string | null = null;
  lines.forEach((line, idx) => {
    const match = FENCE_OPEN.exec(line);
    if (fence) {
      inside.add(idx);
      if (match && line.trim().startsWith(fence)) { fence = null; }
      return;
    }
    if (match) {
      fence = match[1]!;
      inside.add(idx);
    }
  });
  return inside;
}

function normalizeHeading(heading: string): string {
  return heading.trim().replace(/[:.]+$/, '').replace(/\s+/g, ' ').toLowerCase();
}

function findH1(lines: string[], fenced: Set<number>): number {
  return lines.findIndex((line, idx) => !fenced.has(idx) && /^#\s+/.test(line) && !line.startsWith('##'));
}

function findH2(lines: string[], heading: string, fenced: Set<number>): number {
  const want = normalizeHeading(heading);
  return lines.findIndex((line, idx) => {
    if (fenced.has(idx)) { return false; }
    const match = /^##\s+(.*)$/.exec(line);
    return !!match && normalizeHeading(match[1]!) === want;
  });
}

function nextH2(lines: string[], after: number, fenced: Set<number>): number {
  for (let idx = after + 1; idx < lines.length; idx += 1) {
    if (!fenced.has(idx) && /^##\s+/.test(lines[idx]!)) { return idx; }
  }
  return lines.length;
}

function sectionBody(lines: string[], headingIdx: number, fenced: Set<number>): { start: number; end: number } {
  const start = headingIdx + 1;
  return { start, end: nextH2(lines, headingIdx, fenced) };
}

function trimBlankEdges(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[0]!.trim() === '') { out.shift(); }
  while (out.length > 0 && out[out.length - 1]!.trim() === '') { out.pop(); }
  return out;
}

function groupOfFeatureId(id: string): string {
  const parts = id.split('-');
  if (parts.length < 3) { return parts[0] ?? id; }
  return parts.slice(1, -1).join('-');
}

function titleCaseGroup(group: string): string {
  return group.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemLabel(item: DocItem): string {
  return item.text.replace(/\s+/g, ' ').trim();
}

function renderGroupTree(groups: { name: string; items: DocItem[] }[]): string {
  const lines: string[] = [];
  for (const group of groups) {
    if (lines.length > 0) { lines.push(''); }
    lines.push(group.name);
    group.items.forEach((item, idx) => {
      const branch = idx === group.items.length - 1 ? '└──' : '├──';
      const label = itemLabel(item);
      lines.push(`${branch} ${item.id}${label ? ` — ${label}` : ''}`);
    });
  }
  return lines.join('\n');
}

function synthesizeFeatureTree(items: DocItem[]): string | undefined {
  if (items.length === 0) { return undefined; }
  const order: string[] = [];
  const byGroup = new Map<string, DocItem[]>();
  for (const item of items) {
    const group = groupOfFeatureId(item.id);
    if (!byGroup.has(group)) {
      order.push(group);
      byGroup.set(group, []);
    }
    byGroup.get(group)!.push(item);
  }
  return renderGroupTree(order.map((name) => ({ name: titleCaseGroup(name), items: byGroup.get(name)! })));
}

function layerName(item: DocItem): string {
  return (item.text.split(/[—–:]/)[0] ?? item.text).replace(/\s+/g, ' ').trim();
}

function synthesizeLayering(items: DocItem[]): string | undefined {
  if (items.length === 0) { return undefined; }
  return items.map((item, idx) => {
    const row = `${item.id} ${layerName(item)}`.trim();
    return idx < items.length - 1 ? `${row}\n     ↓` : row;
  }).join('\n');
}

function screenLabel(item: DocItem): string {
  return (item.text.split(/[:.(]/)[0] ?? item.text).replace(/\s+/g, ' ').trim();
}

function mermaidNodeId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '_');
}

function mermaidNodeLabel(text: string): string {
  return text.replace(/[\\"\[\]{}|<>]/g, '').replace(/[\r\n]+/g, ' ').trim();
}

function extractScrIds(text: string): string[] {
  return [...text.matchAll(/\bSCR-\d{2,}\b/g)].map((m) => m[0]!);
}

function synthesizeScreenFlow(screens: DocItem[], flows: DocRecord[]): string | undefined {
  const labels = new Map(screens.map((item) => [item.id, mermaidNodeLabel(screenLabel(item))]));
  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  const addEdge = (from: string, to: string) => {
    const key = `${from}->${to}`;
    if (from === to || seen.has(key)) { return; }
    seen.add(key);
    edges.push([from, to]);
  };
  for (const flow of flows) {
    const steps = flow.fields.find((f) => f.label.toLowerCase() === 'steps')?.items ?? [];
    for (const step of steps) {
      const parts = step.split(/\s*(?:→|->)\s*/);
      const partIds = parts.map((part) => extractScrIds(part));
      for (let i = 0; i < partIds.length - 1; i += 1) {
        for (const from of partIds[i]!) {
          for (const to of partIds[i + 1]!) { addEdge(from, to); }
        }
      }
    }
  }
  const nodeIds: string[] = [];
  const addNode = (id: string) => { if (!nodeIds.includes(id)) { nodeIds.push(id); } };
  for (const item of screens) { addNode(item.id); }
  for (const [from, to] of edges) { addNode(from); addNode(to); }
  if (nodeIds.length === 0) {
    const first = flows[0];
    const steps = first?.fields.find((f) => f.label.toLowerCase() === 'steps')?.items ?? [];
    if (steps.length === 0) { return undefined; }
    return ['flowchart TD', ...steps.map((step, idx) => {
      const id = `S${idx + 1}`;
      const label = mermaidNodeLabel(step.split(/[—–:]/)[0] ?? step);
      const line = `    ${id}[${label || step}]`;
      return idx < steps.length - 1 ? `${line}\n    ${id} --> S${idx + 2}` : line;
    })].join('\n');
  }
  if (edges.length === 0 && screens.length > 1) {
    for (let i = 0; i < screens.length - 1; i += 1) { addEdge(screens[i]!.id, screens[i + 1]!.id); }
  }
  const lines = ['flowchart TD'];
  for (const id of nodeIds) {
    const label = labels.get(id) || id;
    lines.push(`    ${mermaidNodeId(id)}["${label}"]`);
  }
  for (const [from, to] of edges) {
    lines.push(`    ${mermaidNodeId(from)} --> ${mermaidNodeId(to)}`);
  }
  return lines.join('\n');
}

const PATH_RE = /(?:^|[\s`])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\/?)/g;

function extractPaths(text: string): string[] {
  const out: string[] = [];
  for (const tick of text.matchAll(/`([^`]+)`/g)) {
    const value = tick[1]!.trim().replace(/\/$/, '');
    if (value.includes('/') && !out.includes(value)) { out.push(value); }
  }
  for (const match of text.matchAll(PATH_RE)) {
    const value = match[1]!.replace(/\/$/, '');
    if (value.includes('/') && !out.includes(value)) { out.push(value); }
  }
  return out;
}

interface TrieNode { children: Map<string, TrieNode> }

function pathsToAsciiTree(paths: string[]): string | undefined {
  const unique = [...new Set(paths.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean))];
  if (unique.length === 0) { return undefined; }
  const root: TrieNode = { children: new Map() };
  for (const p of unique) {
    let node = root;
    for (const part of p.split('/').filter(Boolean)) {
      if (!node.children.has(part)) { node.children.set(part, { children: new Map() }); }
      node = node.children.get(part)!;
    }
  }
  const lines = ['project'];
  const walk = (node: TrieNode, prefix: string): void => {
    const entries = [...node.children.entries()];
    entries.forEach(([name, child], idx) => {
      const last = idx === entries.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${name}`);
      walk(child, `${prefix}${last ? '    ' : '│   '}`);
    });
  };
  walk(root, '');
  return lines.join('\n');
}

function synthesizePathTree(entries: { id: string; text: string }[]): string | undefined {
  const paths = entries.flatMap((e) => extractPaths(`${e.id} ${e.text}`));
  return pathsToAsciiTree(paths);
}

function synthesizeDataFlow(modules: DocRecord[]): string | undefined {
  if (modules.length === 0) { return undefined; }
  return modules.map((mod, idx) => {
    const row = `${mod.id} ${mod.title}`.trim();
    return idx < modules.length - 1 ? `${row}\n     ↓` : row;
  }).join('\n');
}

function synthesizeTree(
  spec: DocFileSpec,
  section: SectionSpec,
  doc: DocModel,
  related?: Map<string, DocModel>,
): string | undefined {
  switch (`${spec.path}#${section.key}`) {
    case 'product/FEATURES.md#tree':
      return synthesizeFeatureTree(findSection(doc, 'features')?.items ?? []);
    case 'product/USER_FLOWS.md#screenFlow':
      return synthesizeScreenFlow(findSection(doc, 'screens')?.items ?? [], findSection(doc, 'flows')?.records ?? []);
    case 'architecture/ARCHITECTURE.md#layering':
      return synthesizeLayering(findSection(doc, 'layers')?.items ?? []);
    case 'architecture/PROJECT_STRUCTURE.md#tree':
      return synthesizePathTree((findSection(doc, 'mapping')?.items ?? []).map((i) => ({ id: i.id, text: i.text })));
    case 'plans/SKELETON.md#tree':
      return synthesizePathTree((findSection(doc, 'files')?.items ?? []).map((i) => ({ id: i.id, text: i.text })));
    case `${DOC_DATA_FLOW}#dataFlow`: {
      const modules = related?.get(DOC_MODULES);
      return synthesizeDataFlow(findSection(modules ?? doc, 'modules')?.records ?? []);
    }
    default:
      return undefined;
  }
}

function desiredTreeProse(
  spec: DocFileSpec,
  section: SectionSpec,
  current: string,
  doc: DocModel,
  related?: Map<string, DocModel>,
): string | undefined {
  const trimmed = current.trim();
  const synthesized = synthesizeTree(spec, section, doc, related);
  if (looksTruncated(trimmed) && synthesized) { return fenceTree(synthesized); }
  if (hasFencedBlock(trimmed) && looksLikeAsciiTree(trimmed)) { return undefined; }
  if (hasFencedBlock(trimmed) && trimmed.length > 0) { return undefined; }
  if (trimmed.length === 0) { return synthesized ? fenceTree(synthesized) : undefined; }
  if (looksLikeAsciiTree(trimmed)) { return fenceTree(trimmed); }
  if (synthesized) { return `${fenceTree(synthesized)}\n\n${trimmed}`; }
  return fenceTree(trimmed);
}

function desiredMermaidProse(
  spec: DocFileSpec,
  section: SectionSpec,
  current: string,
  doc: DocModel,
  related?: Map<string, DocModel>,
): string | undefined {
  const trimmed = current.trim();
  const synthesized = synthesizeTree(spec, section, doc, related);
  if (hasMermaidFence(trimmed) && looksLikeMermaidFlowchart(trimmed) && !looksTruncated(trimmed)) {
    return undefined;
  }
  if (synthesized) { return fenceMermaid(synthesized); }
  if (looksLikeMermaidFlowchart(trimmed)) { return fenceMermaid(trimmed); }
  return undefined;
}

function desiredDiagramProse(
  spec: DocFileSpec,
  section: SectionSpec,
  current: string,
  doc: DocModel,
  related?: Map<string, DocModel>,
): string | undefined {
  if (isMermaidFlowchartSection(section)) {
    return desiredMermaidProse(spec, section, current, doc, related);
  }
  return desiredTreeProse(spec, section, current, doc, related);
}

function setH1(lines: string[], title: string, fenced: Set<number>): string[] {
  const idx = findH1(lines, fenced);
  const heading = `# ${title}`;
  if (idx < 0) { return [heading, '', ...lines]; }
  if (lines[idx] === heading) { return lines; }
  const next = [...lines];
  next[idx] = heading;
  return next;
}

function insertHeading(lines: string[], spec: DocFileSpec, section: SectionSpec, fenced: Set<number>): string[] {
  if (findH2(lines, section.heading, fenced) >= 0) { return lines; }
  const order = spec.sections;
  const myIdx = order.findIndex((s) => s.key === section.key);
  let at = lines.length;
  for (const later of order.slice(myIdx + 1)) {
    const idx = findH2(lines, later.heading, fenced);
    if (idx >= 0) { at = idx; break; }
  }
  const block = [`## ${section.heading}`, ''];
  if (at > 0 && lines[at - 1]!.trim() !== '') { block.unshift(''); }
  if (at < lines.length && lines[at]!.trim() !== '') { block.push(''); }
  const next = [...lines];
  next.splice(at, 0, ...block);
  return next;
}

function replaceSectionBody(lines: string[], headingIdx: number, body: string, fenced: Set<number>): string[] {
  const { start, end } = sectionBody(lines, headingIdx, fenced);
  const block = trimBlankEdges(body.split('\n'));
  const next = [...lines];
  next.splice(start, end - start, '', ...block, '');
  return next;
}

function finalize(lines: string[]): string {
  return `${lines.join('\n').replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`;
}

/**
 * Fold one file onto the spec: canonical H1, every declared `##` heading, and
 * a fenced ASCII tree or mermaid flowchart when that section is missing or still an essay.
 * Extra user headings stay. Existing ids are never renumbered.
 */
export function normalizeDiscoverDoc(
  content: string,
  spec: DocFileSpec,
  related?: Map<string, DocModel>,
): string {
  let lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.length === 1 && lines[0] === '') { lines = []; }
  let fenced = fencedLineSet(lines);
  lines = setH1(lines, spec.title, fenced);
  fenced = fencedLineSet(lines);
  for (const section of spec.sections) {
    lines = insertHeading(lines, spec, section, fenced);
    fenced = fencedLineSet(lines);
  }
  const parsed = parseDoc(finalize(lines), spec);
  for (const section of spec.sections) {
    if (!isDiagramSection(section)) { continue; }
    fenced = fencedLineSet(lines);
    const headingIdx = findH2(lines, section.heading, fenced);
    if (headingIdx < 0) { continue; }
    const { start, end } = sectionBody(lines, headingIdx, fenced);
    const current = lines.slice(start, end).join('\n');
    const next = desiredDiagramProse(spec, section, current, parsed, related);
    if (next === undefined) { continue; }
    if (current.trim() === next.trim()) { continue; }
    lines = replaceSectionBody(lines, headingIdx, next, fenced);
  }
  return finalize(lines);
}

export function legacyFormatIssues(doc: DocModel, spec: DocFileSpec): FormatIssue[] {
  const issues: FormatIssue[] = [];
  if (doc.exists && doc.title !== spec.title) {
    issues.push({
      code: 'legacy-format',
      file: spec.path,
      message: `H1 is "${doc.title}"; the contract title is "${spec.title}". Old format is a bug — rescan or rewrite this file.`,
    });
  }
  for (const section of spec.sections) {
    const found = findSection(doc, section.key);
    if (!found) {
      issues.push({
        code: 'legacy-format',
        file: spec.path,
        message: `Missing "## ${section.heading}". Old format is a bug — rescan or rewrite this file.`,
      });
      continue;
    }
    if (isAsciiTreeSection(section) && found.prose.trim().length > 0 && !hasFencedBlock(found.prose)) {
      issues.push({
        code: 'legacy-format',
        file: spec.path,
        message: `"## ${section.heading}" must be a fenced \`\`\`text block, not an essay.`,
      });
    }
    if (isMermaidFlowchartSection(section) && found.prose.trim().length > 0 && !hasMermaidFence(found.prose)) {
      issues.push({
        code: 'legacy-format',
        file: spec.path,
        message: `"## ${section.heading}" must be a fenced \`\`\`mermaid flowchart TD, not an ASCII tree or an essay.`,
      });
    }
  }
  return issues;
}
