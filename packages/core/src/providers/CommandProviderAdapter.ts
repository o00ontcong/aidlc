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

/** A provider command which is permitted to discuss but not to change source. */
export interface DiscoveryInvocation extends OneShotInvocation {
  readonly restricted: true;
}

export interface CommandProviderAdapter {
  readonly id: BuiltinCommandProviderId;
  readonly displayName: string;
  readonly cliBinary: string;
  /** Provider-native way for an interactive agent to ask and wait for human input. */
  readonly nativeQuestionInstruction: string;
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
  /**
   * Start a real interactive provider session with an initial prompt. Unlike
   * one-shot automation, this invocation must keep the provider UI attached
   * to the terminal so its own question/answer mechanism remains available.
   */
  buildInteractiveInvocation(opts: {
    prompt: string;
    mappedModel?: string;
    cwd?: string;
    cliBinary?: string;
    /**
     * Provider-managed work can persist its own checkpoint in the visible
     * session. The default stays read-only for discovery conversations.
     */
    allowWorkspaceWrite?: boolean;
  }): OneShotInvocation;
  /**
   * Return null rather than silently falling back to an unrestricted CLI mode.
   * A Shape discussion is a hard read-only boundary, not merely a prompt.
   */
  buildDiscoveryInvocation(opts: {
    prompt: string;
    mappedModel?: string;
    cwd?: string;
    cliBinary?: string;
  }): DiscoveryInvocation | null;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) { return value; }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const claudeAdapter: CommandProviderAdapter = {
  id: 'claude',
  displayName: BUILTIN_COMMAND_PROVIDERS.claude.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.claude.cli,
  nativeQuestionInstruction: 'Use Claude Code\'s native AskUserQuestion interaction. Wait for the person\'s answer inside Claude before continuing.',
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
  buildInteractiveInvocation({ prompt, mappedModel, cliBinary, allowWorkspaceWrite = false }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    const permissionMode = allowWorkspaceWrite ? '' : ' --permission-mode plan';
    return {
      argv: mappedModel
        ? [binary, '--model', mappedModel, ...(allowWorkspaceWrite ? [] : ['--permission-mode', 'plan']), prompt]
        : [binary, ...(allowWorkspaceWrite ? [] : ['--permission-mode', 'plan']), prompt],
      shellOneLiner: `${binary}${modelFlag}${permissionMode} ${shellQuote(prompt)}`,
    };
  },
  buildDiscoveryInvocation({ prompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    return {
      restricted: true,
      argv: mappedModel
        ? [binary, '--model', mappedModel, '--permission-mode', 'plan', prompt]
        : [binary, '--permission-mode', 'plan', prompt],
      shellOneLiner: `${binary}${modelFlag} --permission-mode plan ${shellQuote(prompt)}`,
    };
  },
};

const cursorAdapter: CommandProviderAdapter = {
  id: 'cursor',
  displayName: BUILTIN_COMMAND_PROVIDERS.cursor.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.cursor.cli,
  nativeQuestionInstruction: 'Ask through Cursor Agent\'s native interactive conversation and wait for the person to answer in the Cursor terminal before continuing.',
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
  buildInteractiveInvocation({ prompt, mappedModel, cliBinary, allowWorkspaceWrite = false }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    const mode = allowWorkspaceWrite ? '' : ' --mode ask';
    return {
      argv: mappedModel
        ? [binary, '--model', mappedModel, ...(allowWorkspaceWrite ? [] : ['--mode', 'ask']), prompt]
        : [binary, ...(allowWorkspaceWrite ? [] : ['--mode', 'ask']), prompt],
      shellOneLiner: `${binary}${modelFlag}${mode} ${shellQuote(prompt)}`,
    };
  },
  buildDiscoveryInvocation({ prompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    return {
      restricted: true,
      argv: mappedModel
        ? [binary, '--model', mappedModel, '--mode', 'ask', prompt]
        : [binary, '--mode', 'ask', prompt],
      shellOneLiner: `${binary}${modelFlag} --mode ask ${shellQuote(prompt)}`,
    };
  },
};

const codexAdapter: CommandProviderAdapter = {
  id: 'codex',
  displayName: BUILTIN_COMMAND_PROVIDERS.codex.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.codex.cli,
  nativeQuestionInstruction: 'Use Codex\'s native request_user_input interaction when available; otherwise ask in the Codex TUI and wait for the person\'s reply before continuing.',
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
  buildInteractiveInvocation({ prompt, mappedModel, cliBinary, allowWorkspaceWrite = false }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    const sandbox = allowWorkspaceWrite ? 'workspace-write' : 'read-only';
    return {
      argv: mappedModel
        ? [binary, '--model', mappedModel, '--sandbox', sandbox, '--no-alt-screen', prompt]
        : [binary, '--sandbox', sandbox, '--no-alt-screen', prompt],
      shellOneLiner: `${binary}${modelFlag} --sandbox ${sandbox} --no-alt-screen ${shellQuote(prompt)}`,
    };
  },
  buildDiscoveryInvocation({ prompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    return {
      restricted: true,
      argv: mappedModel
        ? [binary, '--model', mappedModel, '--sandbox', 'read-only', '--ask-for-approval', 'never', prompt]
        : [binary, '--sandbox', 'read-only', '--ask-for-approval', 'never', prompt],
      shellOneLiner: `${binary}${modelFlag} --sandbox read-only --ask-for-approval never ${shellQuote(prompt)}`,
    };
  },
};

const opencodeAdapter: CommandProviderAdapter = {
  id: 'opencode',
  displayName: BUILTIN_COMMAND_PROVIDERS.opencode.displayName,
  cliBinary: BUILTIN_COMMAND_PROVIDERS.opencode.cli,
  nativeQuestionInstruction: 'Use OpenCode\'s native question interaction and wait for the person\'s answer inside the OpenCode TUI before continuing.',
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
  buildInteractiveInvocation({ prompt, mappedModel, cliBinary }) {
    const binary = cliBinary?.trim() || this.cliBinary;
    const modelFlag = mappedModel ? ` --model ${shellQuote(mappedModel)}` : '';
    const oneShot = `${binary}${modelFlag} --prompt ${shellQuote(prompt)}`;
    return {
      argv: mappedModel
        ? [binary, '--model', mappedModel, '--prompt', prompt]
        : [binary, '--prompt', prompt],
      shellOneLiner: oneShot,
    };
  },
  buildDiscoveryInvocation() {
    // Do not use OpenCode's --auto command for discovery: the current CLI
    // adapter has no verified source read-only profile.
    return null;
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
