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
  autonomousEpicMasterCommandBody,
  autonomousMasterCommandBody,
  AUTONOMOUS_EPIC_MASTER_COMMAND,
  AUTONOMOUS_MASTER_COMMAND,
} from '../delivery/AutonomousMaster';
import { ModelProviderConfigStore } from '../models/ModelProviderConfigStore';
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
  const file = adapter.commandFilePath(root, commandName);
  const rendered = adapter.renderCommandFile({
    commandName,
    description,
    body,
    epicRoot: '',
  }, mappedModel);
  return writeCommandFile(file, rendered, overwrite) ? file : null;
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
    const file = adapter.commandFilePath(root, commandName);
    if (fs.existsSync(file) && !overwrite) { continue; }
    const skillBody = preset.skillContents[phase.id]
      ?? `# ${phase.name}\n\n${phase.description}\n`;
    const spec = buildStepCommandSpec(phase, skillBody, epicRoot, commandName);
    const mappedModel = configStore.mapModel(spec.canonicalModel ?? phase.model, providerId, config);
    if (writeCommandFile(file, adapter.renderCommandFile(spec, mappedModel), overwrite)) {
      written.push(file);
    }
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
    if (writeCommandFile(
      file,
      adapter.renderCommandFile({ commandName, description, body, epicRoot }, mappedModel),
      true,
    )) {
      written.push(file);
    }
  };

  emit('aidlc', 'AIDLC dispatcher', backboneCommandDoc(epicRoot));
  for (const phase of phases) {
    emit(phase.id, `${phase.description} (AIDLC ${phase.name} phase)`, shortcutCommandDoc(phase, epicRoot));
  }

  return { written, skipped };
}

export function syncAutonomousCommandsForProvider(
  root: string,
  providerId: string,
  overwrite = false,
): string[] {
  const configStore = new ModelProviderConfigStore(root);
  const mappedModel = configStore.modelFor(providerId);
  const written: string[] = [];
  for (const entry of [
    {
      name: 'aidlc-autonomous-delivery',
      description: 'Run an entire AIDLC Cohesive Delivery autonomously.',
      body: autonomousMasterCommandBody(),
    },
    {
      name: 'aidlc-autonomous-epic',
      description: 'Run one AIDLC epic pipeline autonomously.',
      body: autonomousEpicMasterCommandBody(),
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

  if (pipelineIds.size > 0) {
    const twoLayer = writeTwoLayerCommandsForProvider(root, providerId, { epicRoot, overwrite });
    written.push(...twoLayer.written);
    written.push(...syncAutonomousCommandsForProvider(root, providerId, overwrite));
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
  try {
    const file = path.join(root, '.aidlc', 'workspace.yaml');
    if (!fs.existsSync(file)) { return 'docs/epics'; }
    const doc = yaml.load(fs.readFileSync(file, 'utf8')) as { epics?: { dir?: unknown } } | null;
    const dir = doc?.epics?.dir;
    return typeof dir === 'string' && dir.trim() ? dir.trim() : 'docs/epics';
  } catch {
    return 'docs/epics';
  }
}

export { AUTONOMOUS_MASTER_COMMAND, AUTONOMOUS_EPIC_MASTER_COMMAND };
