import * as path from 'path';

import type { CofofoStackId, StackDescriptor, StackProfile } from './contracts';

export const COFOFO_ECC_REVISION = 'd8409a4b0813771235555e32e3d8046a73988bfa';

export interface CatalogAsset {
  id: string;
  kind: 'agent' | 'skill';
  sourcePath: string;
  modified: boolean;
}

export interface CofofoCommandSpec {
  id: string;
  executable: string;
  args: string[];
  acceptsTarget?: boolean;
}

export interface CofofoCatalogSelection {
  stackId: CofofoStackId;
  revision: string;
  license: 'MIT';
  assets: CatalogAsset[];
  commands: CofofoCommandSpec[];
}

interface CatalogAssetEntry extends CatalogAsset {
  /** `*` = every detected stack; otherwise only those ids. */
  stacks: '*' | readonly CofofoStackId[];
}

const CATALOG_ASSETS: CatalogAssetEntry[] = [
  { id: 'ecc-tdd-guide', kind: 'agent', sourcePath: 'agents/tdd-guide.md', modified: true, stacks: '*' },
  { id: 'ecc-tdd-workflow', kind: 'skill', sourcePath: 'skills/tdd-workflow.md', modified: true, stacks: '*' },
  { id: 'ecc-security-review', kind: 'skill', sourcePath: 'skills/security-review.md', modified: true, stacks: '*' },
  { id: 'ecc-swift-reviewer', kind: 'agent', sourcePath: 'agents/swift-reviewer.md', modified: true, stacks: ['ios-swift'] },
  { id: 'ecc-swift-protocol-di-testing', kind: 'skill', sourcePath: 'skills/swift-protocol-di-testing.md', modified: true, stacks: ['ios-swift'] },
];

const SWIFTPM_COMMANDS: CofofoCommandSpec[] = [
  { id: 'swift.build', executable: 'swift', args: ['build'] },
  { id: 'swift.test', executable: 'swift', args: ['test'] },
  { id: 'swift.test-targeted', executable: 'swift', args: ['test', '--filter'], acceptsTarget: true },
];

const XCODE_COMMANDS: CofofoCommandSpec[] = [
  { id: 'swift.xcode-build', executable: 'xcodebuild', args: ['build'] },
  { id: 'swift.xcode-test', executable: 'xcodebuild', args: ['test'] },
];

function nodeCommands(packageManager: string): CofofoCommandSpec[] {
  if (packageManager === 'pnpm') {
    return [
      { id: 'node.build', executable: 'pnpm', args: ['run', 'build'] },
      { id: 'node.test', executable: 'pnpm', args: ['test'] },
    ];
  }
  if (packageManager === 'yarn') {
    return [
      { id: 'node.build', executable: 'yarn', args: ['build'] },
      { id: 'node.test', executable: 'yarn', args: ['test'] },
    ];
  }
  if (packageManager === 'bun') {
    return [
      { id: 'node.build', executable: 'bun', args: ['run', 'build'] },
      { id: 'node.test', executable: 'bun', args: ['test'] },
    ];
  }
  return [
    { id: 'node.build', executable: 'npm', args: ['run', 'build'] },
    { id: 'node.test', executable: 'npm', args: ['test'] },
  ];
}

function pythonCommands(packageManager: string): CofofoCommandSpec[] {
  if (packageManager === 'poetry') {
    return [
      { id: 'python.build', executable: 'poetry', args: ['check'] },
      { id: 'python.test', executable: 'poetry', args: ['run', 'pytest'] },
    ];
  }
  if (packageManager === 'uv') {
    return [
      { id: 'python.build', executable: 'uv', args: ['build'] },
      { id: 'python.test', executable: 'uv', args: ['run', 'pytest'] },
    ];
  }
  return [
    { id: 'python.build', executable: 'python3', args: ['-m', 'compileall', '.'] },
    { id: 'python.test', executable: 'python3', args: ['-m', 'pytest'] },
  ];
}

/**
 * Command allow-list for a detected stack. Exhaustive over `CofofoStackId`
 * so a new detector id cannot ship without a pinned executable + args.
 * Destinations/schemes are not invented here — evidence capture runs these
 * commands as declared; a missing local toolchain fails at capture time.
 */
export function commandsForStack(stack: StackDescriptor): CofofoCommandSpec[] {
  switch (stack.id) {
    case 'ios-swift':
      return stack.packageManager === 'xcode' ? XCODE_COMMANDS : SWIFTPM_COMMANDS;
    case 'node-typescript':
      return nodeCommands(stack.packageManager);
    case 'python':
      return pythonCommands(stack.packageManager);
    case 'go':
      return [
        { id: 'go.build', executable: 'go', args: ['build', './...'] },
        { id: 'go.test', executable: 'go', args: ['test', './...'] },
      ];
    case 'rust':
      return [
        { id: 'rust.build', executable: 'cargo', args: ['build'] },
        { id: 'rust.test', executable: 'cargo', args: ['test'] },
      ];
    case 'java':
      return stack.packageManager === 'maven'
        ? [
          { id: 'java.maven-build', executable: 'mvn', args: ['-q', 'compile'] },
          { id: 'java.maven-test', executable: 'mvn', args: ['-q', 'test'] },
        ]
        : [
          { id: 'java.gradle-build', executable: 'gradle', args: ['build'] },
          { id: 'java.gradle-test', executable: 'gradle', args: ['test'] },
        ];
    case 'dotnet':
      return [
        { id: 'dotnet.build', executable: 'dotnet', args: ['build'] },
        { id: 'dotnet.test', executable: 'dotnet', args: ['test'] },
      ];
    default: {
      const exhaustive: never = stack.id;
      throw new Error(`No command allow-list for stack "${exhaustive}".`);
    }
  }
}

function assetApplies(entry: CatalogAssetEntry, stackId: CofofoStackId): boolean {
  return entry.stacks === '*' || entry.stacks.includes(stackId);
}

function toAsset(entry: CatalogAssetEntry): CatalogAsset {
  return { id: entry.id, kind: entry.kind, sourcePath: entry.sourcePath, modified: entry.modified };
}

/**
 * Filter the pinned text catalog for one detected stack. Returns null only
 * when scan-stack is closed (no stack descriptor) — never because the stack
 * id lacks a dedicated ECC subset. Shared TDD and security assets apply to
 * every known stack; stack-specific Markdown is extra, not a gate.
 */
export function selectCatalog(profile: StackProfile): CofofoCatalogSelection | null {
  if (!profile.stack) return null;
  const stack = profile.stack;
  const assets = CATALOG_ASSETS.filter((entry) => assetApplies(entry, stack.id)).map(toAsset);
  const commands = commandsForStack(stack);
  if (!commands.some((command) => command.id === stack.buildCommandId)
    || !commands.some((command) => command.id === stack.testCommandId)) {
    throw new Error(
      `Catalog commands for ${stack.id} must include detector ids ${stack.buildCommandId} and ${stack.testCommandId}.`,
    );
  }
  return {
    stackId: stack.id,
    revision: COFOFO_ECC_REVISION,
    license: 'MIT',
    assets,
    commands,
  };
}

export interface CofofoBindingTemplate {
  roles: Record<string, string[]>;
  phases: Record<string, string[]>;
}

const SHARED_BINDING: CofofoBindingTemplate = {
  roles: {
    developer: ['ecc-tdd-workflow', 'ecc-tdd-guide'],
    'fresh-reviewer': ['ecc-security-review'],
  },
  phases: {
    reproduce: ['ecc-tdd-workflow'],
    implement: ['ecc-tdd-workflow'],
    test: ['ecc-security-review'],
  },
};

const STACK_BINDING_EXTRAS: Partial<Record<CofofoStackId, CofofoBindingTemplate>> = {
  'ios-swift': {
    roles: {
      developer: ['ecc-swift-protocol-di-testing'],
      'fresh-reviewer': ['ecc-swift-reviewer'],
    },
    phases: {
      implement: ['ecc-swift-protocol-di-testing'],
    },
  },
};

function concatUnique(base: string[], extra: string[]): string[] {
  return [...base, ...extra.filter((id) => !base.includes(id))];
}

function mergeBinding(base: CofofoBindingTemplate, extra?: CofofoBindingTemplate): CofofoBindingTemplate {
  if (!extra) return base;
  const roles = { ...base.roles };
  for (const [role, ids] of Object.entries(extra.roles)) {
    roles[role] = concatUnique(roles[role] ?? [], ids);
  }
  const phases = { ...base.phases };
  for (const [phase, ids] of Object.entries(extra.phases)) {
    phases[phase] = concatUnique(phases[phase] ?? [], ids);
  }
  return { roles, phases };
}

/**
 * Phase/role ECC skill map for a catalog selection. Agent markdown assets are
 * attached to CoFoFo roles as skill ids; pipeline steps still call cofofo-* agents.
 */
export function bindingForSelection(selection: CofofoCatalogSelection): CofofoBindingTemplate {
  const template = mergeBinding(SHARED_BINDING, STACK_BINDING_EXTRAS[selection.stackId]);
  const allowed = new Set(selection.assets.map((asset) => asset.id));
  const filter = (ids: string[]) => ids.filter((id) => allowed.has(id));
  const roles: Record<string, string[]> = {};
  for (const [role, ids] of Object.entries(template.roles)) {
    const filtered = filter(ids);
    if (filtered.length) roles[role] = filtered;
  }
  const phases: Record<string, string[]> = {};
  for (const [phase, ids] of Object.entries(template.phases)) {
    const filtered = filter(ids);
    if (filtered.length) phases[phase] = filtered;
  }
  return { roles, phases };
}

export function commandSpec(selection: CofofoCatalogSelection, commandId: string): CofofoCommandSpec {
  const found = selection.commands.find((command) => command.id === commandId);
  if (!found) {
    throw new Error(`CommandId "${commandId}" is not in the pinned ${selection.stackId} allow-list.`);
  }
  return found;
}

/** Root containing the bundled, text-only curated catalog. */
export function builtinCofofoCatalogRoot(): string {
  return path.join(__dirname, '..', '..', 'templates', 'cofofo', 'catalog');
}
