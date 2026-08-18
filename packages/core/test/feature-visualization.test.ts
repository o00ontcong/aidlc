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
    discovery: {
      method: 'mission path + cited files',
      sources: ['apps/web/CheckoutView.tsx', 'apps/api/charge.ts'],
      unknowns: [],
    },
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
    discovery: {
      method: 'mission systems + cited files',
      sources: ['apps/api/charge.ts'],
      unknowns: [],
    },
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

  it('rejects a flow without discovery', async () => {
    const dir = epicArtifacts(root);
    writeCodeFlow(dir);
    const flow = JSON.parse(fs.readFileSync(path.join(dir, 'FEATURE-FLOW.json'), 'utf8'));
    delete flow.discovery;
    fs.writeFileSync(path.join(dir, 'FEATURE-FLOW.json'), `${JSON.stringify(flow, null, 2)}\n`);
    writeSurfaces(dir);
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/discovery/);
  });

  it('rejects when SCREEN-CATALOG has another destination on a file this flow already cites', async () => {
    const dir = epicArtifacts(root);
    writeCodeFlow(dir);
    writeSurfaces(dir);
    const viz = path.join(root, 'docs', 'project', 'context', 'visualization');
    fs.mkdirSync(viz, { recursive: true });
    fs.writeFileSync(path.join(viz, 'SCREEN-CATALOG.json'), `${JSON.stringify({
      schemaVersion: 1,
      screens: [
        { id: 'checkout', name: 'Checkout', evidence: ['apps/web/CheckoutView.tsx'], confidence: 'high' },
        { id: 'checkout-otp', name: 'Checkout OTP', evidence: ['apps/web/CheckoutView.tsx'], confidence: 'high' },
      ],
    }, null, 2)}\n`);
    const v = await runner(ctx());
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/checkout-otp/);
  });
});

describe('mission-completeness.mjs pack + briefing graphs', () => {
  let root: string;
  let runner: Runner;

  beforeEach(async () => {
    runner = await loadRunner('mission-completeness.mjs');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-mission-briefing-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const COMPLETE = `# MISSION

## Summary
Checkout refunds.

## Problem / Goal
Users cannot refund.

## In scope
Partial refunds.

## Out of scope
Chargebacks.

## Functional requirements
- PAY-FR01 Serves: G-1

## Acceptance criteria
- Given a capture, when refund, then wallet updates.

## Constraints
INV-1: no shared contract rewrite.

## Tasks
- PAY-T01 Implements: PAY-FR01 AC: refund API \`src/refund.ts\`

## UI spec
N/A — no UI change

## Flow
\`\`\`mermaid
flowchart LR
  view --> api
\`\`\`

## Definition of done
AC pass on device.
`;

  function writeCatalogAndImpact(dir: string) {
    const viz = path.join(root, 'docs', 'project', 'context', 'visualization');
    fs.mkdirSync(viz, { recursive: true });
    fs.writeFileSync(path.join(viz, 'FEATURE-CATALOG.json'), `${JSON.stringify({
      schemaVersion: 1,
      features: [{ id: 'auth', name: 'Auth', confidence: 'high', evidence: ['src/auth.ts'] }],
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'FEATURE-IMPACT.json'), `${JSON.stringify({
      schemaVersion: 1,
      epicId: 'FEAT-1',
      features: [{ id: 'payments', name: 'Payments', change: 'add', summary: 'Checkout' }],
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'FEATURE-IMPACT.mmd'), 'flowchart TD\n  app --> payments\n');
  }

  it('rejects a complete MISSION.md that has no briefing graphs', async () => {
    const dir = epicArtifacts(root);
    fs.writeFileSync(path.join(dir, 'MISSION.md'), COMPLETE);
    const v = await runner({ workspaceRoot: root, state: { runId: 'FEAT-1' } });
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/FEATURE-FLOW|FEATURE-SURFACES|FEATURE-IMPACT/);
  });

  it('passes when pack, flow, surfaces, and impact agree', async () => {
    const dir = epicArtifacts(root);
    fs.writeFileSync(path.join(dir, 'MISSION.md'), COMPLETE);
    writeCodeFlow(dir);
    writeSurfaces(dir);
    writeCatalogAndImpact(dir);
    const v = await runner({ workspaceRoot: root, state: { runId: 'FEAT-1' } });
    expect(v.decision).toBe('pass');
  });

  it('rejects when MISSION flow mermaid tells a different story than FEATURE-FLOW.mmd', async () => {
    const dir = epicArtifacts(root);
    fs.writeFileSync(path.join(dir, 'MISSION.md'), COMPLETE);
    writeCodeFlow(dir);
    fs.writeFileSync(path.join(dir, 'FEATURE-FLOW.mmd'), 'flowchart LR\n  other --> path\n');
    writeSurfaces(dir);
    writeCatalogAndImpact(dir);
    const v = await runner({ workspaceRoot: root, state: { runId: 'FEAT-1' } });
    expect(v.decision).toBe('reject');
    expect(v.reason).toMatch(/must match FEATURE-FLOW.mmd/);
  });
});
