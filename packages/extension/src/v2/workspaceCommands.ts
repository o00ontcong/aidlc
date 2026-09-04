/**
 * Workspace commands exposed by the extension host:
 *   aidlc.showWorkspaceConfig — load .aidlc/workspace.yaml + dump parsed config
 *                               to the Output channel.
 *   aidlc.initWorkspace       — scaffold a starter workspace.yaml + sample
 *                               skill so the user has something to load.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { setTimeout } from 'timers';

import {
  WorkspaceLoader,
  WorkspaceNotFoundError,
  WorkspaceParseError,
  WorkspaceValidationError,
  WORKSPACE_DIR,
  WORKSPACE_FILENAME,
  stepAgentId,
  LegacyMigrationService,
  installWorkflowGlobalsByIds,
  writeBuiltinAutoReviewValidators,
  builtinTemplatesRoot,
  CofofoFoundationService,
} from '@aidlc/core';
import { DEFAULT_WORKFLOW_ID } from '../defaultWorkflow';

import {
  addSkillCommand,
  addAgentCommand,
  addPipelineCommand,
  generateFromRecipeCommand,
} from './wizards';
import { readEpicsDirFromYaml, writeEpicsDirToYaml, DEFAULT_EPICS_DIR, hasActiveEpicAtId } from './epicsDirSync';
import { WorkspaceWebview } from './workspaceWebview';
import { PresetStore } from './presetStore';
import {
  savePresetCommand,
  savePresetInlineCommand,
  applyPresetCommand,
  deletePresetCommand,
  syncBuiltinPipelineCommands,
} from './presetWizards';
import { loadAllBuiltinPresets, BUILTIN_WORKFLOWS } from './builtinPresets';
import {
  openAgentTerminal,
  runStepWithProvider,
} from './providerRunService';
import { installWorkflowGlobalsCommand } from './installWorkflowGlobalsCommand';
import { uninstallWorkflowGlobalsCommand } from './uninstallWorkflowGlobalsCommand';
import { StandardPickerWebview } from './standardPickerWebview';
import { startEpicCommand } from './epicWizard';
import { analyzeRequirementsCommand } from './requirementWizard';
import { registerAskCommand } from './askCommand';
import { insertDemoEpicCommand } from './demoEpic';
import { loadDemoProjectCommand } from './demoProject';
import { loadIosDemoProjectCommand } from './demoIosProject';
import { loadCofofoWeatherDemoProjectCommand } from './demoCofofoWeatherProject';
import {
  captureCofofoEvidenceCommand,
  cofofoDoctorCommand,
  ensureCofofoWorkflowCommand,
  rebaseCofofoRunCommand,
  reportCofofoBugCommand,
  showCofofoStatusCommand,
} from './cofofoCommands';
import { reconcileValidatorConflictsCommand } from './providerManagedRunCommands';
import { migrateEpicStateFiles } from './epicsList';
import {
  startPipelineRunCommand,
  markStepDoneCommand,
  skipStepCommand,
  approveStepCommand,
  reviewCanvasStepCommand,
  rejectStepCommand,
  rerunStepCommand,
  runAutoReviewCommand,
  verifyRunCommand,
  runReportCommand,
  openRunStateCommand,
  deleteRunCommand,
  deleteEpicCommand,
} from './runCommands';
import { resolveTechStackForRoot } from './techStackResolver';

/**
 * Sentinel `workflowId` value that `aidlc.initWorkspace` accepts to mean
 * "scaffold an empty workspace, no preset". Used by the webview's
 * InitWorkflowModal — it sends this when the user picks the Empty option,
 * so the host knows to skip the native QuickPick (since the React modal
 * already collected the choice).
 */
const EMPTY_WORKSPACE_SENTINEL = '__empty__';

/**
 * Build the starter workspace.yaml. Minimal scaffold — no placeholder agents
 * or skills. The 8 built-in workflows are auto-injected into the panel from
 * the extension's bundled presets; the user applies whichever fits their
 * stack, or adds their own via the wizards.
 */
function sampleWorkspaceYaml(workspaceName: string): string {
  // Quote the name to handle spaces, dashes, and unicode safely. js-yaml
  // would handle this on round-trip but we hand-write the template here.
  const escapedName = workspaceName.replace(/"/g, '\\"');
  return `version: "1.0"
name: "${escapedName}"

agents: []

skills: []

environment: {}

slash_commands: []

sidebar:
  views:
    - type: agents-list
    - type: skills-list
`;
}

export function registerV2WorkspaceCommands(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): { disposables: vscode.Disposable[]; presetStore: PresetStore } {
  const showCmd = vscode.commands.registerCommand(
    'aidlc.showWorkspaceConfig',
    () => showWorkspaceConfig(output),
  );

  const initCmd = vscode.commands.registerCommand(
    'aidlc.initWorkspace',
    (workflowId?: unknown) =>
      initWorkspace(output, context, typeof workflowId === 'string' ? workflowId : undefined),
  );

  const openGettingStartedCmd = vscode.commands.registerCommand(
    'aidlc.openGettingStarted',
    () => openGettingStartedGuide(context),
  );

  const askCmd = registerAskCommand(context);

  const addSkillCmd = vscode.commands.registerCommand(
    'aidlc.addSkill',
    () => addSkillCommand(),
  );

  const addAgentCmd = vscode.commands.registerCommand(
    'aidlc.addAgent',
    () => addAgentCommand(),
  );

  const addPipelineCmd = vscode.commands.registerCommand(
    'aidlc.addPipeline',
    () => addPipelineCommand(),
  );

  const generateFromRecipeCmd = vscode.commands.registerCommand(
    'aidlc.generateFromRecipe',
    () => generateFromRecipeCommand(),
  );

  const openBuilderCmd = vscode.commands.registerCommand(
    'aidlc.openBuilder',
    () => WorkspaceWebview.show(context.extensionUri, 'builder'),
  );

  // Preset library — single store instance shared across all preset commands
  // and the Builder panel. User templates live in `<project>/.aidlc/templates/`
  // (project-scoped, committable). Built-ins are loaded from the extension.
  const presetStore = new PresetStore();
  presetStore.setBuiltinLoader(() => loadAllBuiltinPresets(context.extensionPath));

  const savePresetCmd = vscode.commands.registerCommand(
    'aidlc.savePreset',
    () => savePresetCommand(presetStore),
  );

  const savePresetInlineCmd = vscode.commands.registerCommand(
    'aidlc.savePresetInline',
    (draft?: unknown) => {
      if (!draft || typeof draft !== 'object') { return; }
      const d = draft as Record<string, unknown>;
      void savePresetInlineCommand(presetStore, {
        id: typeof d.id === 'string' ? d.id : '',
        name: typeof d.name === 'string' ? d.name : '',
        description: typeof d.description === 'string' ? d.description : '',
      });
    },
  );

  const applyPresetCmd = vscode.commands.registerCommand(
    'aidlc.applyPreset',
    (presetId?: unknown, skipConfirm?: unknown) =>
      applyPresetCommand(
        presetStore,
        context.extensionPath,
        typeof presetId === 'string' ? presetId : undefined,
        skipConfirm === true,
      ),
  );

  const deletePresetCmd = vscode.commands.registerCommand(
    'aidlc.deletePreset',
    () => deletePresetCommand(presetStore),
  );

  const installWorkflowGlobalsCmd = vscode.commands.registerCommand(
    'aidlc.installWorkflowGlobals',
    () => installWorkflowGlobalsCommand(context.extensionPath, output),
  );

  const uninstallWorkflowGlobalsCmd = vscode.commands.registerCommand(
    'aidlc.uninstallWorkflowGlobals',
    () => uninstallWorkflowGlobalsCommand(context.extensionPath, output),
  );

  const migrateEpicsCmd = vscode.commands.registerCommand(
    'aidlc.migrateEpics',
    async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        void vscode.window.showWarningMessage('AIDLC: open a project folder first.');
        return;
      }
      // First capture/backfill runs against the currently-installed pipeline.
      // That preserves stable phase identities before the bundle definition is
      // upgraded and lets the second pass insert phases by name.
      const prepared = migrateEpicStateFiles(root);
      let legacyEpicsConverted = 0;
      let epicsDirSwitched = false;
      let skippedActiveDuplicates = 0;
      try {
        // After legacy bundle/runs are stabilized, explicitly project
        // legacy delivery/run/epic-scaffold records into the unified .aidlc/epics layout.
        // This is idempotent and backed by migration manifests.
        const legacyMigration = new LegacyMigrationService(root);
        const migrationPreview = legacyMigration.preview();
        const migrationConflicts = migrationPreview.items.filter((item) => item.disposition === 'conflict');
        if (migrationConflicts.length > 0) {
          throw new Error(
            `Legacy epic migration conflicts:\n${migrationConflicts.map((item) => `${item.targetEpicId}: ${item.warnings.join('; ') || 'target already exists'}`).join('\n')}`,
          );
        }
        // A legacy record (e.g. `.aidlc/runs/SPIKE-01.json`) can be stale audit
        // data for an id that already has a fully working epic sitting in the
        // currently active epics dir (e.g. `<epicsDir>/SPIKE-01/state.json`).
        // LegacyMigrationService only checks the *target* (`EPIC-SPIKE-01`) for
        // conflicts, so without this check it would happily create an inert
        // `EPIC-SPIKE-01` duplicate the user can't interact with, next to the
        // real `SPIKE-01` epic. Skip migrating any record whose base id already
        // has a live epic instead of shadowing it.
        const currentEpicsDir = readEpicsDirFromYaml(root);
        const creatableItems = migrationPreview.items.filter((item) => {
          if (item.disposition !== 'create') { return false; }
          const baseId = item.targetEpicId.replace(/^EPIC-/, '');
          if (hasActiveEpicAtId(root, currentEpicsDir, baseId)) {
            skippedActiveDuplicates++;
            return false;
          }
          return true;
        });
        if (creatableItems.length > 0) {
          legacyMigration.apply({ ...migrationPreview, items: creatableItems }, { confirm: true });
          legacyEpicsConverted = creatableItems.length;
        }
        const hasUnifiedEpicsDir = fs.existsSync(path.join(root, '.aidlc', 'epics'));
        if (
          hasUnifiedEpicsDir
          && (currentEpicsDir === DEFAULT_EPICS_DIR || currentEpicsDir === 'docs/epics')
        ) {
          writeEpicsDirToYaml(root, '.aidlc/epics');
          epicsDirSwitched = true;
        }
      } catch (err) {
        void vscode.window.showErrorMessage(
          `AIDLC: legacy workspace migration failed — ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      const updated = migrateEpicStateFiles(root);
      const report = {
        migrated: [...new Set([...prepared.migrated, ...updated.migrated])],
        backfilled: [...new Set([...prepared.backfilled, ...updated.backfilled])],
        addedSteps: [...prepared.addedSteps, ...updated.addedSteps],
        reopenedSteps: [...prepared.reopenedSteps, ...updated.reopenedSteps],
        skipped: [...prepared.skipped, ...updated.skipped],
        errors: [...prepared.errors, ...updated.errors],
      };
      const parts: string[] = [];
      if (legacyEpicsConverted > 0) {
        parts.push(`converted ${legacyEpicsConverted} legacy epic(s)`);
      }
      if (skippedActiveDuplicates > 0) {
        parts.push(`skipped ${skippedActiveDuplicates} legacy record(s) already live as an epic`);
      }
      if (epicsDirSwitched) {
        parts.push('epics dir switched to .aidlc/epics');
      }
      const addedCount = report.addedSteps.reduce((sum, item) => sum + item.stepIds.length, 0);
      if (addedCount > 0) {
        parts.push(`${addedCount} new step(s) added`);
      }
      const reopenedCount = report.reopenedSteps.reduce((sum, item) => sum + item.stepIds.length, 0);
      if (reopenedCount > 0) {
        parts.push(`${reopenedCount} graph step(s) reopened`);
      }
      if (report.migrated.length > 0) {
        parts.push(`migrated ${report.migrated.length}`);
      }
      if (report.backfilled.length > 0) {
        parts.push(`backfilled ${report.backfilled.length}`);
      }
      if (report.skipped.length > 0) {
        parts.push(`skipped ${report.skipped.length}`);
      }
      if (report.errors.length > 0) {
        parts.push(`${report.errors.length} error(s)`);
      }
      if (parts.length === 0) {
        void vscode.window.showInformationMessage('AIDLC: no epics to migrate.');
        return;
      }
      const summary = `AIDLC migration — ${parts.join(', ')}.`;
      const blockers: string[] = [];
      const skippedByReason = new Map<string, string[]>();
      for (const s of report.skipped) {
        const list = skippedByReason.get(s.reason) ?? [];
        list.push(s.epicId);
        skippedByReason.set(s.reason, list);
      }
      for (const [reason, ids] of skippedByReason) {
        const head = ids.slice(0, 3).join(', ');
        const more = ids.length > 3 ? `, +${ids.length - 3} more` : '';
        blockers.push(`${reason} (${head}${more})`);
      }
      if (report.errors.length > 0) {
        blockers.push(
          `${report.errors[0].epicId}: ${report.errors[0].reason}`,
        );
      }

      if (blockers.length > 0) {
        const detail = blockers.join('\n• ');
        void vscode.window.showWarningMessage(
          `${summary}\n• ${detail}`,
          { modal: false },
        );
      } else {
        void vscode.window.showInformationMessage(summary);
      }
      WorkspaceWebview.refreshCurrent();
    },
  );

  const startEpicCmd = vscode.commands.registerCommand(
    'aidlc.startEpic',
    () => startEpicCommand(),
  );

  const analyzeRequirementsCmd = vscode.commands.registerCommand(
    'aidlc.analyzeRequirements',
    () => analyzeRequirementsCommand(context.extensionPath),
  );

  // GH-69 P3: pick the SDLC compliance standard for this workspace (webview).
  const selectStandardCmd = vscode.commands.registerCommand(
    'aidlc.selectStandard',
    () => StandardPickerWebview.show(context.extensionUri),
  );

  const openEpicsListCmd = vscode.commands.registerCommand(
    'aidlc.openEpicsList',
    () => WorkspaceWebview.show(context.extensionUri, 'epics'),
  );

  const insertDemoEpicCmd = vscode.commands.registerCommand(
    'aidlc.insertDemoEpic',
    () => insertDemoEpicCommand(),
  );

  const loadDemoProjectCmd = vscode.commands.registerCommand(
    'aidlc.loadDemoProject',
    (mode?: unknown) =>
      loadDemoProjectCommand(
        mode === 'reseed' || mode === 'open-as-is' ? mode : undefined,
      ),
  );

  const loadIosDemoProjectCmd = vscode.commands.registerCommand(
    'aidlc.loadIosDemoProject',
    (mode?: unknown) =>
      loadIosDemoProjectCommand(
        context.extensionPath,
        mode === 'reseed' || mode === 'open-as-is' ? mode : undefined,
      ),
  );

  const loadCofofoWeatherDemoProjectCmd = vscode.commands.registerCommand(
    'aidlc.loadCofofoWeatherDemoProject',
    (mode?: unknown) =>
      loadCofofoWeatherDemoProjectCommand(
        context.extensionPath,
        mode === 'reseed' || mode === 'open-as-is' ? mode : undefined,
      ),
  );
  // Kept as a compatibility command id. CoFoFo is now a project-local
  // default, and this command performs the same idempotent ensure path.
  const ensureCofofoWorkflowCmd = vscode.commands.registerCommand(
    'aidlc.installCofofoWorkflow',
    () => ensureCofofoWorkflowCommand(context.extensionPath),
  );
  const showCofofoStatusCmd = vscode.commands.registerCommand(
    'aidlc.showCofofoStatus',
    () => showCofofoStatusCommand(context.extensionPath),
  );
  const rebaseCofofoRunCmd = vscode.commands.registerCommand(
    'aidlc.rebaseCofofoRun',
    () => rebaseCofofoRunCommand(),
  );
  const captureCofofoEvidenceCmd = vscode.commands.registerCommand(
    'aidlc.captureCofofoEvidence',
    () => captureCofofoEvidenceCommand(),
  );
  const reportCofofoBugCmd = vscode.commands.registerCommand(
    'aidlc.reportCofofoBug',
    (runId?: unknown, fields?: unknown) =>
      reportCofofoBugCommand(
        typeof runId === 'string' ? runId : undefined,
        fields && typeof fields === 'object' ? fields as { did?: string; observed?: string; expected?: string } : undefined,
      ),
  );
  const cofofoDoctorCmd = vscode.commands.registerCommand(
    'aidlc.cofofoDoctor',
    () => cofofoDoctorCommand(),
  );

  // Reuses an existing terminal if one is open so the user doesn't end up
  // with a stack of Claude REPLs after multiple clicks.
  //
  // Why we wait for shell integration instead of an immediate sendText:
  // some users have heavy `.zshrc` setups (oh-my-zsh update prompt,
  // direnv, nvm, asdf) that read stdin during init. A naked sendText
  // races those — `claude` lands in the wrong input buffer and never
  // actually runs, leaving the user staring at the rc-script prompt
  // wondering what happened. Shell integration's onDidChange fires
  // exactly when the prompt is ready, so executeCommand lands cleanly.
  /**
   * Run a pipeline step via the workspace default agent provider (Claude /
   * Cursor / Codex). Ensures provider command files exist, maps the step
   * model when known, and opens a fresh terminal with the one-shot CLI.
   */
  const runStepWithProviderCmd = vscode.commands.registerCommand(
    'aidlc.runStepWithProvider',
    (
      slashCommand?: unknown,
      runId?: unknown,
      feedback?: unknown,
      providerId?: unknown,
    ) => {
      const slash = typeof slashCommand === 'string' ? slashCommand.trim() : '';
      const id = typeof runId === 'string' ? runId.trim() : '';
      const fb = typeof feedback === 'string' ? feedback.trim() : '';
      const provider = typeof providerId === 'string' ? providerId.trim() : undefined;
      if (!slash || !id) { return; }

      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { return; }

      runStepWithProvider({
        slashCommand: slash,
        runId: id,
        feedback: fb,
        providerId: provider,
        root,
        extensionPath: context.extensionPath,
      });
    },
  );

  /** Back-compat alias — delegates to {@link runStepWithProvider}. */
  const runWithFeedbackCmd = vscode.commands.registerCommand(
    'aidlc.runStepWithFeedback',
    (slashCommand?: unknown, runId?: unknown, feedback?: unknown) => {
      void vscode.commands.executeCommand(
        'aidlc.runStepWithProvider',
        slashCommand,
        runId,
        feedback,
      );
    },
  );

  const openAgentTerminalCmd = vscode.commands.registerCommand(
    'aidlc.openAgentTerminal',
    (providerId?: unknown) => {
      openAgentTerminal(typeof providerId === 'string' ? providerId : undefined);
    },
  );

  /** Back-compat alias — delegates to {@link openAgentTerminal}. */
  const openClaudeTerminalCmd = vscode.commands.registerCommand(
    'aidlc.openClaudeTerminal',
    () => {
      openAgentTerminal();
    },
  );

  // Pipeline run commands (phase 1 orchestrator).
  const startRunCmd = vscode.commands.registerCommand(
    'aidlc.startPipelineRun',
    (pipelineId?: unknown) =>
      startPipelineRunCommand(typeof pipelineId === 'string' ? pipelineId : undefined),
  );
  const reconcileValidatorConflictsCmd = vscode.commands.registerCommand(
    'aidlc.reconcileValidatorConflicts',
    () => reconcileValidatorConflictsCommand(),
  );
  const toStepIdx = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) ? v : undefined;
  const markStepDoneCmd = vscode.commands.registerCommand(
    'aidlc.markStepDone',
    (runId?: unknown, stepIdx?: unknown) =>
      markStepDoneCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const skipStepCmd = vscode.commands.registerCommand(
    'aidlc.skipStep',
    (runId?: unknown, stepIdx?: unknown) =>
      skipStepCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const approveStepCmd = vscode.commands.registerCommand(
    'aidlc.approveStep',
    (runId?: unknown, stepIdx?: unknown) =>
      approveStepCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const reviewCanvasStepCmd = vscode.commands.registerCommand(
    'aidlc.reviewCanvasStep',
    (runId?: unknown, stepIdx?: unknown) =>
      reviewCanvasStepCommand(
        context.extensionPath,
        typeof runId === 'string' ? runId : undefined,
        toStepIdx(stepIdx),
      ),
  );
  const rejectStepCmd = vscode.commands.registerCommand(
    'aidlc.rejectStep',
    (runId?: unknown, stepIdx?: unknown) =>
      rejectStepCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const rerunStepCmd = vscode.commands.registerCommand(
    'aidlc.rerunStep',
    (runId?: unknown, stepIdx?: unknown) =>
      rerunStepCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const runAutoReviewCmd = vscode.commands.registerCommand(
    'aidlc.runAutoReview',
    (runId?: unknown, stepIdx?: unknown) =>
      runAutoReviewCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const verifyRunCmd = vscode.commands.registerCommand(
    'aidlc.verifyRun',
    (runId?: unknown) => verifyRunCommand(typeof runId === 'string' ? runId : undefined),
  );
  const runReportCmd = vscode.commands.registerCommand(
    'aidlc.runReport',
    (runId?: unknown) => runReportCommand(typeof runId === 'string' ? runId : undefined),
  );
  const openRunStateCmd = vscode.commands.registerCommand(
    'aidlc.openRunState',
    (runId?: unknown) => openRunStateCommand(typeof runId === 'string' ? runId : undefined),
  );
  const deleteRunCmd = vscode.commands.registerCommand(
    'aidlc.deleteRun',
    (runId?: unknown, skipConfirm?: unknown) =>
      deleteRunCommand(
        typeof runId === 'string' ? runId : undefined,
        skipConfirm === true,
      ),
  );
  const deleteEpicCmd = vscode.commands.registerCommand(
    'aidlc.deleteEpic',
    (epicId?: unknown, runId?: unknown, deleteFolder?: unknown, skipConfirm?: unknown) =>
      deleteEpicCommand(
        typeof epicId === 'string' ? epicId : '',
        typeof runId === 'string' ? runId : undefined,
        deleteFolder === true,
        skipConfirm === true,
      ),
  );

  return {
    disposables: [
      showCmd,
      initCmd,
      openGettingStartedCmd,
      askCmd,
      addSkillCmd,
      addAgentCmd,
      addPipelineCmd,
      generateFromRecipeCmd,
      openBuilderCmd,
      openAgentTerminalCmd,
      openClaudeTerminalCmd,
      runStepWithProviderCmd,
      runWithFeedbackCmd,
      savePresetCmd,
      savePresetInlineCmd,
      applyPresetCmd,
      deletePresetCmd,
      installWorkflowGlobalsCmd,
      uninstallWorkflowGlobalsCmd,
      migrateEpicsCmd,
      startEpicCmd,
      analyzeRequirementsCmd,
      selectStandardCmd,
      openEpicsListCmd,
      insertDemoEpicCmd,
      loadDemoProjectCmd,
      loadIosDemoProjectCmd,
      loadCofofoWeatherDemoProjectCmd,
      ensureCofofoWorkflowCmd,
      showCofofoStatusCmd,
      rebaseCofofoRunCmd,
      captureCofofoEvidenceCmd,
      reportCofofoBugCmd,
      cofofoDoctorCmd,
      startRunCmd,
      reconcileValidatorConflictsCmd,
      markStepDoneCmd,
      skipStepCmd,
      approveStepCmd,
      reviewCanvasStepCmd,
      rejectStepCmd,
      rerunStepCmd,
      runAutoReviewCmd,
      verifyRunCmd,
      runReportCmd,
      openRunStateCmd,
      deleteRunCmd,
      deleteEpicCmd,
    ],
    presetStore,
  };
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Require a workspace folder. If none is open, show a warning that points
 * the user back to the sidebar's Open Project flow. We don't surface a
 * folder picker here because Init / Apply / Save commands are explicitly
 * scoped to the *currently active* project — switching projects is its
 * own action (sidebar ⇄ button or "Switch Project" command).
 */
function requireWorkspaceRoot(): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage(
      'AIDLC: Open a project first — this command targets the currently active workspace folder.',
    );
    return undefined;
  }
  return root;
}

async function showWorkspaceConfig(output: vscode.OutputChannel): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) { return; }

  try {
    const loaded = WorkspaceLoader.load(root);

    output.clear();
    output.appendLine(`✓ Loaded ${loaded.configPath}`);
    output.appendLine('');
    output.appendLine(`name:    ${loaded.config.name}`);
    output.appendLine(`version: ${loaded.config.version}`);
    output.appendLine('');

    output.appendLine(`agents (${loaded.config.agents.length}):`);
    for (const a of loaded.config.agents) {
      output.appendLine(`  - ${a.id}  [${a.runner}]  → skills: ${a.skills.join(', ')}`);
    }
    output.appendLine('');

    output.appendLine(`skills (${loaded.config.skills.length}):`);
    for (const s of loaded.config.skills) {
      const src = s.builtin ? 'builtin' : (s.path ?? '(no source)');
      const status = loaded.skills.has(s.id) ? '✓' : '✗';
      output.appendLine(`  ${status} ${s.id}  → ${src}`);
    }
    output.appendLine('');

    output.appendLine(`slash_commands (${loaded.config.slash_commands.length}):`);
    for (const c of loaded.config.slash_commands) {
      const target = 'agent' in c ? `agent ${c.agent}` : `pipeline ${c.pipeline}`;
      output.appendLine(`  ${c.name}  → ${target}`);
    }
    output.appendLine('');

    output.appendLine(`pipelines (${loaded.config.pipelines.length}):`);
    for (const p of loaded.config.pipelines) {
      const stepLabels = p.steps.map(stepAgentId).join(' → ');
      output.appendLine(`  ${p.id}: ${stepLabels}  (on_failure: ${p.on_failure})`);
    }
    output.appendLine('');

    if (loaded.config.state) {
      output.appendLine(`state:`);
      output.appendLine(`  entity: ${loaded.config.state.entity}`);
      output.appendLine(`  root:   ${loaded.config.state.root}`);
    }

    if (loaded.config.sidebar?.views.length) {
      output.appendLine(`sidebar.views (${loaded.config.sidebar.views.length}):`);
      for (const v of loaded.config.sidebar.views) {
        output.appendLine(`  - ${v.type}${'label' in v && v.label ? ` (${v.label})` : ''}`);
      }
    }

    output.appendLine('');
    output.appendLine('— resolved environment —');
    const env = loaded.envResolver.resolveLayered(loaded.config.environment, undefined);
    for (const [k, v] of Object.entries(env)) {
      const masked = /KEY|TOKEN|SECRET|PASSWORD/i.test(k) && v ? '***' : v || '(empty)';
      output.appendLine(`  ${k} = ${masked}`);
    }

    output.show(true);
    void vscode.window.showInformationMessage(
      `AIDLC workspace loaded: ${loaded.config.agents.length} agent(s), ${loaded.config.skills.length} skill(s).`,
    );
  } catch (err) {
    handleLoadError(err, output);
  }
}

function handleLoadError(err: unknown, output: vscode.OutputChannel): void {
  if (err instanceof WorkspaceNotFoundError) {
    void vscode.window
      .showWarningMessage(
        `No \`.aidlc/${WORKSPACE_FILENAME}\` found. Initialize one?`,
        'Initialize',
      )
      .then((choice) => {
        if (choice === 'Initialize') {
          void vscode.commands.executeCommand('aidlc.initWorkspace');
        }
      });
    return;
  }
  if (err instanceof WorkspaceValidationError) {
    output.clear();
    output.appendLine(`✗ ${err.message}`);
    output.appendLine('');
    output.appendLine('Issues:');
    for (const i of err.issues) {
      output.appendLine(`  ${i.path.join('.') || '<root>'}: ${i.message}`);
    }
    output.show(true);
    void vscode.window.showErrorMessage(
      'AIDLC workspace.yaml has validation errors. See AIDLC output channel.',
    );
    return;
  }
  if (err instanceof WorkspaceParseError) {
    void vscode.window.showErrorMessage(`AIDLC: ${err.message}`);
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  output.appendLine(`✗ Unexpected error: ${msg}`);
  output.show(true);
  void vscode.window.showErrorMessage(`AIDLC: failed to load workspace — ${msg}`);
}

async function initWorkspace(
  output: vscode.OutputChannel,
  context: vscode.ExtensionContext,
  /**
   * Pre-selected workflow id. When supplied (webview's `InitWorkflowModal`
   * already prompted the user), skip the VS Code QuickPick and apply
   * directly. Sentinel value `'__empty__'` means the user explicitly chose
   * "Empty workspace" in the modal — scaffold an empty `workspace.yaml`
   * without showing the picker.
   */
  workflowIdArg?: string,
): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) { return; }

  const aidlcDir = path.join(root, WORKSPACE_DIR);
  const workspaceFile = path.join(aidlcDir, WORKSPACE_FILENAME);

  if (fs.existsSync(workspaceFile)) {
    const choice = await vscode.window.showWarningMessage(
      `${WORKSPACE_DIR}/${WORKSPACE_FILENAME} already exists. Overwrite?`,
      { modal: false },
      'Overwrite',
      'Cancel',
    );
    if (choice !== 'Overwrite') {
      return;
    }
  }

  // When invoked from the webview's InitWorkflowModal, `workflowIdArg`
  // carries the user's choice already. Skip the VS Code QuickPick — it
  // would feel redundant after the React modal. An undefined arg means
  // command-palette invocation (fall back to the native picker).
  interface PipelinePick extends vscode.QuickPickItem {
    workflowId?: string;
  }
  let chosenWorkflowId: string | undefined;
  let chosenEmpty = false;
  if (workflowIdArg && workflowIdArg !== EMPTY_WORKSPACE_SENTINEL) {
    chosenWorkflowId = workflowIdArg;
  } else if (workflowIdArg === EMPTY_WORKSPACE_SENTINEL) {
    chosenEmpty = true;
  } else {
    const picks: PipelinePick[] = [
      {
        label: '$(star-full) CoFoFo Workflow',
        description: 'Recommended',
        detail: 'Project-local Foundation, Feature, and Bugfix pipelines with evidence and Canvas gates.',
        workflowId: DEFAULT_WORKFLOW_ID,
      },
      ...BUILTIN_WORKFLOWS.map((w) => {
        return {
          label: w.name,
          description: 'Optional preset',
          detail: w.description,
          workflowId: w.id,
        } satisfies PipelinePick;
      }),
      {
        label: '$(file) Empty workspace',
        description: 'Start from scratch',
        detail: 'Scaffold an empty workspace.yaml — add agents / skills / pipelines yourself.',
      },
    ];
    const picked = await vscode.window.showQuickPick(picks, {
      title: 'Initialize AIDLC workspace',
      placeHolder: 'Pick a starting workflow (or start empty)',
      ignoreFocusOut: true,
      matchOnDetail: true,
    });
    if (!picked) { return; }
    chosenWorkflowId = picked.workflowId;
    chosenEmpty = !picked.workflowId;
  }

  if (chosenWorkflowId === DEFAULT_WORKFLOW_ID) {
    try {
      const catalogRoot = path.join(context.extensionPath, 'templates', 'cofofo', 'catalog');
      new CofofoFoundationService(root, catalogRoot).ensureWorkflowRegistered();
      output.appendLine(`[init] ensured project-local CoFoFo workflow in ${root}`);
      void vscode.window.showInformationMessage(
        'CoFoFo workspace is ready with Foundation, Feature, and Bugfix pipelines.',
      );
      void vscode.commands.executeCommand('aidlc.openBuilder');
      openGettingStartedGuide(context);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AIDLC: failed to prepare CoFoFo — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  if (chosenWorkflowId) {
    // Apply the chosen built-in preset — handles install-globals prompt
    // and writes workspace.yaml + .claude/commands/*. `skipConfirm: true`
    // because the user already confirmed at the overwrite prompt above
    // (or there was no existing file).
    await vscode.commands.executeCommand('aidlc.applyPreset', chosenWorkflowId, true);
    void vscode.commands.executeCommand('aidlc.openBuilder');
    openGettingStartedGuide(context);
    return;
  }
  void chosenEmpty;

  try {
    fs.mkdirSync(aidlcDir, { recursive: true });
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name
      ?? path.basename(root);
    fs.writeFileSync(workspaceFile, sampleWorkspaceYaml(workspaceName), 'utf8');
    output.appendLine(`[init] wrote ${workspaceFile}`);

    void vscode.window
      .showInformationMessage(
        'AIDLC workspace initialized at .aidlc/. Open Builder?',
        'Open Builder',
      )
      .then((choice) => {
        if (choice === 'Open Builder') {
          void vscode.commands.executeCommand('aidlc.openBuilder');
        }
      });
    // Open the new workspace.yaml so the user can edit it
    const doc = await vscode.workspace.openTextDocument(workspaceFile);
    await vscode.window.showTextDocument(doc, { preview: false });
    openGettingStartedGuide(context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`AIDLC init failed: ${msg}`);
  }
}

/**
 * Open the bundled Getting Started markdown in VS Code's markdown preview.
 * Falls back to opening the file as a regular text doc when the preview
 * command isn't available. Idempotent — VS Code re-focuses the existing
 * preview tab if it's already open.
 */
function openGettingStartedGuide(context: vscode.ExtensionContext): void {
  const guidePath = path.join(context.extensionPath, 'media', 'getting-started.md');
  if (!fs.existsSync(guidePath)) {
    void vscode.window.showWarningMessage(
      `AIDLC: getting-started guide not found at ${guidePath}.`,
    );
    return;
  }
  const uri = vscode.Uri.file(guidePath);
  void vscode.commands.executeCommand('markdown.showPreview', uri).then(
    undefined,
    () => {
      void vscode.window.showTextDocument(uri, { preview: false });
    },
  );
}
