import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  nowIso,
  parseProjectFacts,
  parseProjectRecommendation,
  type Capability,
  type CapabilityRequirement,
  type ProjectFact,
  type ProjectFacts,
  type ProjectRecommendation,
  type RecommendationEvidence,
  type StageRoleRecommendation,
} from '../contracts';

/** The small synchronous surface Project Intelligence needs from capability runtime. */
export interface CapabilityQuery {
  list(): Capability[];
  isEnabled(capabilityId: string): boolean;
}

export interface ProjectIntelligenceOptions {
  clock?: () => string;
  capabilities?: CapabilityQuery;
}

export interface RecommendationOverride {
  workflowProfile?: ProjectRecommendation['workflowProfile'];
  /** A complete replacement is intentional: a user may choose a leaner set of roles. */
  roles?: StageRoleRecommendation[];
}

export interface RecommendationLock {
  schemaVersion: 1;
  lockedAt: string;
  recommendation: ProjectRecommendation;
}

const IGNORED_ANALYSIS_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'coverage', '.aidlc']);

function projectPaths(root: string, limit = 10_000): string[] {
  const found: string[] = [];
  const queue = [''];
  while (queue.length && found.length < limit) {
    const relative = queue.shift()!;
    const directory = path.join(root, relative);
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (found.length >= limit) break;
      if (entry.isSymbolicLink() || (entry.isDirectory() && IGNORED_ANALYSIS_DIRS.has(entry.name))) continue;
      const child = path.join(relative, entry.name);
      found.push(child);
      if (entry.isDirectory()) queue.push(child);
    }
  }
  return found;
}

export class ProjectIntelligenceService {
  private readonly clock: () => string;
  private readonly capabilities?: CapabilityQuery;

  constructor(private readonly root: string, options: ProjectIntelligenceOptions | (() => string) = {}) {
    // Keep the original `(root, clock)` constructor ergonomic for existing callers.
    if (typeof options === 'function') {
      this.clock = options;
    } else {
      this.clock = options.clock ?? nowIso;
      this.capabilities = options.capabilities;
    }
  }

  contextFile(): string { return path.join(this.root, '.aidlc', 'project.yaml'); }
  proposalFile(): string { return path.join(this.root, '.aidlc', 'catalog', 'recommendation.proposal.yaml'); }
  recommendationLockFile(): string { return path.join(this.root, '.aidlc', 'catalog', 'recommendation.lock.yaml'); }
  loadContext(): ProjectFacts | null {
    if (!fs.existsSync(this.contextFile())) return null;
    return parseProjectFacts(yaml.load(fs.readFileSync(this.contextFile(), 'utf8')));
  }
  /** Read-only analysis; callers must explicitly call refreshContext to change revision. */
  analyze(projectId = path.basename(this.root), sourceCommit?: string): ProjectFacts {
    const facts: ProjectFact[] = [];
    const packagePath = path.join(this.root, 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
      facts.push({ key: 'languages', value: ['TypeScript'], evidence: [{ path: 'package.json' }], confidence: 0.95 });
      facts.push({ key: 'frameworks', value: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }), evidence: [{ path: 'package.json' }], confidence: 0.9 });
      facts.push({ key: 'build_test', value: pkg.scripts ?? {}, evidence: [{ path: 'package.json' }], confidence: 0.95 });
    }
    const names = projectPaths(this.root);
    const astGraph = path.join(this.root, '.ast-graph', 'graph.db');
    if (fs.existsSync(astGraph)) {
      const stat = fs.statSync(astGraph);
      facts.push({
        key: 'structural_graph',
        value: { provider: 'ast-graph', bytes: stat.size, updatedAt: stat.mtime.toISOString() },
        evidence: [{ path: '.ast-graph/graph.db' }],
        confidence: 1,
      });
    }
    const swift = names.filter((name) => name.endsWith('.swift'));
    if (swift.length || names.some((name) => name.endsWith('.xcodeproj')) || fs.existsSync(path.join(this.root, 'Package.swift'))) {
      facts.push({ key: 'platforms', value: ['iOS'], evidence: [{ path: swift[0] ?? 'Package.swift' }], confidence: 0.95 });
      facts.push({ key: 'languages', value: ['Swift'], evidence: [{ path: swift[0] ?? 'Package.swift' }], confidence: 0.98 });
    }
    const trading = names.some((name) => /trading|portfolio|stock|market/i.test(name));
    if (trading) facts.push({ key: 'domain', value: 'trading', evidence: [{ path: names.find((name) => /trading|portfolio|stock|market/i.test(name)) ?? '.' }], confidence: 0.85 });
    const ciPath = names.find((name) => name.startsWith(path.join('.github', 'workflows')) || /(?:^|\/)(?:\.gitlab-ci\.yml|Jenkinsfile)$/.test(name));
    if (ciPath) facts.push({ key: 'ci', value: path.basename(ciPath), evidence: [{ path: ciPath }], confidence: 0.95 });
    const monorepoEvidence = fs.existsSync(path.join(this.root, 'pnpm-workspace.yaml')) ? 'pnpm-workspace.yaml' : names.find((name) => name.startsWith(`packages${path.sep}`));
    facts.push({ key: 'architecture', value: monorepoEvidence ? 'monorepo' : 'single-project', evidence: [{ path: monorepoEvidence ?? '.' }], confidence: monorepoEvidence ? 0.95 : 0.7 });
    facts.push({ key: 'risk', value: trading ? 'high' : 'normal', evidence: [{ path: trading ? names.find((name) => /trading|portfolio|stock|market/i.test(name)) ?? '.' : '.' }], confidence: trading ? 0.9 : 0.65 });
    const directoryCounts = new Map<string, number>();
    for (const name of names.filter((candidate) => /\.(?:ts|tsx|js|jsx|swift|go|rs|py|java|kt)$/.test(candidate))) {
      const directory = name.split(path.sep)[0] ?? '.';
      directoryCounts.set(directory, (directoryCounts.get(directory) ?? 0) + 1);
    }
    const hotspots = [...directoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([directory, files]) => ({ path: directory, files }));
    facts.push({ key: 'hotspots', value: hotspots, evidence: hotspots.map((hotspot) => ({ path: hotspot.path })), confidence: hotspots.length ? 0.75 : 0.4 });
    if (this.capabilities) {
      const capabilities = this.capabilities.list().map((capability) => ({
        id: capability.id,
        category: capability.category,
        enabled: this.capabilities!.isEnabled(capability.id),
      }));
      facts.push({ key: 'capabilities', value: capabilities, evidence: capabilities.map((capability) => ({ path: `.aidlc/capabilities/${capability.id}` })), confidence: 1 });
    }
    return { schemaVersion: 1, projectId, generatedAt: this.clock(), revision: this.loadContext()?.revision ?? 0, sourceCommit, analysisStatus: 'published', facts };
  }
  /** The only operation that persists/bump revisions. */
  refreshContext(projectId = path.basename(this.root), sourceCommit?: string): ProjectFacts {
    const previous = this.loadContext();
    const facts = this.analyze(projectId, sourceCommit);
    const next = {
      ...facts,
      analysisStatus: 'published' as const,
      revision: previous?.analysisStatus === 'uninitialized' ? 0 : (previous?.revision ?? -1) + 1,
    };
    fs.mkdirSync(path.dirname(this.contextFile()), { recursive: true });
    const temp = `${this.contextFile()}.tmp`;
    fs.writeFileSync(temp, yaml.dump(parseProjectFacts(next), { noRefs: true }), 'utf8');
    fs.renameSync(temp, this.contextFile());
    return next;
  }
  contextStatus(sourceCommit?: string): { context: ProjectFacts | null; stale: boolean } {
    const context = this.loadContext();
    return {
      context,
      stale: Boolean(context?.analysisStatus === 'uninitialized' || (context?.sourceCommit && sourceCommit && context.sourceCommit !== sourceCommit)),
    };
  }
  recommend(facts: ProjectFacts): ProjectRecommendation {
    const values = facts.facts.map((fact) => JSON.stringify(fact.value)).join(' ').toLowerCase();
    const ios = values.includes('ios') || values.includes('swift');
    const trading = values.includes('trading');
    const iosEvidence = this.recommendationEvidence(facts, ['languages', 'platforms'], 'Swift/iOS project evidence supports this role.');
    const tradingEvidence = this.recommendationEvidence(facts, ['domain'], 'Trading-domain evidence requires invariant and decimal-safety review.');
    const roles = ios ? [
      { stageId: 'build' as const, agent: 'senior-ios-developer', skills: ['swift', 'ios'], modelTier: 'balanced' as const, confidence: 0.9, reason: 'iOS/Swift evidence detected.', evidence: iosEvidence },
      { stageId: 'verify' as const, agent: 'ios-reviewer', skills: ['xctest', 'ios-security', ...(trading ? ['trading-invariants', 'financial-precision'] : [])], modelTier: 'review' as const, confidence: trading ? 0.95 : 0.85, reason: trading ? 'Trading domain requires financial precision review.' : 'iOS review is recommended.', evidence: trading ? [...iosEvidence, ...tradingEvidence] : iosEvidence },
    ] : [];
    return { schemaVersion: 1, projectId: facts.projectId, generatedAt: this.clock(), workflowProfile: trading ? 'regulated' : 'standard', roles, status: 'proposed' };
  }

  capabilityRequirements(facts: ProjectFacts, epicRequest = ''): CapabilityRequirement[] {
    const values = `${facts.facts.map((fact) => JSON.stringify(fact.value)).join(' ')} ${epicRequest}`.toLowerCase();
    const requirements: CapabilityRequirement[] = [{ capabilityId: 'ast-graph', optional: false, reason: 'Structural project facts and code impact analysis require the bundled AST graph.' }];
    if (/trading|financial|regulated|review|artifact/.test(values)) {
      requirements.push({ capabilityId: 'artifact-annotation', optional: false, reason: 'Risk-sensitive review requires contextual artifact annotation.' });
    }
    return requirements;
  }

  /** Generate and persist a proposal only; no workflow selection is changed. */
  propose(facts: ProjectFacts): ProjectRecommendation {
    const proposal = this.recommend(facts);
    this.saveRecommendation(this.proposalFile(), proposal);
    return proposal;
  }

  loadProposal(): ProjectRecommendation | null {
    return this.loadRecommendation(this.proposalFile());
  }

  /** Explicit acknowledgement of an existing proposal. This is not a lock. */
  accept(proposal: ProjectRecommendation = this.requireProposal()): ProjectRecommendation {
    this.assertProjectRecommendation(proposal);
    const accepted: ProjectRecommendation = { ...proposal, status: 'accepted' };
    this.saveRecommendation(this.proposalFile(), accepted);
    return accepted;
  }

  /** Explicit user override, retained as a first-class, auditable choice. */
  override(override: RecommendationOverride, proposal: ProjectRecommendation = this.requireProposal()): ProjectRecommendation {
    this.assertProjectRecommendation(proposal);
    const selected: ProjectRecommendation = {
      ...proposal,
      workflowProfile: override.workflowProfile ?? proposal.workflowProfile,
      roles: override.roles ? override.roles.map((role) => ({ ...role, skills: [...role.skills], evidence: [...role.evidence] })) : proposal.roles,
      status: 'overridden',
    };
    this.saveRecommendation(this.proposalFile(), selected);
    return selected;
  }

  /**
   * The lock is the only durable selection a run may consume. Requiring an
   * accepted/overridden proposal prevents analyzer output from silently
   * changing a project's model/agent/skill choices.
   */
  lock(selection: ProjectRecommendation = this.requireProposal()): RecommendationLock {
    this.assertProjectRecommendation(selection);
    if (selection.status !== 'accepted' && selection.status !== 'overridden' && selection.status !== 'locked') {
      throw new Error('Accept or override a recommendation before locking it.');
    }
    const lockedRecommendation: ProjectRecommendation = { ...selection, status: 'locked' };
    const lock: RecommendationLock = { schemaVersion: 1, lockedAt: this.clock(), recommendation: lockedRecommendation };
    this.atomicYamlWrite(this.recommendationLockFile(), lock);
    return lock;
  }

  loadRecommendationLock(): RecommendationLock | null {
    const file = this.recommendationLockFile();
    if (!fs.existsSync(file)) return null;
    try {
      const raw = yaml.load(fs.readFileSync(file, 'utf8')) as { schemaVersion?: unknown; lockedAt?: unknown; recommendation?: unknown };
      if (raw?.schemaVersion !== 1 || typeof raw.lockedAt !== 'string') throw new Error('expected schemaVersion 1 and lockedAt');
      return { schemaVersion: 1, lockedAt: raw.lockedAt, recommendation: parseProjectRecommendation(raw.recommendation) };
    } catch (error) {
      throw new Error(`Invalid recommendation lock at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private requireProposal(): ProjectRecommendation {
    const proposal = this.loadProposal();
    if (!proposal) throw new Error('No recommendation proposal exists. Run project analysis and propose first.');
    return proposal;
  }

  private recommendationEvidence(facts: ProjectFacts, keys: string[], note: string): RecommendationEvidence[] {
    return facts.facts
      .filter((fact) => keys.includes(fact.key))
      .flatMap((fact) => fact.evidence.length
        ? fact.evidence.map((evidence) => ({ factKey: fact.key, path: evidence, note }))
        : [{ factKey: fact.key, note }]);
  }

  private assertProjectRecommendation(recommendation: ProjectRecommendation): void {
    parseProjectRecommendation(recommendation);
  }

  private loadRecommendation(file: string): ProjectRecommendation | null {
    if (!fs.existsSync(file)) return null;
    try {
      return parseProjectRecommendation(yaml.load(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      throw new Error(`Invalid recommendation proposal at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private saveRecommendation(file: string, recommendation: ProjectRecommendation): void {
    this.assertProjectRecommendation(recommendation);
    this.atomicYamlWrite(file, recommendation);
  }

  private atomicYamlWrite(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, yaml.dump(value, { noRefs: true, lineWidth: 120 }), 'utf8');
    fs.renameSync(temp, file);
  }
}
