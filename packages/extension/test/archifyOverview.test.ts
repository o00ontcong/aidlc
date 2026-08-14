import { describe, expect, it } from 'vitest';

import { buildArchifyOverviewSpec, buildArchifySvgPreview } from '../src/v2/archifyOverview';

describe('Archify overview adapter', () => {
  it('converts the curated layer graph without inventing nodes or edges', () => {
    const spec = buildArchifyOverviewSpec('/work/demo-app', [
      { id: 'presentation', label: 'Presentation', role: 'React web UI' },
      { id: 'identity', label: 'Identity', role: 'Authentication and access control' },
      { id: 'events', label: 'Events', role: 'Message queue and workers' },
      { id: 'data', label: 'Data', role: 'Persistence and cache' },
    ], [
      { source: 'presentation', target: 'identity', label: 'authenticates with' },
      { source: 'presentation', target: 'events', label: 'publishes' },
      { source: 'events', target: 'data', label: 'persists' },
      { source: 'unknown', target: 'data', label: 'must be dropped' },
    ]);

    expect(spec.meta.title).toBe('demo-app architecture');
    expect(spec.components.map((component) => component.type)).toEqual(['frontend', 'security', 'messagebus', 'database']);
    expect(spec.components.every((component) => component.size[0] >= 180)).toBe(true);
    expect(spec.components.map((component) => [component.row, component.col])).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
    expect(spec.connections).toEqual([
      { id: 'connection_1', from: 'presentation', to: 'identity' },
      { id: 'connection_3', from: 'events', to: 'data' },
    ]);
  });

  it('limits a presentation overview to a human-scale set of layers', () => {
    const spec = buildArchifyOverviewSpec('/work/demo', Array.from({ length: 20 }, (_, index) => ({
      id: `layer-${index}`,
      label: `Layer ${index}`,
    })), []);

    expect(spec.components).toHaveLength(8);
    expect(spec.layout.cols).toBe(8);
  });

  it('extracts a passive styled SVG preview from the standalone HTML', () => {
    const preview = buildArchifySvgPreview(`<!doctype html><html><head><style>:root { --ink: #fff; } .node { fill: var(--ink); }</style></head><body><svg viewBox="0 0 20 10"><g data-legend><rect class="node" width="20" height="10" /></g></svg><script>throw new Error('must not run')</script></body></html>`);

    expect(preview).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(preview).toContain('<![CDATA[:root { --ink: #fff; }');
    expect(preview).toContain('<rect class="node"');
    expect(preview).toContain('data-legend=""');
    expect(preview).not.toContain('<script>');
  });
});
