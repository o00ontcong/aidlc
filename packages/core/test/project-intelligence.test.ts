import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectIntelligenceService } from '../src/project';
import { benchmarkNonBlocking } from '../src/release';
import { CapabilityRegistry } from '../src/capabilities';

it('only changes Project Context revision through explicit refresh and recommends iOS trading roles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-ios-trading-'));
  fs.writeFileSync(path.join(root, 'Package.swift'), '// swift package');
  fs.mkdirSync(path.join(root, 'Trading'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Trading', 'Portfolio.swift'), 'struct Portfolio {}');
  const service = new ProjectIntelligenceService(root, () => '2026-08-09T00:00:00.000Z');
  const analysis = service.analyze('trader', 'a1');
  expect(analysis.revision).toBe(0);
  expect(service.loadContext()).toBeNull();
  const saved = service.refreshContext('trader', 'a1');
  expect(saved.revision).toBe(0);
  expect(service.contextStatus('b2').stale).toBe(true);
  const recommendation = service.recommend(saved);
  expect(recommendation.roles.map((role) => role.agent)).toContain('senior-ios-developer');
  expect(recommendation.roles.find((role) => role.stageId === 'verify')?.skills).toContain('financial-precision');
  expect(recommendation.roles.every((role) => role.evidence.length > 0)).toBe(true);
  expect(saved.facts.every((fact) => typeof fact.confidence === 'number')).toBe(true);
  expect(service.capabilityRequirements(saved, 'regulated portfolio review').map((requirement) => requirement.capabilityId)).toEqual(['ast-graph', 'artifact-annotation']);
  expect(service.refreshContext('trader', 'b2').revision).toBe(1);
});

it('analyzes a large-repo fixture within the CI budget and consumes an existing AST graph as structural evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-project-large-'));
  fs.mkdirSync(path.join(root, '.ast-graph'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ast-graph', 'graph.db'), Buffer.alloc(1024));
  for (let index = 0; index < 1_000; index += 1) {
    const directory = path.join(root, 'packages', `package-${Math.floor(index / 100)}`, 'src');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `module-${index}.ts`), `export const value${index} = ${index};\n`);
  }
  const project = new ProjectIntelligenceService(root);
  const benchmark = await benchmarkNonBlocking(() => project.analyze('large-fixture'), 5_000);
  expect(benchmark.withinBudget).toBe(true);
  const facts = benchmark.value as ReturnType<ProjectIntelligenceService['analyze']>;
  expect(facts.facts).toContainEqual(expect.objectContaining({ key: 'structural_graph', evidence: [{ path: '.ast-graph/graph.db' }] }));
  expect(facts.facts.find((fact) => fact.key === 'hotspots')).toBeDefined();
});

it('keeps proposal, explicit accept or override, and locked selection separate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-recommendation-'));
  fs.writeFileSync(path.join(root, 'Package.swift'), '// swift package');
  const capabilities = new CapabilityRegistry({ 'test-agent': true });
  const service = new ProjectIntelligenceService(root, { clock: () => '2026-08-09T00:00:00.000Z', capabilities });
  const facts = service.refreshContext('ios-app', 'a1');
  expect(facts.facts.find((fact) => fact.key === 'capabilities')?.value).toContainEqual(expect.objectContaining({ id: 'test-agent', enabled: true }));

  const proposed = service.propose(facts);
  expect(proposed.status).toBe('proposed');
  expect(() => service.lock(proposed)).toThrow('Accept or override');
  const overridden = service.override({ workflowProfile: 'quick', roles: [] });
  expect(overridden).toMatchObject({ status: 'overridden', workflowProfile: 'quick', roles: [] });
  const lock = service.lock(overridden);
  expect(lock.recommendation.status).toBe('locked');
  expect(service.loadRecommendationLock()).toEqual(lock);

  const accepted = service.accept(service.propose(facts));
  expect(accepted.status).toBe('accepted');
});
