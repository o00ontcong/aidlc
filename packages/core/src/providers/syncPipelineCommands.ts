import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import {
  BUILTIN_WORKFLOWS,
  loadBuiltinPreset,
  pipelineCommandId,
  workflowCommandPhases,
  type BuiltinWorkflow,
  type WorkspacePreset,
} from '../presets/builtinWorkflows';
import {
  backboneCommandDoc,
  CANONICAL_PHASES,
  shortcutCommandDoc,
  type CanonicalPhase,
  type WriteCommandsResult,
} from '../presets/commandModel';
import {
  providerManagedTaskCommandBody,
  PROVIDER_MANAGED_TASK_COMMAND,
} from './ProviderManagedTaskCommand';
import {
  ideaAgentCommandBody,
  IDEA_AGENT_COMMAND_NAME,
  ideaPipelineCommandBody,
  IDEA_PIPELINE_COMMAND_NAME,
  ideaTranslateCommandBody,
  IDEA_TRANSLATE_COMMAND_NAME,
} from '../idea/IdeaAgentCommand';
import { ModelProviderConfigStore } from '../models/ModelProviderConfigStore';
import { activeEpicsDir } from '../runs/RunState';
import { getCommandProviderAdapter } from './CommandProviderAdapter';
import { buildStepCommandSpec } from './stepCommand';

export interface SyncPipelineCommandsResult {
  commandsWritten: string[];
  providers: string[];
}

function writeCommandFile(
  file: string,
  body: string,
  overwrite: boolean,
): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !overwrite) { return false; }
  fs.writeFileSync(file, body, 'utf8');
  return true;
}

/** Cursor Agent slash-invokes Skills, not `.cursor/commands/*.md`. */
function writeCursorAgentSkill(
  root: string,
  commandName: string,
  rendered: string,
  overwrite: boolean,
): string | null {
  const file = path.join(root, '.cursor', 'skills', commandName, 'SKILL.md');
  return writeCommandFile(file, rendered, overwrite) ? file : null;
}

function writeRenderedCommand(
  adapter: ReturnType<typeof getCommandProviderAdapter>,
  root: string,
  commandName: string,
  rendered: string,
  overwrite: boolean,
): string[] {
  const written: string[] = [];
  const file = adapter.commandFilePath(root, commandName);
  if (writeCommandFile(file, rendered, overwrite)) written.push(file);
  if (adapter.id === 'cursor') {
    const skill = writeCursorAgentSkill(root, commandName, rendered, overwrite);
    if (skill) written.push(skill);
  }
  return written;
}

function writeStandaloneCommand(
  root: string,
  providerId: string,
  commandName: string,
  description: string,
  body: string,
  overwrite: boolean,
  mappedModel?: string,
): string | null {
  const adapter = getCommandProviderAdapter(providerId);
  const rendered = adapter.renderCommandFile({
    commandName,
    description,
    body,
    epicRoot: '',
  }, mappedModel);
  const written = writeRenderedCommand(adapter, root, commandName, rendered, overwrite);
  return written[0] ?? null;
}

function writeBuiltinCommandsForProvider(
  root: string,
  providerId: string,
  workflow: BuiltinWorkflow,
  preset: WorkspacePreset,
  epicRoot: string,
  overwrite: boolean,
  configStore: ModelProviderConfigStore,
): string[] {
  const adapter = getCommandProviderAdapter(providerId);
  const config = configStore.loadOrDefault();
  const written: string[] = [];

  for (const { pipelineId, phase } of workflowCommandPhases(workflow)) {
    const commandName = pipelineCommandId(pipelineId, phase.id);
    const skillBody = preset.skillContents[phase.id]
      ?? `# ${phase.name}\n\n${phase.description}\n`;
    const spec = buildStepCommandSpec(phase, skillBody, epicRoot, commandName);
    const mappedModel = configStore.mapModel(spec.canonicalModel ?? phase.model, providerId, config);
    written.push(
      ...writeRenderedCommand(
        adapter,
        root,
        commandName,
        adapter.renderCommandFile(spec, mappedModel),
        overwrite,
      ),
    );
  }
  return written;
}

export function writeTwoLayerCommandsForProvider(
  root: string,
  providerId: string,
  opts: { epicRoot?: string; phases?: CanonicalPhase[]; overwrite?: boolean } = {},
): WriteCommandsResult {
  const epicRoot = opts.epicRoot ?? 'docs/epics';
  const phases = opts.phases ?? CANONICAL_PHASES;
  const overwrite = opts.overwrite ?? false;
  const adapter = getCommandProviderAdapter(providerId);
  const configStore = new ModelProviderConfigStore(root);
  const mappedModel = configStore.modelFor(providerId);
  const written: string[] = [];
  const skipped: string[] = [];

  const emit = (commandName: string, description: string, body: string): void => {
    const file = adapter.commandFilePath(root, commandName);
    if (fs.existsSync(file) && !overwrite) { skipped.push(file); return; }
    written.push(
      ...writeRenderedCommand(
        adapter,
        root,
        commandName,
        adapter.renderCommandFile({ commandName, description, body, epicRoot }, mappedModel),
        true,
      ),
    );
  };

  emit('aidlc', 'AIDLC dispatcher', backboneCommandDoc(epicRoot));
  for (const phase of phases) {
    emit(phase.id, `${phase.description} (AIDLC ${phase.name} phase)`, shortcutCommandDoc(phase, epicRoot));
  }

  return { written, skipped };
}

export function syncProviderManagedCommandForProvider(
  root: string,
  providerId: string,
  overwrite = false,
): string[] {
  const configStore = new ModelProviderConfigStore(root);
  const mappedModel = configStore.modelFor(providerId);
  const written: string[] = [];
  for (const entry of [
    {
      name: PROVIDER_MANAGED_TASK_COMMAND.slice(1),
      description: 'Run one AIDLC task pipeline in the selected provider terminal.',
      body: providerManagedTaskCommandBody(),
    },
  ]) {
    const file = writeStandaloneCommand(
      root,
      providerId,
      entry.name,
      entry.description,
      entry.body,
      overwrite,
      mappedModel,
    );
    if (file) { written.push(file); }
  }
  return written;
}

/** Install the Idea Research Agent command — same distribution mechanism as `syncProviderManagedCommandForProvider`, works without a `workspace.yaml`/pipeline. */
export function syncIdeaAgentCommandForProvider(
  root: string,
  providerId: string,
  overwrite = false,
): string[] {
  const configStore = new ModelProviderConfigStore(root);
  const mappedModel = configStore.modelFor(providerId);
  const file = writeStandaloneCommand(
    root,
    providerId,
    IDEA_AGENT_COMMAND_NAME,
    'Work one Idea Research Workflow stage (Understand/Research/Explore/Decide) and write findings to a notes file. Usage: /aidlc-idea-research <idea-id> <stage> [note]',
    ideaAgentCommandBody(),
    overwrite,
    mappedModel,
  );
  return file ? [file] : [];
}

/** Install the Idea Research Agent PIPELINE command — same mechanism as `syncIdeaAgentCommandForProvider`, but owns all 4 research stages across turns instead of one fixed stage per invocation. */
export function syncIdeaPipelineCommandForProvider(
  root: string,
  providerId: string,
  overwrite = false,
): string[] {
  const configStore = new ModelProviderConfigStore(root);
  const mappedModel = configStore.modelFor(providerId);
  const file = writeStandaloneCommand(
    root,
    providerId,
    IDEA_PIPELINE_COMMAND_NAME,
    'Own the Idea Research Workflow (Understand/Research/Explore/Decide) for one idea, one stage per turn, re-detecting the current stage each time. Usage: /aidlc-idea-research-pipeline <idea-id> [note]',
    ideaPipelineCommandBody(),
    overwrite,
    mappedModel,
  );
  return file ? [file] : [];
}

/** Install the Idea Translate command — same distribution mechanism as `syncIdeaAgentCommandForProvider`, translates an idea's notes files into another language. */
export function syncIdeaTranslateCommandForProvider(
  root: string,
  providerId: string,
  overwrite = false,
): string[] {
  const configStore = new ModelProviderConfigStore(root);
  const mappedModel = configStore.modelFor(providerId);
  const file = writeStandaloneCommand(
    root,
    providerId,
    IDEA_TRANSLATE_COMMAND_NAME,
    'Translate an Idea\'s content into another language, applied straight to its state. Usage: /aidlc-idea-translate <idea-id>',
    ideaTranslateCommandBody(),
    overwrite,
    mappedModel,
  );
  return file ? [file] : [];
}

/** Sync command files for one provider (workflows that own workspace pipelines). */
export function syncPipelineCommandsForProvider(
  root: string,
  extensionPath: string,
  providerId: string,
  opts: {
    epicRoot?: string;
    overwrite?: boolean;
    configStore?: ModelProviderConfigStore;
  } = {},
): string[] {
  return syncPipelineCommandsForProviderFiltered(
    root,
    extensionPath,
    providerId,
    readWorkspacePipelineIds(root),
    opts,
  );
}

export function syncPipelineCommands(
  root: string,
  extensionPath: string,
  opts: {
    providers?: string[];
    epicRoot?: string;
    overwrite?: boolean;
    configStore?: ModelProviderConfigStore;
    /** When set, only sync workflows that own one of these pipeline ids. */
    pipelineIds?: Set<string>;
  } = {},
): SyncPipelineCommandsResult {
  const configStore = opts.configStore ?? new ModelProviderConfigStore(root);
  const config = configStore.loadOrDefault();
  const providerIds = opts.providers?.length
    ? opts.providers
    : configStore.listEnabledProviderIds(config);
  const pipelineIds = opts.pipelineIds ?? readWorkspacePipelineIds(root);

  const commandsWritten: string[] = [];
  for (const providerId of providerIds) {
    commandsWritten.push(
      ...syncPipelineCommandsForProviderFiltered(
        root,
        extensionPath,
        providerId,
        pipelineIds,
        {
          epicRoot: opts.epicRoot,
          overwrite: opts.overwrite,
          configStore,
        },
      ),
    );
  }

  return { commandsWritten, providers: providerIds };
}

function syncPipelineCommandsForProviderFiltered(
  root: string,
  extensionPath: string,
  providerId: string,
  pipelineIds: Set<string>,
  opts: {
    epicRoot?: string;
    overwrite?: boolean;
    configStore?: ModelProviderConfigStore;
  },
): string[] {
  const configStore = opts.configStore ?? new ModelProviderConfigStore(root);
  const epicRoot = opts.epicRoot ?? readEpicRootFrom(root);
  const overwrite = opts.overwrite ?? false;
  const written: string[] = [];

  for (const workflow of BUILTIN_WORKFLOWS) {
    const ownsPipeline = [
      workflow.pipelineId,
      ...(workflow.additionalPipelines ?? []).map((a) => a.id),
    ].some((id) => pipelineIds.has(id));
    if (!ownsPipeline) { continue; }

    let preset: WorkspacePreset;
    try {
      preset = loadBuiltinPreset(extensionPath, workflow);
    } catch {
      continue;
    }
    written.push(
      ...writeBuiltinCommandsForProvider(
        root,
        providerId,
        workflow,
        preset,
        epicRoot,
        overwrite,
        configStore,
      ),
    );
  }

  // Provider-managed Idea intake is available even before a workspace has a
  // delivery pipeline. It shares the same command distribution mechanism as
  // Epic so every provider gets its native command file.
  written.push(...syncProviderManagedCommandForProvider(root, providerId, overwrite));

  // Same reasoning for the Idea Research Agent command — an Idea's
  // Understand/Research/Explore/Decide stages exist and are usable long
  // before any delivery pipeline does.
  written.push(...syncIdeaAgentCommandForProvider(root, providerId, overwrite));

  // ...and for its multi-stage pipeline variant.
  written.push(...syncIdeaPipelineCommandForProvider(root, providerId, overwrite));

  if (pipelineIds.size > 0) {
    const twoLayer = writeTwoLayerCommandsForProvider(root, providerId, { epicRoot, overwrite });
    written.push(...twoLayer.written);
  }

  return written;
}

function readWorkspacePipelineIds(root: string): Set<string> {
  try {
    const file = path.join(root, '.aidlc', 'workspace.yaml');
    if (!fs.existsSync(file)) { return new Set(); }
    const doc = yaml.load(fs.readFileSync(file, 'utf8')) as { pipelines?: Array<{ id?: unknown }> } | null;
    const ids = new Set<string>();
    for (const p of doc?.pipelines ?? []) {
      if (typeof p.id === 'string') { ids.add(p.id); }
    }
    return ids;
  } catch {
    return new Set();
  }
}

function readEpicRootFrom(root: string): string {
  return activeEpicsDir(root);
}

export { PROVIDER_MANAGED_TASK_COMMAND };
