import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectIntelligenceService } from '../src/project';

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
  expect(service.refreshContext('trader', 'b2').revision).toBe(1);
});
