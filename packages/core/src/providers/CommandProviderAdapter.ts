import * as path from 'path';

import { renderClaudeCommandFile, type StepCommandSpec } from './stepCommand';
import {
  BUILTIN_COMMAND_PROVIDERS,
  type BuiltinCommandProviderId,
} from './bundledModelMappings';

export interface OneShotInvocation {
  argv: string[];
  shellOneLiner?: string;
}

export interface CommandProviderAdapter {
  readonly id: BuiltinCommandProviderId;
  readonly displayName: string;
  readonly cliBinary: string;
  commandsDir(root: string): string;
  commandFilePath(root: string, commandName: string): string;
  renderCommandFile(spec: StepCommandSpec, mappedModel?: string): string;
  buildOneShotInvocation(opts: {
    slashOrPrompt: string;
    mappedModel?: string;
    cwd?: string;
    /** Persisted provider CLI override from `.aidlc/providers.yaml`. */
    cliBinary?: string;
  }): OneShotInvocation;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) { return value; }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const claudeAdapter: CommandProviderAdapter = {
  id: 'claude',
  displayName: BUILTIN_COMMAND_PROVIDERS.claude.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.claude.cli,
  commandsDir(root) { return path.join(root, '.claude', 'commands'); },
  commandFilePath(root, commandName) {
    return path.join(this.commandsDir(root), `${commandName}.md`);
  },
  renderCommandFile(spec, mappedModel) {
    return renderClaudeCommandFile(spec, mappedModel);
  },
  buildOneShotInvocation({ slashOrPrompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    const oneShot = `${binary}${modelFlag} ${shellQuote(slashOrPrompt)}`;
    return {
      argv: mappedModel ? [binary, '--model', mappedModel, slashOrPrompt] : [binary, slashOrPrompt],
      shellOneLiner: oneShot,
    };
  },
};

const cursorAdapter: CommandProviderAdapter = {
  id: 'cursor',
  displayName: BUILTIN_COMMAND_PROVIDERS.cursor.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.cursor.cli,
  commandsDir(root) { return path.join(root, '.cursor', 'commands'); },
  commandFilePath(root, commandName) {
    return path.join(this.commandsDir(root), `${commandName}.md`);
  },
  renderCommandFile(spec) {
    // Cursor Agent treats `/name` as a Skill. YAML frontmatter + a sibling
    // `.cursor/skills/<name>/SKILL.md` (written by syncPipelineCommands) is
    // what makes `/aidlc-workflow-full-plan` available — a heading
    // in `.cursor/commands/` is not enough.
    return `---
name: ${spec.commandName}
description: ${spec.description}
---

${spec.body}`;
  },
  buildOneShotInvocation({ slashOrPrompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    const oneShot = `${binary}${modelFlag} ${shellQuote(slashOrPrompt)}`;
    return {
      argv: mappedModel
        ? [binary, '--model', mappedModel, slashOrPrompt]
        : [binary, slashOrPrompt],
      shellOneLiner: oneShot,
    };
  },
};

const codexAdapter: CommandProviderAdapter = {
  id: 'codex',
  displayName: BUILTIN_COMMAND_PROVIDERS.codex.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.codex.cli,
  commandsDir(root) { return path.join(root, '.codex', 'skills'); },
  commandFilePath(root, commandName) {
    return path.join(this.commandsDir(root), `aidlc-${commandName}`, 'SKILL.md');
  },
  renderCommandFile(spec) {
    return `---
name: aidlc-${spec.commandName}
description: ${spec.description}
disable-model-invocation: true
---

${spec.body}`;
  },
  buildOneShotInvocation({ slashOrPrompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    const oneShot = `${binary} exec${modelFlag} --sandbox workspace-write ${shellQuote(slashOrPrompt)}`;
    return {
      argv: mappedModel
        ? [binary, 'exec', '--model', mappedModel, '--sandbox', 'workspace-write', slashOrPrompt]
        : [binary, 'exec', '--sandbox', 'workspace-write', slashOrPrompt],
      shellOneLiner: oneShot,
    };
  },
};

const opencodeAdapter: CommandProviderAdapter = {
  id: 'opencode',
  displayName: BUILTIN_COMMAND_PROVIDERS.opencode.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.opencode.cli,
  commandsDir(root) { return path.join(root, '.opencode', 'commands'); },
  commandFilePath(root, commandName) {
    return path.join(this.commandsDir(root), `${commandName}.md`);
  },
  renderCommandFile(spec, mappedModel) {
    const modelLine = mappedModel ?? spec.canonicalModel;
    const frontmatter = modelLine
      ? `---\ndescription: ${spec.description}\nmodel: ${modelLine}\n---\n\n`
      : `---\ndescription: ${spec.description}\n---\n\n`;
    return `${frontmatter}${spec.body}`;
  },
  buildOneShotInvocation({ slashOrPrompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    // OpenCode's root command starts its interactive TUI.  `--prompt` submits the
    // provider-native slash command after the TUI opens, keeping the session
    // visible and allowing OpenCode to resolve `.opencode/commands/*.md` itself.
    const oneShot = `${binary}${modelFlag} --auto --prompt ${shellQuote(slashOrPrompt)}`;
    return {
      argv: mappedModel
        ? [binary, '--model', mappedModel, '--auto', '--prompt', slashOrPrompt]
        : [binary, '--auto', '--prompt', slashOrPrompt],
      shellOneLiner: oneShot,
    };
  },
};

const ADAPTERS = new Map<BuiltinCommandProviderId, CommandProviderAdapter>([
  ['claude', claudeAdapter],
  ['cursor', cursorAdapter],
  ['codex', codexAdapter],
  ['opencode', opencodeAdapter],
]);

export class CommandProviderRegistry {
  register(adapter: CommandProviderAdapter): void {
    ADAPTERS.set(adapter.id, adapter);
  }

  get(id: string): CommandProviderAdapter | undefined {
    return ADAPTERS.get(id as BuiltinCommandProviderId);
  }

  list(): CommandProviderAdapter[] {
    return [...ADAPTERS.values()];
  }

  listEnabled(enabledIds: Iterable<string>): CommandProviderAdapter[] {
    const enabled = new Set(enabledIds);
    return this.list().filter((adapter) => enabled.has(adapter.id));
  }
}

export const commandProviderRegistry = new CommandProviderRegistry();

export function getCommandProviderAdapter(id: string): CommandProviderAdapter {
  const adapter = commandProviderRegistry.get(id);
  if (!adapter) { throw new Error(`Unknown command provider: ${id}`); }
  return adapter;
}

export function listCommandProviderAdapters(): CommandProviderAdapter[] {
  return commandProviderRegistry.list();
}
