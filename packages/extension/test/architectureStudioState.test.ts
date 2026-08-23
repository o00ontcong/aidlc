import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { architectureStudioArtifactPath, readArchitectureStudio } from '../src/v2/architectureStudioState';

const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-architecture-studio-'));
  roots.push(root);
  return root;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Architecture Studio state', () => {
  it('ships an agent command with an explicit Epic isolation boundary', () => {
    const command = fs.readFileSync(
      path.resolve(__dirname, '..', 'assets', 'architecture-studio-generate.skill.md'),
      'utf8',
    );

    expect(command).toContain('docs/project/architecture/ARCHITECTURE-STUDIO.json');
    expect(command).toContain('Do not read anything under `docs/epics/**`');
    expect(command).toContain('Do not read anything under `.aidlc/runs/**`');
  });

  it('builds every perspective from the standalone Architecture Studio manifest', () => {
    const root = tempRoot();
    writeJson(architectureStudioArtifactPath(root), {
      schemaVersion: 1,
      revision: 7,
      generatedAt: '2026-08-23T00:00:00.000Z',
      system: {
        nodes: [
          { id: 'app', label: 'App', role: 'focal', file: 'apps/app.ts', evidence: ['apps/app.ts'] },
          { id: 'api', label: 'API', kind: 'service' },
        ],
        edges: [{ id: 'app-api', from: 'app', to: 'api', protocol: 'HTTPS', kind: 'integration' }],
      },
      layers: {
        nodes: [{ id: 'interface', label: 'Interface', layer: 'interface' }, { id: 'service', label: 'Service', layer: 'backend' }],
        edges: [{ source: 'interface', target: 'service' }],
      },
      features: [{ id: 'auth', name: 'Authentication', module: 'Identity', entrypoints: [{ symbol: 'signIn', file: 'apps/sign-in.ts' }] }],
      screens: [{ id: 'login', name: 'Login' }, { id: 'home', name: 'Home' }],
      screenEdges: [{ source: 'login', target: 'home', label: 'Sign in' }],
      flows: [{
        featureId: 'auth',
        title: 'Sign in',
        nodes: [{ id: 'form', label: 'Credentials' }, { id: 'session', label: 'Session' }],
        edges: [{ from: 'form', to: 'session', label: 'submit' }],
      }],
    });
    // A similarly-shaped Epic artifact must never leak into Architecture Studio.
    writeJson(path.join(root, 'docs', 'epics', 'EPIC-42', 'artifacts', 'FEATURE-FLOW.json'), {
      featureId: 'legacy-epic-flow',
      nodes: [{ id: 'epic-a', label: 'Epic A' }, { id: 'epic-b', label: 'Epic B' }],
      edges: [{ from: 'epic-a', to: 'epic-b' }],
    });

    const studio = readArchitectureStudio(root);

    expect(studio).toMatchObject({ available: true, revision: '7', freshness: 'fresh' });
    expect(studio.nodes).toContainEqual(expect.objectContaining({ id: 'app', role: 'focal', file: 'apps/app.ts', evidence: ['apps/app.ts'] }));
    expect(studio.edges).toContainEqual(expect.objectContaining({ id: 'app-api', source: 'app', target: 'api', protocol: 'HTTPS', role: 'integration' }));
    expect(studio.features).toContainEqual(expect.objectContaining({ id: 'auth', module: 'Identity', entrypoints: [{ label: 'signIn', file: 'apps/sign-in.ts', symbol: 'signIn' }] }));
    expect(studio.screenEdges).toContainEqual(expect.objectContaining({ source: 'login', target: 'home', label: 'Sign in' }));
    expect(studio.structuralNodes).toContainEqual(expect.objectContaining({ id: 'service', layer: 'backend' }));
    expect(studio.featureFlows.auth).toMatchObject({ title: 'Sign in' });
    expect(studio.featureFlows.auth.nodes).toContainEqual(expect.objectContaining({ id: 'form' }));
    expect(studio.featureFlows.auth.edges).toContainEqual(expect.objectContaining({ source: 'form', target: 'session', label: 'submit' }));
    expect(studio.featureFlows['legacy-epic-flow']).toBeUndefined();
    expect(studio.sourcePaths).toEqual(['docs/project/architecture/ARCHITECTURE-STUDIO.json']);
  });

  it('reports an unavailable studio when no visual artifacts exist', () => {
    const studio = readArchitectureStudio(tempRoot());

    expect(studio).toMatchObject({ available: false, freshness: 'unknown' });
    expect(studio.message).toContain('Architecture Agent');
    expect(studio.warnings).toHaveLength(0);
  });
});
