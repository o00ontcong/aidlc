/**
 * Open a Markdown file in VS Code's preview (falls back to the text editor).
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getBuiltinWorkflow,
  getBuiltinStepHelp,
  renderBuiltinStepHelpMarkdown,
} from '@aidlc/core';

export async function openMarkdownPreview(filePath: string, missingLabel: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    void vscode.window.showWarningMessage(`AIDLC: ${missingLabel} not found at ${filePath}.`);
    return;
  }
  const uri = vscode.Uri.file(filePath);
  try {
    // Preview-only — do not open the source in an editable editor tab.
    await vscode.commands.executeCommand('markdown.showPreview', uri);
  } catch {
    // Last resort: open as a transient preview tab (still editable, but
    // single tab — better than leaving a dirty Untitled document around).
    await vscode.window.showTextDocument(uri, { preview: true });
  }
}

/** Open the bundled guide for a built-in template (Apply template → View guide). */
export async function openTemplateGuide(
  extensionPath: string,
  templateId: string,
): Promise<void> {
  const workflow = getBuiltinWorkflow(templateId);
  const rel = workflow?.guide;
  if (!rel) {
    void vscode.window.showInformationMessage(
      `AIDLC: template "${templateId}" has no user guide yet.`,
    );
    return;
  }
  await openMarkdownPreview(
    path.join(extensionPath, rel),
    `guide for template "${templateId}"`,
  );
}

/** Open the packaged instructions for the Discovery tab. */
export async function openDiscoveryGuide(extensionPath: string): Promise<void> {
  await openMarkdownPreview(
    path.join(extensionPath, 'assets', 'discovery-shape-workflow.md'),
    'Discovery guide',
  );
}

/** Open the Vietnamese user guide bundled for the Ideas tab. */
export async function openIdeasGuide(extensionPath: string): Promise<void> {
  await openMarkdownPreview(
    path.join(extensionPath, 'assets', 'ideas-pipeline-guide.vi.md'),
    'Ideas pipeline guide',
  );
}

/**
 * Render step help to a real file under the OS temp dir, then open Markdown
 * preview only. Untitled documents were wrong here: `openTextDocument({content})`
 * always opens an editable tab, and `markdown.showPreview` on untitled URIs
 * often kept showing a previous Untitled (e.g. Scan Project) while a second
 * editor tab opened for the new step.
 */
export async function openStepHelp(
  pipelineId: string,
  stepName: string,
): Promise<void> {
  const help = getBuiltinStepHelp(pipelineId, stepName);
  if (!help) {
    void vscode.window.showInformationMessage(
      `AIDLC: no built-in help for ${pipelineId} / ${stepName}.`,
    );
    return;
  }
  const md = renderBuiltinStepHelpMarkdown(help);
  const dir = path.join(os.tmpdir(), 'aidlc-step-help');
  fs.mkdirSync(dir, { recursive: true });
  // Stable per (pipeline, step) so re-clicking the same Help reuses one preview;
  // switching steps writes a different file and the preview command targets it.
  const safePipeline = pipelineId.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const safeStep = stepName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const filePath = path.join(dir, `${safePipeline}--${safeStep}.md`);
  fs.writeFileSync(filePath, md, 'utf8');
  await openMarkdownPreview(filePath, `step help for ${pipelineId}/${stepName}`);
}
