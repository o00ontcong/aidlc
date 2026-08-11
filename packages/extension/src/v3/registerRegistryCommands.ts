/**
 * Wires the Skill/Agent/Pipeline registry and the registry step runner
 * (IMPLEMENT.md §2 steps 2–4, `@aidlc/core` `registry/*`) into VS Code:
 * writing a pipeline auto-generates its `/aidlc-<id>` slash command file, any
 * registry write shows a Reload notification, and running/rerunning a
 * pipeline step only ever opens/sends to the existing Claude terminal — this
 * module never executes AI itself (IMPLEMENT.md §0.4).
 */

import * as vscode from 'vscode';
import * as os from 'os';

import {
  AgentStore,
  SkillStore,
  PipelineStore,
  PipelineRunStore,
  StepRunner,
  applyRedrawDesignPreset,
  REDRAW_DESIGN_PIPELINE,
  writePipelineCommand,
  registryPipelineCommandId,
} from '@aidlc/core';
import { MOCK_PIPELINES } from './mockRegistryData';

interface ActorRef {
  kind: 'user' | 'agent' | 'system';
  id: string;
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function currentActor(): ActorRef {
  return { kind: 'user', id: os.userInfo().username || 'vscode-user' };
}

async function notifyReloadRequired(message: string): Promise<void> {
  const action = await vscode.window.showInformationMessage(message, 'Reload');
  if (action === 'Reload') {
    void vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

/** Opens/reuses the Claude terminal and sends `/aidlc-<pipelineId> <epicId>` — never runs AI in-process. */
async function dispatchToTerminal(root: string, pipelineId: string, epicId: string, feedback?: string): Promise<void> {
  await vscode.commands.executeCommand('aidlc.runStepWithFeedback', `/${registryPipelineCommandId(pipelineId)}`, epicId, feedback);
}

export function registerRegistryCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  const unsubscribers: Array<() => void> = [];

  const bindStores = (root: string) => {
    const agents = new AgentStore(root);
    const skills = new SkillStore(root);
    const pipelines = new PipelineStore(root, MOCK_PIPELINES as unknown as ConstructorParameters<typeof PipelineStore>[1]);
    const runner = new StepRunner(new PipelineRunStore(root));

    unsubscribers.push(pipelines.onChange(({ id }) => {
      const pipeline = pipelines.read(id);
      if (pipeline) writePipelineCommand(root, pipeline, { overwrite: true });
      void notifyReloadRequired(`Pipeline "${id}" was updated. Reload VS Code to pick up its /${registryPipelineCommandId(id)} command.`);
    }));
    unsubscribers.push(agents.onChange(({ id }) => {
      void notifyReloadRequired(`Agent "${id}" was updated. Reload VS Code to see it in the Builder tab.`);
    }));
    unsubscribers.push(skills.onChange(({ id }) => {
      void notifyReloadRequired(`Skill "${id}" was updated. Reload VS Code to see it in the Builder tab.`);
    }));

    return { agents, skills, pipelines, runner };
  };

  let stores = workspaceRoot() ? bindStores(workspaceRoot()!) : undefined;

  disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
    unsubscribers.splice(0).forEach((unsub) => unsub());
    const root = workspaceRoot();
    stores = root ? bindStores(root) : undefined;
  }));

  const requirePipeline = (pipelineId: string) => {
    const pipeline = stores?.pipelines.read(pipelineId);
    if (!pipeline) void vscode.window.showErrorMessage(`AIDLC: pipeline "${pipelineId}" was not found in .aidlc/pipelines or the bundled set.`);
    return pipeline ?? null;
  };

  disposables.push(vscode.commands.registerCommand(
    'aidlc.preset.redrawDesign.apply',
    async () => {
      const root = workspaceRoot();
      if (!root) return;
      const result = applyRedrawDesignPreset(root);
      // The preset creates a fresh store instance, so its write event is not
      // observed by the long-lived registry store above. Generate the command
      // explicitly before asking VS Code to reload.
      writePipelineCommand(root, REDRAW_DESIGN_PIPELINE, { overwrite: true });
      await notifyReloadRequired(
        result.skillsWritten.length || result.agentWritten || result.pipelineWritten
          ? 'Redraw Design preset installed. Reload VS Code to pick up its skills, agent, and slash command.'
          : 'Redraw Design preset is already installed. Reload VS Code if its slash command is not visible yet.',
      );
    },
  ));

  disposables.push(vscode.commands.registerCommand(
    'aidlc.registry.pipeline.run',
    async (epicId?: unknown, pipelineId?: unknown, feedback?: unknown) => {
      const root = workspaceRoot();
      const id = typeof epicId === 'string' ? epicId.trim() : '';
      const pid = typeof pipelineId === 'string' ? pipelineId.trim() : '';
      if (!root || !stores || !id || !pid) return;
      const pipeline = requirePipeline(pid);
      if (!pipeline) return;

      writePipelineCommand(root, pipeline);
      stores.runner.ensureStarted(pipeline, id);
      await dispatchToTerminal(root, pid, id, typeof feedback === 'string' ? feedback : undefined);
    },
  ));

  disposables.push(vscode.commands.registerCommand(
    'aidlc.registry.step.run',
    async (epicId?: unknown, pipelineId?: unknown, stepId?: unknown) => {
      const root = workspaceRoot();
      const id = typeof epicId === 'string' ? epicId.trim() : '';
      const pid = typeof pipelineId === 'string' ? pipelineId.trim() : '';
      const sid = typeof stepId === 'string' ? stepId.trim() : '';
      if (!root || !stores || !id || !pid || !sid) return;
      const pipeline = requirePipeline(pid);
      if (!pipeline) return;

      const run = stores.runner.ensureStarted(pipeline, id);
      try {
        stores.runner.runStep(pipeline, run, sid, currentActor());
      } catch (error) {
        void vscode.window.showErrorMessage(`AIDLC: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      writePipelineCommand(root, pipeline);
      await dispatchToTerminal(root, pid, id);
    },
  ));

  /** Called by the "Mark step done" affordance after Claude has finished in the visible terminal. */
  disposables.push(vscode.commands.registerCommand(
    'aidlc.registry.step.complete',
    async (epicId?: unknown, pipelineId?: unknown, stepId?: unknown) => {
      const id = typeof epicId === 'string' ? epicId.trim() : '';
      const pid = typeof pipelineId === 'string' ? pipelineId.trim() : '';
      const sid = typeof stepId === 'string' ? stepId.trim() : '';
      if (!stores || !id || !pid || !sid) return;
      const pipeline = requirePipeline(pid);
      if (!pipeline) return;

      const run = stores.runner.ensureStarted(pipeline, id);
      try {
        const next = stores.runner.completeStep(pipeline, run, sid, currentActor());
        const status = next.steps.find((step) => step.id === sid)?.status;
        void vscode.window.showInformationMessage(
          status === 'human-review'
            ? `AIDLC: step "${sid}" is awaiting human review.`
            : status === 'auto-review'
              ? `AIDLC: step "${sid}" is awaiting auto-review.`
              : `AIDLC: step "${sid}" completed.`,
        );
      } catch (error) {
        void vscode.window.showErrorMessage(`AIDLC: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  ));

  disposables.push(vscode.commands.registerCommand(
    'aidlc.registry.step.rerun',
    async (epicId?: unknown, pipelineId?: unknown, stepId?: unknown, feedback?: unknown) => {
      const root = workspaceRoot();
      const id = typeof epicId === 'string' ? epicId.trim() : '';
      const pid = typeof pipelineId === 'string' ? pipelineId.trim() : '';
      const sid = typeof stepId === 'string' ? stepId.trim() : '';
      const fb = typeof feedback === 'string' ? feedback : undefined;
      if (!root || !stores || !id || !pid || !sid) return;
      const pipeline = requirePipeline(pid);
      if (!pipeline) return;

      const run = stores.runner.ensureStarted(pipeline, id);
      stores.runner.rerunStep(pipeline, run, sid, currentActor(), fb);
      writePipelineCommand(root, pipeline);
      await dispatchToTerminal(root, pid, id, fb);
    },
  ));

  disposables.push(vscode.commands.registerCommand(
    'aidlc.registry.gate.approve',
    async (epicId?: unknown, pipelineId?: unknown, stepId?: unknown) => {
      const id = typeof epicId === 'string' ? epicId.trim() : '';
      const pid = typeof pipelineId === 'string' ? pipelineId.trim() : '';
      const sid = typeof stepId === 'string' ? stepId.trim() : '';
      if (!stores || !id || !pid || !sid) return;
      const pipeline = requirePipeline(pid);
      if (!pipeline) return;

      const run = stores.runner.ensureStarted(pipeline, id);
      try {
        stores.runner.approve(pipeline, run, sid, currentActor());
      } catch (error) {
        void vscode.window.showErrorMessage(`AIDLC: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      void vscode.window.showInformationMessage(`AIDLC: step "${sid}" approved.`);
    },
  ));

  disposables.push(vscode.commands.registerCommand(
    'aidlc.registry.gate.reject',
    async (epicId?: unknown, pipelineId?: unknown, stepId?: unknown, reason?: unknown) => {
      const id = typeof epicId === 'string' ? epicId.trim() : '';
      const pid = typeof pipelineId === 'string' ? pipelineId.trim() : '';
      const sid = typeof stepId === 'string' ? stepId.trim() : '';
      const reasonText = typeof reason === 'string' ? reason.trim() : '';
      if (!stores || !id || !pid || !sid) return;
      if (!reasonText) {
        void vscode.window.showErrorMessage('AIDLC: a reject reason is required.');
        return;
      }
      const pipeline = requirePipeline(pid);
      if (!pipeline) return;

      const run = stores.runner.ensureStarted(pipeline, id);
      try {
        stores.runner.reject(pipeline, run, sid, currentActor(), reasonText);
      } catch (error) {
        void vscode.window.showErrorMessage(`AIDLC: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      void vscode.window.showInformationMessage(`AIDLC: step "${sid}" rejected — feedback recorded for rerun.`);
    },
  ));

  disposables.push(vscode.commands.registerCommand(
    'aidlc.registry.epic.resume',
    async (epicId?: unknown, pipelineId?: unknown) => {
      const id = typeof epicId === 'string' ? epicId.trim() : '';
      const pid = typeof pipelineId === 'string' ? pipelineId.trim() : '';
      if (!stores || !id || !pid) return;
      const pipeline = requirePipeline(pid);
      if (!pipeline) return;

      const { next } = stores.runner.resume(pipeline, id);
      void vscode.window.showInformationMessage(
        next ? `AIDLC: resumed — next step is "${next.id}" (${next.status}).` : `AIDLC: pipeline "${pid}" is already complete for ${id}.`,
      );
    },
  ));

  disposables.push({ dispose: () => unsubscribers.splice(0).forEach((unsub) => unsub()) });
  return disposables;
}
