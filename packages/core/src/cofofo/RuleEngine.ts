import * as fs from 'fs';
import * as path from 'path';

import {
  ProjectRulesSchema,
  type ProjectRule,
  type ProjectRules,
  type StackDescriptor,
  type StackProfile,
} from './contracts';
import { selectCatalog } from './Catalog';
import { hashObject } from './hash';
import { resolveInside } from './paths';

export interface RuleViolation {
  ruleId: string;
  severity: 'block' | 'warn';
  path: string;
  message: string;
}

function globRegex(glob: string): RegExp {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]!;
    if (char === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') {
        pattern += '(?:.*/)?';
        index += 2;
      } else {
        pattern += '.*';
        index += 1;
      }
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

function matches(file: string, globs: string[]): boolean {
  return globs.some((glob) => globRegex(glob).test(file));
}

function walk(root: string): string[] {
  const ignored = new Set(['.git', '.aidlc', '.build', 'node_modules', 'dist', 'build', 'DerivedData']);
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
}

function exceptionApplies(rule: ProjectRule, file: string, now: string): boolean {
  return rule.exceptions.some((exception) =>
    (file === exception.path || file.startsWith(`${exception.path}/`)) && exception.reviewAfter >= now.slice(0, 10),
  );
}

function layoutPrefix(profile: StackProfile): string {
  const manifest = profile.evidence.find((item) => item.kind === 'manifest')?.path ?? '.';
  const manifestDir = path.posix.dirname(manifest);
  if (manifestDir === '.' || manifest.endsWith('project.pbxproj')) return '';
  return `${manifestDir}/`;
}

function commandRules(stack: StackDescriptor, prefix: string): ProjectRule[] {
  const sourceScope = stack.id === 'ios-swift' ? [`${prefix}Sources/**`] : [`${prefix}**`];
  const testScope = stack.id === 'ios-swift' ? [`${prefix}Sources/**`, `${prefix}Tests/**`] : [`${prefix}**`];
  return [
    {
      ruleId: 'CMD-1', kind: 'commandId', scope: sourceScope, severity: 'block',
      rationale: `Every production change must compile with the pinned ${stack.buildCommandId} command.`, exceptions: [],
      matcher: { commandId: stack.buildCommandId },
    },
    {
      ruleId: 'CMD-2', kind: 'commandId', scope: testScope, severity: 'block',
      rationale: `Every change must pass the full ${stack.testCommandId} suite.`, exceptions: [],
      matcher: { commandId: stack.testCommandId },
    },
  ];
}

function layoutRules(stack: StackDescriptor, prefix: string): ProjectRule[] {
  if (stack.id === 'ios-swift') {
    return [
      {
        ruleId: 'PATH-1', kind: 'path', scope: [`${prefix}Sources/**`, `${prefix}Tests/**`], severity: 'block',
        rationale: 'Production and test Swift files stay inside the Swift package or Xcode source roots.', exceptions: [],
        matcher: { allowedRoots: [`${prefix}Sources`, `${prefix}Tests`], forbiddenPaths: ['**/.build/**', '**/DerivedData/**'] },
      },
      {
        ruleId: 'NAME-1', kind: 'naming', scope: [`${prefix}Sources/**/*.swift`, `${prefix}Tests/**/*.swift`], severity: 'warn',
        rationale: 'Swift type files use UpperCamelCase names.', exceptions: [],
        matcher: { pattern: '^[A-Z][A-Za-z0-9]*\\.swift$', extensions: ['.swift'] },
      },
      {
        ruleId: 'LAYER-1', kind: 'layering', scope: [`${prefix}Sources/**/Domain/**/*.swift`], severity: 'block',
        rationale: 'Domain code is independent of SwiftUI presentation.', exceptions: [],
        matcher: { from: [`${prefix}Sources/**/Domain/**/*.swift`], forbidImports: ['SwiftUI'] },
      },
    ];
  }
  if (stack.id === 'python') {
    return [{
      ruleId: 'PATH-1', kind: 'path', scope: [`${prefix}src/**`, `${prefix}tests/**`], severity: 'block',
      rationale: 'Production and test Python files stay inside src/ and tests/.', exceptions: [],
      matcher: { allowedRoots: [`${prefix}src`, `${prefix}tests`], forbiddenPaths: ['**/__pycache__/**', '**/.venv/**', '**/venv/**'] },
    }];
  }
  if (stack.id === 'node-typescript') {
    return [{
      ruleId: 'PATH-1', kind: 'path', scope: [`${prefix}src/**`, `${prefix}test/**`, `${prefix}tests/**`], severity: 'block',
      rationale: 'Production and test TypeScript files stay inside src/ and test roots.', exceptions: [],
      matcher: {
        allowedRoots: [`${prefix}src`, `${prefix}test`, `${prefix}tests`],
        forbiddenPaths: ['**/node_modules/**', '**/dist/**'],
      },
    }];
  }
  if (stack.id === 'go') {
    return [{
      ruleId: 'PATH-1', kind: 'path', scope: [`${prefix}**/*.go`], severity: 'block',
      rationale: 'Go sources stay outside vendor caches.', exceptions: [],
      matcher: { allowedRoots: prefix ? [prefix.replace(/\/$/, '')] : [], forbiddenPaths: ['**/vendor/**'] },
    }];
  }
  if (stack.id === 'rust') {
    return [{
      ruleId: 'PATH-1', kind: 'path', scope: [`${prefix}src/**`, `${prefix}tests/**`], severity: 'block',
      rationale: 'Rust sources stay inside src/ and tests/.', exceptions: [],
      matcher: { allowedRoots: [`${prefix}src`, `${prefix}tests`], forbiddenPaths: ['**/target/**'] },
    }];
  }
  if (stack.id === 'java') {
    return [{
      ruleId: 'PATH-1', kind: 'path', scope: [`${prefix}src/**`], severity: 'block',
      rationale: 'Java/Kotlin sources stay inside src/.', exceptions: [],
      matcher: { allowedRoots: [`${prefix}src`], forbiddenPaths: ['**/target/**', '**/build/**'] },
    }];
  }
  if (stack.id === 'dotnet') {
    return [{
      ruleId: 'PATH-1', kind: 'path', scope: [`${prefix}**/*.cs`], severity: 'block',
      rationale: 'C# sources stay outside bin/ and obj/.', exceptions: [],
      matcher: { allowedRoots: prefix ? [prefix.replace(/\/$/, '')] : [], forbiddenPaths: ['**/bin/**', '**/obj/**'] },
    }];
  }
  const exhaustive: never = stack.id;
  throw new Error(`No default layout rules for stack "${exhaustive}".`);
}

export function createDefaultRules(profile: StackProfile, foundationRevision: number, now = new Date().toISOString()): ProjectRules {
  if (!profile.stack) throw new Error('Cannot define CoFoFo rules without one supported stack.');
  const prefix = layoutPrefix(profile);
  const rules: ProjectRule[] = [...layoutRules(profile.stack, prefix), ...commandRules(profile.stack, prefix)];
  return ProjectRulesSchema.parse({ schemaVersion: 1, foundationRevision, generatedAt: now, rules });
}

export function rulesSourceHash(rules: ProjectRules): string {
  return hashObject(ProjectRulesSchema.parse(rules));
}

export function renderProjectRules(rules: ProjectRules): string {
  const parsed = ProjectRulesSchema.parse(rules);
  const lines = [
    '# Project Rules',
    '',
    '<!-- aidlc:generated project-rules -->',
    `<!-- aidlc:rules-source-sha256 ${rulesSourceHash(parsed)} -->`,
    '',
    '## Rule Index',
    '',
    '| Rule | Kind | Severity | Scope | Rationale |',
    '|---|---|---|---|---|',
  ];
  for (const rule of parsed.rules) {
    lines.push(`| ${rule.ruleId} | ${rule.kind} | ${rule.severity} | ${rule.scope.join(', ')} | ${rule.rationale.replace(/\|/g, '\\|')} |`);
  }
  lines.push('', '## Canonical Layout', '', 'Paths are enforced by `kind: path` rules in `PROJECT-RULES.json`.', '');
  lines.push('## Layering Rules', '', 'Import direction is enforced by `kind: layering` rules.', '');
  lines.push('## Naming Rules', '', 'Naming patterns and their severity are listed in the rule index.', '');
  lines.push('## Invariants', '', ...parsed.rules.filter((rule) => rule.severity === 'block').map((rule) => `- **${rule.ruleId}** — ${rule.rationale}`), '');
  lines.push('## Forbidden Actions', '', '- Do not bypass Canvas or machine-evidence gates.', '- Do not add arbitrary commands to project rules; use approved `commandId` values.', '');
  lines.push('## Proposed Changes', '', 'Changes to canonical policy require `update-rules` and Canvas review.', '');
  return lines.join('\n');
}

export function validateRulesMarkdown(rules: ProjectRules, markdown: string): string[] {
  const issues: string[] = [];
  if (!markdown.includes('<!-- aidlc:generated project-rules -->')) issues.push('generated marker missing');
  if (!markdown.includes(`<!-- aidlc:rules-source-sha256 ${rulesSourceHash(rules)} -->`)) issues.push('source hash mismatch');
  return issues;
}

export function validateProjectRules(args: {
  workspaceRoot: string;
  rules: ProjectRules;
  profile: StackProfile;
  files?: string[];
  now?: string;
}): RuleViolation[] {
  const root = fs.realpathSync(path.resolve(args.workspaceRoot));
  const rules = ProjectRulesSchema.parse(args.rules);
  const files = args.files ?? walk(root);
  const today = (args.now ?? new Date().toISOString()).slice(0, 10);
  const selection = selectCatalog(args.profile);
  const allowedCommands = new Set(selection?.commands.map((command) => command.id) ?? []);
  const violations: RuleViolation[] = [];
  const add = (rule: ProjectRule, file: string, message: string): void => {
    if (!exceptionApplies(rule, file, today)) violations.push({ ruleId: rule.ruleId, severity: rule.severity, path: file, message });
  };

  for (const rule of rules.rules) {
    if (rule.kind === 'commandId') {
      if (!allowedCommands.has(rule.matcher.commandId)) add(rule, 'PROJECT-RULES.json', `commandId ${rule.matcher.commandId} is not allow-listed`);
      continue;
    }
    if (rule.kind === 'dependency') {
      try {
        const manifest = fs.readFileSync(resolveInside(root, rule.matcher.manifest, true), 'utf8');
        for (const dependency of rule.matcher.forbidden) {
          if (manifest.includes(dependency)) add(rule, rule.matcher.manifest, `forbidden dependency: ${dependency}`);
        }
      } catch { add(rule, rule.matcher.manifest, 'dependency manifest is missing or unsafe'); }
      continue;
    }
    for (const file of files.filter((candidate) => matches(candidate, rule.scope))) {
      if (rule.kind === 'path') {
        if (rule.matcher.allowedRoots.length && !rule.matcher.allowedRoots.some((allowed) => file === allowed || file.startsWith(`${allowed}/`))) {
          add(rule, file, 'path is outside the allowed roots');
        }
        if (matches(file, rule.matcher.forbiddenPaths)) add(rule, file, 'path matches a forbidden pattern');
      } else if (rule.kind === 'naming') {
        if (rule.matcher.extensions.length && !rule.matcher.extensions.includes(path.extname(file))) continue;
        let pattern: RegExp;
        try { pattern = new RegExp(rule.matcher.pattern); }
        catch { add(rule, 'PROJECT-RULES.json', 'naming regex is invalid'); continue; }
        if (!pattern.test(path.basename(file))) add(rule, file, `name does not match ${rule.matcher.pattern}`);
      } else if (rule.kind === 'layering' && matches(file, rule.matcher.from)) {
        const body = fs.readFileSync(resolveInside(root, file, true), 'utf8');
        for (const forbidden of rule.matcher.forbidImports) {
          if (new RegExp(`^\\s*import\\s+${forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm').test(body)) {
            add(rule, file, `forbidden import: ${forbidden}`);
          }
        }
      }
    }
  }
  return violations;
}

export function validatePlanRuleReferences(rules: ProjectRules, plan: string): string[] {
  return rules.rules
    .filter((rule) => rule.severity === 'block' && !plan.includes(rule.ruleId))
    .map((rule) => `Plan does not reference blocking rule ${rule.ruleId}.`);
}

const MEMORY_MAX_BYTES = 64 * 1024;
const MEMORY_SECRET = /\b(?:sk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{12,}\b|(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s"']+|Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i;

/** Keep memory as bounded, explicitly unreviewed context rather than policy. */
export function validateMemoryHandoff(memory: string): string[] {
  const issues: string[] = [];
  if (Buffer.byteLength(memory) > MEMORY_MAX_BYTES) {
    issues.push(`Memory handoff exceeds ${MEMORY_MAX_BYTES} bytes.`);
  }
  if (!/\bunreviewed\b/i.test(memory)) {
    issues.push('Memory handoff must be explicitly labelled unreviewed.');
  }
  if (MEMORY_SECRET.test(memory)) {
    issues.push('Memory handoff appears to contain a secret or credential.');
  }
  return issues;
}

export { MEMORY_MAX_BYTES as COFOFO_MEMORY_MAX_BYTES };
