import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  createDefaultArtifactPolicy,
  parseArtifactPolicy,
  resolveArtifactDescriptor,
  type ArtifactDescriptor,
  type ArtifactPolicy,
} from '../contracts';

export interface ArtifactPathContext { epic: string; stage?: string; action?: string; id?: string; }
export interface CommitPreview { artifacts: Array<ArtifactDescriptor & { resolvedPath: string }>; codePaths: string[]; configPaths: string[]; }

function assertSafeRelative(value: string): string {
  if (!value || path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) throw new Error(`Unsafe artifact path "${value}".`);
  return value;
}

export function resolveArtifactPath(policy: ArtifactPolicy, type: string, context: ArtifactPathContext): ArtifactDescriptor & { resolvedPath: string } {
  const descriptor = resolveArtifactDescriptor(policy, type);
  if (!descriptor) throw new Error(`Unknown artifact type "${type}".`);
  const resolvedPath = descriptor.path.replace(/\{(epic|stage|action|id)\}/g, (_match, key: keyof ArtifactPathContext) => context[key] ?? '');
  return { ...descriptor, resolvedPath: assertSafeRelative(resolvedPath) };
}

export class ArtifactPolicyService {
  constructor(private readonly workspaceRoot: string) {}
  file(): string { return path.join(this.workspaceRoot, '.aidlc', 'artifacts.yaml'); }
  load(): ArtifactPolicy {
    if (!fs.existsSync(this.file())) return createDefaultArtifactPolicy();
    return parseArtifactPolicy(yaml.load(fs.readFileSync(this.file(), 'utf8')));
  }
  save(policy: ArtifactPolicy): void {
    fs.mkdirSync(path.dirname(this.file()), { recursive: true });
    fs.writeFileSync(this.file(), yaml.dump(policy, { noRefs: true }), 'utf8');
  }
  preview(policy: ArtifactPolicy, artifactTypes: string[], context: ArtifactPathContext, codePaths: string[] = [], configPaths: string[] = []): CommitPreview {
    const artifacts = artifactTypes.map((type) => resolveArtifactPath(policy, type, context)).filter((artifact) => artifact.commit);
    const seen = new Set<string>();
    for (const artifact of artifacts) {
      if (seen.has(artifact.resolvedPath)) throw new Error(`Multiple artifact types resolve to canonical path "${artifact.resolvedPath}".`);
      seen.add(artifact.resolvedPath);
    }
    return { artifacts, codePaths: [...codePaths], configPaths: [...configPaths] };
  }
}
