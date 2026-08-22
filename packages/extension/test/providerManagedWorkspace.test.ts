import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

describe('Project Workspace provider-managed execution', () => {
  it('switches a task between guided and visible provider-managed modes', () => {
    const root = path.resolve(process.cwd());
    const detail = fs.readFileSync(path.join(root, 'src/webview/components/epic-v3/EpicDetail.tsx'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'src/v2/workspaceWebview.ts'), 'utf8');
    const commands = fs.readFileSync(path.join(root, 'src/v2/providerManagedRunCommands.ts'), 'utf8');

    expect(detail).toContain("type: 'setEpicRunMode'");
    expect(detail).toContain("setRunMode('autonomous')");
    expect(detail).toContain("setRunMode('guided')");
    expect(detail).toContain('Provider-managed');
    expect(detail).toContain("type: 'runTaskWithProvider'");
    expect(host).toContain("case 'runTaskWithProvider'");
    expect(host).toContain('await runTaskWithProviderCommand(epicId)');
    expect(commands).toContain('ensureProviderManagedTaskCommand(root)');
    expect(commands).toContain("'aidlc.runStepWithFeedback'");
  });

  it('does not ship the retired delivery modal or command module', () => {
    const root = path.resolve(process.cwd());
    expect(fs.existsSync(path.join(root, 'src/webview/components/AutonomousDeliveryModal.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/webview/lib/autonomousDelivery.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/v2/autonomousDeliveryCommands.ts'))).toBe(false);
  });

  it('offers one-click provider retry for failed or attempted workflow steps', () => {
    const root = path.resolve(process.cwd());
    const card = fs.readFileSync(path.join(root, 'src/webview/components/EpicCard.tsx'), 'utf8');
    const detail = fs.readFileSync(path.join(root, 'src/webview/components/epic-v3/EpicDetail.tsx'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'src/v2/workspaceWebview.ts'), 'utf8');
    const runService = fs.readFileSync(path.join(root, 'src/v2/providerRunLogic.ts'), 'utf8');

    expect(card).toContain('runStepButtonLabel');
    expect(detail).toContain('runStepButtonLabel');
    expect(host).toContain("case 'rerunAndRunWithClaude'");
    expect(runService).toContain('buildTaskPrompt');
    expect(runService).toContain('terminalNameForProvider');
  });

  it('keeps the saved guide aligned with shared context and human review', () => {
    const root = path.resolve(process.cwd());
    const guide = fs.readFileSync(path.join(root, 'media/guides/project-workspace.md'), 'utf8');
    const gettingStarted = fs.readFileSync(path.join(root, 'media/getting-started.md'), 'utf8');
    const ask = fs.readFileSync(path.join(root, 'src/v2/askCommand.ts'), 'utf8');
    const stepHelp = fs.readFileSync(path.join(root, '../core/src/presets/builtinWorkflows.ts'), 'utf8');

    expect(guide).toContain('Project Workspace: Step-by-Step Guide');
    expect(guide).toContain('AGENTS.md');
    expect(guide).toContain('feature-spike');
    expect(guide).toContain('feature-implement');
    expect(guide).toContain('Run the relevant application');
    expect(gettingStarted).toContain('shared area');
    expect(ask).toContain('Create missing files');
    expect(stepHelp).toContain('shared project status and decisions');
  });
});
