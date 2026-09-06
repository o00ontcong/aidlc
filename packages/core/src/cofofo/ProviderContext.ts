import type { BundleBinding } from './contracts';
import { COFOFO_BUNDLE_BINDING_PATH } from './BundleBinding';

export const COFOFO_PROVIDER_CONTEXT_PATH = 'docs/project/foundation/PROVIDER-CONTEXT.md';

export interface RenderProviderContextArgs {
  foundationRevision: number;
  stackId: string;
  catalogRevision: string;
  binding: BundleBinding;
  rulesJsonPath?: string;
  architecturePath?: string;
  stackProfilePath?: string;
  bundleBindingPath?: string;
}

/**
 * Render the canonical PROVIDER-CONTEXT.md body from a published bundle binding.
 * Installed into provider files only after the publish-context Canvas gate approves.
 */
export function renderProviderContext(args: RenderProviderContextArgs): string {
  const {
    foundationRevision,
    stackId,
    catalogRevision,
    binding,
    rulesJsonPath = 'docs/project/foundation/PROJECT-RULES.json',
    architecturePath = 'docs/project/foundation/ARCHITECTURE-MAP.md',
    stackProfilePath = 'docs/project/foundation/STACK-PROFILE.json',
    bundleBindingPath = COFOFO_BUNDLE_BINDING_PATH,
  } = args;

  const roleLines = Object.entries(binding.roles).flatMap(([role, skills]) => [
    `- **cofofo-${role}**: ${skills.length ? skills.join(', ') : '(none)'}`,
  ]);
  const phaseLines = Object.entries(binding.phases).flatMap(([phase, skills]) => [
    `- **${phase}**: ${skills.length ? skills.join(', ') : '(none)'}`,
  ]);
  const skillLines = binding.skills.map(
    (skill) => `- \`${skill.id}\` → \`${skill.path}\` (${skill.sha256.slice(0, 19)}…)`,
  );
  const commandLines = binding.commands.map(
    (command) => `- \`${command.id}\`: \`${command.executable} ${command.args.join(' ')}\``,
  );

  return [
    '# CoFoFo Provider Context',
    '',
    `- Foundation revision: **${foundationRevision}**`,
    `- Stack: **${stackId}**`,
    `- Catalog revision: \`${catalogRevision}\``,
    `- Bundle binding: \`${bundleBindingPath}\``,
    `- Canonical policy: \`${rulesJsonPath}\``,
    `- Architecture map: \`${architecturePath}\``,
    `- Stack profile: \`${stackProfilePath}\``,
    '',
    '## Role → ECC skills',
    '',
    ...roleLines,
    '',
    '## Phase → ECC skills',
    '',
    ...phaseLines,
    '',
    '## Installed skill registry',
    '',
    ...skillLines,
    '',
    '## Command allow-list',
    '',
    ...commandLines,
    '',
    'Every plan cites applicable blocking ruleId values. Delivery close requires Canvas on the test bundle and accepted VERIFY evidence.',
  ].join('\n');
}
