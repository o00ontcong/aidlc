import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { nowIso, type ProjectFact, type ProjectFacts, type ProjectRecommendation } from '../contracts';

export class ProjectIntelligenceService {
  constructor(private readonly root: string, private readonly clock: () => string = nowIso) {}
  contextFile(): string { return path.join(this.root, '.aidlc', 'project.yaml'); }
  loadContext(): ProjectFacts | null {
    if (!fs.existsSync(this.contextFile())) return null;
    return yaml.load(fs.readFileSync(this.contextFile(), 'utf8')) as ProjectFacts;
  }
  /** Read-only analysis; callers must explicitly call refreshContext to change revision. */
  analyze(projectId = path.basename(this.root), sourceCommit?: string): ProjectFacts {
    const facts: ProjectFact[] = [];
    const packagePath = path.join(this.root, 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
      facts.push({ key: 'languages', value: ['TypeScript'], evidence: [{ path: 'package.json' }] });
      facts.push({ key: 'frameworks', value: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }), evidence: [{ path: 'package.json' }] });
      facts.push({ key: 'build_test', value: pkg.scripts ?? {}, evidence: [{ path: 'package.json' }] });
    }
    const names = fs.readdirSync(this.root, { recursive: true }).map(String).slice(0, 10_000);
    const swift = names.filter((name) => name.endsWith('.swift'));
    if (swift.length || names.some((name) => name.endsWith('.xcodeproj')) || fs.existsSync(path.join(this.root, 'Package.swift'))) {
      facts.push({ key: 'platforms', value: ['iOS'], evidence: [{ path: swift[0] ?? 'Package.swift' }] });
      facts.push({ key: 'languages', value: ['Swift'], evidence: [{ path: swift[0] ?? 'Package.swift' }] });
    }
    const trading = names.some((name) => /trading|portfolio|stock|market/i.test(name));
    if (trading) facts.push({ key: 'domain', value: 'trading', evidence: [{ path: names.find((name) => /trading|portfolio|stock|market/i.test(name)) ?? '.' }] });
    return { schemaVersion: 1, projectId, generatedAt: this.clock(), revision: this.loadContext()?.revision ?? 0, sourceCommit, facts };
  }
  /** The only operation that persists/bump revisions. */
  refreshContext(projectId = path.basename(this.root), sourceCommit?: string): ProjectFacts {
    const previous = this.loadContext();
    const facts = this.analyze(projectId, sourceCommit);
    const next = { ...facts, revision: (previous?.revision ?? -1) + 1 };
    fs.mkdirSync(path.dirname(this.contextFile()), { recursive: true });
    fs.writeFileSync(this.contextFile(), yaml.dump(next, { noRefs: true }), 'utf8');
    return next;
  }
  contextStatus(sourceCommit?: string): { context: ProjectFacts | null; stale: boolean } {
    const context = this.loadContext();
    return { context, stale: Boolean(context?.sourceCommit && sourceCommit && context.sourceCommit !== sourceCommit) };
  }
  recommend(facts: ProjectFacts): ProjectRecommendation {
    const values = facts.facts.map((fact) => JSON.stringify(fact.value)).join(' ').toLowerCase();
    const ios = values.includes('ios') || values.includes('swift');
    const trading = values.includes('trading');
    const roles = ios ? [
      { stageId: 'build' as const, agent: 'senior-ios-developer', skills: ['swift', 'ios'], modelTier: 'balanced' as const, confidence: 0.9, reason: 'iOS/Swift evidence detected.', evidence: [] },
      { stageId: 'verify' as const, agent: 'ios-reviewer', skills: ['xctest', 'ios-security', ...(trading ? ['trading-invariants', 'financial-precision'] : [])], modelTier: 'review' as const, confidence: trading ? 0.95 : 0.85, reason: trading ? 'Trading domain requires financial precision review.' : 'iOS review is recommended.', evidence: [] },
    ] : [];
    return { schemaVersion: 1, projectId: facts.projectId, generatedAt: this.clock(), workflowProfile: trading ? 'regulated' : 'standard', roles, status: 'proposed' };
  }
}
