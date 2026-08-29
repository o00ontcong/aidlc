import * as path from 'path';

import type { CofofoStackId, StackProfile } from './contracts';

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

const SWIFT_ASSETS: CatalogAsset[] = [
  { id: 'ecc-swift-reviewer', kind: 'agent', sourcePath: 'agents/swift-reviewer.md', modified: true },
  { id: 'ecc-tdd-guide', kind: 'agent', sourcePath: 'agents/tdd-guide.md', modified: true },
  { id: 'ecc-tdd-workflow', kind: 'skill', sourcePath: 'skills/tdd-workflow.md', modified: true },
  { id: 'ecc-swift-protocol-di-testing', kind: 'skill', sourcePath: 'skills/swift-protocol-di-testing.md', modified: true },
  { id: 'ecc-security-review', kind: 'skill', sourcePath: 'skills/security-review.md', modified: true },
];

const SWIFT_COMMANDS: CofofoCommandSpec[] = [
  { id: 'swift.build', executable: 'swift', args: ['build'] },
  { id: 'swift.test', executable: 'swift', args: ['test'] },
  { id: 'swift.test-targeted', executable: 'swift', args: ['test', '--filter'], acceptsTarget: true },
];

/**
 * MVP catalog. The registry is stack-neutral, while the first audited bundle
 * is Swift. Other detected ecosystems fail closed to the generic SDLC until
 * their own text assets and validators are reviewed.
 */
export function selectCatalog(profile: StackProfile): CofofoCatalogSelection | null {
  // The first audited runtime contract is SwiftPM. An Xcode project shares the
  // language id but requires xcodebuild destinations/schemes that this bundle
  // does not guess; fail closed until that catalog is separately reviewed.
  if (
    profile.mode !== 'cofofo'
    || profile.stack?.id !== 'ios-swift'
    || profile.stack.packageManager !== 'swiftpm'
  ) return null;
  return {
    stackId: 'ios-swift',
    revision: COFOFO_ECC_REVISION,
    license: 'MIT',
    assets: SWIFT_ASSETS,
    commands: SWIFT_COMMANDS,
  };
}

export interface CofofoBindingTemplate {
  roles: Record<string, string[]>;
  phases: Record<string, string[]>;
}

const IOS_SWIFT_BINDING: CofofoBindingTemplate = {
  roles: {
    developer: ['ecc-tdd-workflow', 'ecc-swift-protocol-di-testing', 'ecc-tdd-guide'],
    'fresh-reviewer': ['ecc-security-review', 'ecc-swift-reviewer'],
  },
  phases: {
    reproduce: ['ecc-tdd-workflow'],
    implement: ['ecc-tdd-workflow', 'ecc-swift-protocol-di-testing'],
    test: ['ecc-security-review'],
  },
};

const BINDING_BY_STACK: Partial<Record<CofofoStackId, CofofoBindingTemplate>> = {
  'ios-swift': IOS_SWIFT_BINDING,
};

/**
 * Phase/role ECC skill map for a catalog selection. Agent markdown assets are
 * attached to CoFoFo roles as skill ids; pipeline steps still call cofofo-* agents.
 */
export function bindingForSelection(selection: CofofoCatalogSelection): CofofoBindingTemplate {
  const template = BINDING_BY_STACK[selection.stackId];
  if (!template) {
    throw new Error(`No bundle binding map is defined for stack "${selection.stackId}".`);
  }
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
