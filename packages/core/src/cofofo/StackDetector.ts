import * as fs from 'fs';
import * as path from 'path';

import { StackProfileSchema, type CofofoStackId, type StackProfile } from './contracts';
import { hashFile } from './hash';

interface StackDefinition {
  id: CofofoStackId;
  language: string;
  primary: (relative: string) => boolean;
  supporting: (relative: string) => boolean;
  describe: (file: string, body: string) => {
    version: string;
    packageManager: string;
    buildSystem: string;
    buildCommandId: string;
    testCommandId: string;
  };
}

const DEFINITIONS: StackDefinition[] = [
  {
    id: 'ios-swift', language: 'Swift',
    primary: (relative) => relative.endsWith('Package.swift') || relative.endsWith('project.pbxproj'),
    supporting: (relative) => relative.endsWith('Package.resolved'),
    describe: (file, body) => {
      const tools = body.match(/swift-tools-version\s*:\s*([0-9.]+)/)?.[1] ?? 'unknown';
      const xcode = file.endsWith('project.pbxproj');
      return {
        version: tools,
        packageManager: xcode ? 'xcode' : 'swiftpm',
        buildSystem: xcode ? 'xcodebuild' : 'swift',
        buildCommandId: xcode ? 'swift.xcode-build' : 'swift.build',
        testCommandId: xcode ? 'swift.xcode-test' : 'swift.test',
      };
    },
  },
  {
    id: 'node-typescript', language: 'TypeScript/JavaScript',
    primary: (relative) => relative.endsWith('package.json'),
    supporting: (relative) => /(^|\/)(pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb?)$/.test(relative),
    describe: (_file, body) => {
      let packageManager = 'npm';
      let version = 'unknown';
      try {
        const pkg = JSON.parse(body) as { packageManager?: string; engines?: { node?: string } };
        packageManager = pkg.packageManager?.split('@')[0] || 'npm';
        version = pkg.engines?.node ?? 'unknown';
      } catch { /* validated later by the evidence consumer */ }
      return { version, packageManager, buildSystem: packageManager, buildCommandId: 'node.build', testCommandId: 'node.test' };
    },
  },
  {
    id: 'python', language: 'Python',
    primary: (relative) => /(^|\/)(pyproject\.toml|setup\.py)$/.test(relative),
    supporting: (relative) => /(^|\/)(poetry\.lock|requirements[^/]*\.txt|uv\.lock)$/.test(relative),
    describe: (_file, body) => ({
      version: body.match(/requires-python\s*=\s*["']([^"']+)/)?.[1] ?? 'unknown',
      packageManager: body.includes('[tool.poetry]') ? 'poetry' : body.includes('[tool.uv]') ? 'uv' : 'pip',
      buildSystem: 'python', buildCommandId: 'python.build', testCommandId: 'python.test',
    }),
  },
  {
    id: 'go', language: 'Go',
    primary: (relative) => relative.endsWith('go.mod'),
    supporting: (relative) => relative.endsWith('go.sum'),
    describe: (_file, body) => ({
      version: body.match(/^go\s+([^\s]+)/m)?.[1] ?? 'unknown', packageManager: 'go-modules',
      buildSystem: 'go', buildCommandId: 'go.build', testCommandId: 'go.test',
    }),
  },
  {
    id: 'rust', language: 'Rust',
    primary: (relative) => relative.endsWith('Cargo.toml'),
    supporting: (relative) => relative.endsWith('Cargo.lock'),
    describe: (_file, body) => ({
      version: body.match(/rust-version\s*=\s*["']([^"']+)/)?.[1] ?? 'unknown', packageManager: 'cargo',
      buildSystem: 'cargo', buildCommandId: 'rust.build', testCommandId: 'rust.test',
    }),
  },
  {
    id: 'java', language: 'Java/Kotlin',
    primary: (relative) => /(^|\/)(pom\.xml|build\.gradle(?:\.kts)?)$/.test(relative),
    supporting: (relative) => /(^|\/)(gradle\.properties|gradlew)$/.test(relative),
    describe: (file) => ({
      version: 'unknown', packageManager: file.endsWith('pom.xml') ? 'maven' : 'gradle',
      buildSystem: file.endsWith('pom.xml') ? 'maven' : 'gradle',
      buildCommandId: file.endsWith('pom.xml') ? 'java.maven-build' : 'java.gradle-build',
      testCommandId: file.endsWith('pom.xml') ? 'java.maven-test' : 'java.gradle-test',
    }),
  },
  {
    id: 'dotnet', language: 'C#/.NET',
    primary: (relative) => /\.(sln|csproj)$/.test(relative),
    supporting: (relative) => relative.endsWith('global.json') || relative.endsWith('packages.lock.json'),
    describe: (_file, body) => ({
      version: body.match(/<TargetFramework>([^<]+)/)?.[1] ?? 'unknown', packageManager: 'nuget',
      buildSystem: 'dotnet', buildCommandId: 'dotnet.build', testCommandId: 'dotnet.test',
    }),
  },
];

// AI provider tool directories: each can bootstrap its own local toolchain
// (e.g. `.opencode/package.json` + `node_modules`) that is provider config,
// never the project's own stack — a real repo keeps these alongside its
// actual manifest, and counting them would falsely detect multi-stack.
const IGNORED = new Set([
  '.git', '.aidlc', '.build', 'node_modules', 'vendor', 'dist', 'build', 'DerivedData',
  '.claude', '.cursor', '.codex', '.opencode',
]);

function walk(root: string, maxDepth = 3): string[] {
  const files: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolute, depth + 1);
      else if (entry.isFile()) files.push(relative);
    }
  };
  visit(root, 0);
  return files.sort();
}

/** Deterministic, read-only stack detection. It never guesses through ambiguity. */
export function detectStack(workspaceRoot: string, now = new Date().toISOString()): StackProfile {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const files = walk(root);
  const hits = DEFINITIONS.map((definition) => ({
    definition,
    primary: files.filter(definition.primary),
    supporting: files.filter(definition.supporting),
  })).filter((hit) => hit.primary.length > 0);
  const candidates = hits.map((hit) => hit.definition.id);

  // More than one manifest root for the same ecosystem is treated as a
  // monorepo in MVP. A .sln plus its child .csproj files is the one exception.
  const repeatedPrimary = hits.some((hit) => {
    if (hit.definition.id === 'dotnet' && hit.primary.some((file) => file.endsWith('.sln'))) return false;
    return new Set(hit.primary.map((file) => path.posix.dirname(file))).size > 1;
  });
  const repositoryKind = candidates.length === 0
    ? 'unsupported' as const
    : candidates.length > 1 || repeatedPrimary
      ? 'multi-stack' as const
      : 'single-stack' as const;

  if (repositoryKind !== 'single-stack') {
    return StackProfileSchema.parse({
      schemaVersion: 1,
      mode: 'cofofo',
      repositoryKind,
      candidates,
      evidence: hits.flatMap((hit) => hit.primary.map((relative) => ({
        path: relative,
        kind: 'manifest' as const,
        sha256: hashFile(path.join(root, relative)),
        observed: `${hit.definition.id} manifest`,
      }))),
      confidence: candidates.length === 0 ? 0 : 0.5,
      closed: {
        reason: candidates.length === 0
          ? 'No supported stack manifest was found.'
          : 'Multiple stack/package roots were found; CoFoFo does not guess a bundle.',
      },
      detectedAt: now,
    });
  }

  const hit = hits[0]!;
  const primary = hit.primary[0]!;
  const primaryAbs = path.join(root, primary);
  const body = fs.readFileSync(primaryAbs, 'utf8');
  const stack = hit.definition.describe(primary, body);
  const evidenceFiles = [...hit.primary, ...hit.supporting].slice(0, 12);
  return StackProfileSchema.parse({
    schemaVersion: 1,
    mode: 'cofofo',
    repositoryKind: 'single-stack',
    stack: { id: hit.definition.id, language: hit.definition.language, ...stack },
    candidates,
    evidence: evidenceFiles.map((relative) => ({
      path: relative,
      kind: hit.primary.includes(relative) ? 'manifest' as const : 'lockfile' as const,
      sha256: hashFile(path.join(root, relative)),
      observed: hit.primary.includes(relative) ? `${hit.definition.id} manifest` : `${hit.definition.id} dependency lock`,
    })),
    confidence: stack.version === 'unknown' ? 0.91 : 0.99,
    detectedAt: now,
  });
}

/** Reasons the scan-stack gate must stay closed. Empty means the profile may proceed. */
export function stackGateIssues(profile: StackProfile): string[] {
  if (profile.closed) return [profile.closed.reason];
  if (profile.repositoryKind !== 'single-stack' || !profile.stack) {
    return ['Stack detection is closed; CoFoFo does not guess a bundle.'];
  }
  if (profile.confidence < 0.9) return ['confidence is below 0.9'];
  return [];
}

/** Re-check every evidence file instead of trusting a previously written profile. */
export function validateStackProfile(workspaceRoot: string, profile: StackProfile): string[] {
  const parsed = StackProfileSchema.parse(profile);
  const issues: string[] = [];
  for (const evidence of parsed.evidence) {
    const absolute = path.join(workspaceRoot, evidence.path);
    if (!fs.existsSync(absolute)) issues.push(`${evidence.path}: missing`);
    else if (hashFile(absolute) !== evidence.sha256) issues.push(`${evidence.path}: content changed`);
  }
  issues.push(...stackGateIssues(parsed));
  const live = detectStack(workspaceRoot);
  if (live.repositoryKind !== parsed.repositoryKind) {
    issues.push(`STACK-PROFILE.json repositoryKind is ${parsed.repositoryKind}; live detection is ${live.repositoryKind}.`);
  }
  if (parsed.stack && live.stack && parsed.stack.id !== live.stack.id) {
    issues.push(`STACK-PROFILE.json stack ${parsed.stack.id} does not match live ${live.stack.id}.`);
  }
  return issues;
}

