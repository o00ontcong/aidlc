import { describe, it, expect } from 'vitest';

import {
  ProjectFactsSchema,
  parseProjectFacts,
  ProjectRecommendationSchema,
  parseProjectRecommendation,
  type ProjectFacts,
  type ProjectRecommendation,
} from '../src/contracts/project';

function sampleFacts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    schemaVersion: 1,
    projectId: 'ios-trading-app',
    generatedAt: '2026-08-09T09:00:00.000Z',
    revision: 1,
    sourceCommit: 'abc123',
    facts: [
      { key: 'platforms', value: ['ios'], evidence: [{ path: 'Podfile' }] },
      { key: 'languages', value: ['swift'], evidence: [{ path: 'Sources/App.swift' }] },
      { key: 'domain', value: ['trading', 'portfolio-management'], evidence: [{ path: 'Sources/Portfolio' }] },
    ],
    ...overrides,
  };
}

// iOS trading fixture, matching the design doc §6.4 example the recommendation must reproduce.
function sampleRecommendation(overrides: Partial<ProjectRecommendation> = {}): ProjectRecommendation {
  return {
    schemaVersion: 1,
    projectId: 'ios-trading-app',
    generatedAt: '2026-08-09T09:05:00.000Z',
    workflowProfile: 'standard',
    status: 'proposed',
    roles: [
      {
        stageId: 'plan',
        agent: 'ios-architect',
        skills: ['swift-architecture', 'swift-concurrency', 'trading-domain'],
        modelTier: 'deep',
        confidence: 0.9,
        reason: 'High-risk domain requires architecture-level review before implementation.',
        evidence: [{ factKey: 'domain', note: 'Project handles trading/portfolio-management, a financial-precision domain.' }],
      },
      {
        stageId: 'build',
        agent: 'senior-ios-developer',
        skills: ['swiftui', 'swift-concurrency', 'financial-decimal-safety'],
        modelTier: 'balanced',
        confidence: 0.85,
        reason: 'Project handles price/portfolio and uses floating-point in the domain layer.',
        evidence: [{ factKey: 'domain', note: 'Recommend financial-decimal-safety because of price/portfolio handling.' }],
      },
    ],
    ...overrides,
  };
}

describe('ProjectFacts — facts carry evidence, not confidence (design doc §6.1)', () => {
  it('round-trips through JSON unchanged', () => {
    const original = sampleFacts();
    const parsed = parseProjectFacts(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('revision only changes via an explicit refresh (design doc §0.3) — this contract just carries the number, the no-drift-refresh behavior is a later wave (W1D)', () => {
    const facts = sampleFacts({ revision: 1 });
    expect(facts.revision).toBe(1);
  });
});

describe('ProjectFacts — backward compatibility', () => {
  it('parses an older payload missing sourceCommit (optional)', () => {
    const legacy: Record<string, unknown> = { ...sampleFacts() };
    delete legacy.sourceCommit;
    const parsed = parseProjectFacts(legacy);
    expect(parsed.sourceCommit).toBeUndefined();
  });

  it('parses an older payload with an empty facts array', () => {
    expect(() => parseProjectFacts(sampleFacts({ facts: [] }))).not.toThrow();
  });
});

describe('ProjectRecommendation — iOS trading fixture matches design doc §6.4 shape', () => {
  it('round-trips through JSON unchanged', () => {
    const original = sampleRecommendation();
    const parsed = parseProjectRecommendation(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('recommends senior-ios-developer with financial-decimal-safety for build, with evidence and confidence', () => {
    const rec = sampleRecommendation();
    const build = rec.roles.find((r) => r.stageId === 'build');
    expect(build?.agent).toBe('senior-ios-developer');
    expect(build?.skills).toContain('financial-decimal-safety');
    expect(build?.confidence).toBeGreaterThan(0);
    expect(build?.evidence.length).toBeGreaterThan(0);
  });

  it('rejects a confidence outside [0,1]', () => {
    const bad = sampleRecommendation({
      roles: [{ ...sampleRecommendation().roles[0], confidence: 1.5 }],
    });
    expect(ProjectRecommendationSchema.safeParse(bad).success).toBe(false);
  });

  it('follows the propose -> accept/override -> lock lifecycle (design doc §6.5)', () => {
    for (const status of ['proposed', 'accepted', 'overridden', 'locked'] as const) {
      expect(ProjectRecommendationSchema.safeParse(sampleRecommendation({ status })).success).toBe(true);
    }
  });
});

describe('ProjectRecommendation — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older payload where roles omit skills/evidence (both default to [])', () => {
    const legacy = sampleRecommendation({
      roles: [
        {
          stageId: 'build',
          agent: 'senior-ios-developer',
          modelTier: 'balanced',
          confidence: 0.8,
          reason: 'legacy payload',
        } as ProjectRecommendation['roles'][number],
      ],
    });
    const raw = JSON.parse(JSON.stringify(legacy));
    delete raw.roles[0].skills;
    delete raw.roles[0].evidence;

    const parsed = parseProjectRecommendation(raw);
    expect(parsed.roles[0].skills).toEqual([]);
    expect(parsed.roles[0].evidence).toEqual([]);
  });
});
