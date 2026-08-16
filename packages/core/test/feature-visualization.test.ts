import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const VALIDATORS = path.join(__dirname, '..', 'templates', 'cohesive', 'validators');

type Verdict = { decision: 'pass' | 'reject'; reason: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runner = (ctx: any) => Promise<Verdict>;

async function loadRunner(name: string): Promise<Runner> {
  const mod = await import(pathToFileURL(path.join(VALIDATORS, name)).href);
  return mod.default;
}

function epicArtifacts(root: string, epic = 'FEAT-1') {
  const dir = path.join(root, 'docs', 'epics', epic, 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCodeFlow(dir: string) {
  fs.writeFileSync(path.join(dir, 'FEATURE-FLOW.json'), `${JSON.stringify({
    schemaVersion: 1,
    featureId: 'payments',
    title: 'Checkout',
    nodes: [
      { id: 'view', label: 'CheckoutView', file: 'apps/web/CheckoutView.tsx', layer: 'presentation', role: 'Starts pay' },
      { id: 'api', label: 'charge', file: 'apps/api/charge.ts', layer: 'data', role: 'Charges card' },
    ],
    edges: [{ source: 'view', target: 'api', label: 'submit', confidence: 'observed' }],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'FEATURE-FLOW.mmd'), 'flowchart LR\n  view --> api\n');
}

function writeSurfaces(dir: string, extra: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(dir, 'FEATURE-SURFACES.json'), `${JSON.stringify({
    schemaVersion: 1,
    epicId: 'FEAT-1',
    title: 'Checkout payments',
    nodes: [
      { id: 'web', label: 'Web Checkout', kind: 'web', role: 'Starts payment' },
      { id: 'payments-api', label: 'Payments API', kind: 'api', file: 'apps/api/charge.ts', role: 'Charges' },
      { id: 'stripe', label: 'Stripe', kind: 'external', role: 'Card processing' },
    ],
    edges: [
      { source: 'web', target: 'payments-api', label: 'REST', kind: 'http', confidence: 'observed' },
      { source: 'payments-api', target: 'stripe', label: 'SDK', kind: 'sdk', confidence: 'inferred' },
    ],
    ...extra,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'FEATURE-SURFACES.mmd'), 'flowchart LR\n  web --> api\n  api --> stripe\n');
}

describe('feature-flow.mjs surfaces + code flow', () => {
  let root: string;
  let runner: Runner;

  beforeEach(async () => {
    runner = await loadRunner('feature-flow.mjs');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-feature-flow-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const ctx = () => ({ workspaceRoot: root, state: { runId: 'FEAT-1' } });

  it('rejects when system surfaces are missing', async () => {
    const dir = epicArtifacts(root);
    writeCodeFlow(dir);
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/FEATURE-SURFACES/);
  });

  it('passes a code flow plus frontend/backend/external surfaces', async () => {
    const dir = epicArtifacts(root);
    writeCodeFlow(dir);
    writeSurfaces(dir);
    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });

  it('rejects an invented file on an external SDK node', async () => {
    const dir = epicArtifacts(root);
    writeCodeFlow(dir);
    writeSurfaces(dir, {
      nodes: [
        { id: 'web', label: 'Web', kind: 'web', role: 'UI' },
        { id: 'stripe', label: 'Stripe', kind: 'external', file: 'vendor/stripe.ts', role: 'Cards' },
      ],
      edges: [{ source: 'web', target: 'stripe', kind: 'sdk' }],
    });
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/must not invent a workspace file/);
  });

  it('allows a first-party SDK wrapper to cite a workspace file', async () => {
    const dir = epicArtifacts(root);
    writeCodeFlow(dir);
    writeSurfaces(dir, {
      nodes: [
        { id: 'web', label: 'Web', kind: 'web', role: 'UI' },
        { id: 'payments-sdk', label: 'Payments SDK', kind: 'sdk', file: 'packages/payments-sdk/src/index.ts', role: 'Client' },
        { id: 'stripe', label: 'Stripe', kind: 'external', role: 'Cards' },
      ],
      edges: [
        { source: 'web', target: 'payments-sdk', kind: 'sdk' },
        { source: 'payments-sdk', target: 'stripe', kind: 'sdk' },
      ],
    });
    const v = await runner(ctx());
    expect(v.decision).toBe('pass');
  });
});
