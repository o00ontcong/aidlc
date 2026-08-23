/**
 * Import the subtask template from its Confluence page.
 *
 * The flow is deliberately not "fetch and apply". A wiki page is prose written
 * by people; the template is configuration a tool reads. So the command fetches
 * the page, converts what it can into YAML, and then **opens a diff** for a human
 * to accept. Nothing is written without that.
 *
 * The page content is data, never instruction. The importer only lifts structure
 * — headings, list items, the fenced template block — into YAML values. If the
 * page contained text that looked like a command, it would land in a YAML string
 * that a person reads in a diff, which is exactly where it should land.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as jsYaml from 'js-yaml';

import {
  ConfluenceClient,
  mergeImportedTemplate,
  parseConfluencePageId,
  parseSubtaskPage,
  validateSubtaskTemplate,
} from '@aidlc/core';

import { jiraCredentials } from './jiraCredentials';
import { describeSprintError } from './jiraSprintLogic';
import { jiraSubtaskService } from './jiraSubtaskService';

/**
 * `aidlc.importJiraSubtaskTemplate`.
 *
 * Asks for the page (remembering the configured one), fetches it, merges into the
 * current template, then shows a diff between the file on disk and the proposed
 * version. Accepting the diff is a separate, explicit save by the user.
 */
export async function importJiraSubtaskTemplateCommand(output: vscode.OutputChannel): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    void vscode.window.showWarningMessage('AIDLC: mở project trước — mẫu subtask nằm trong workspace.');
    return;
  }

  const config = vscode.workspace.getConfiguration('aidlc.jira');
  const configured = config.get<string>('subtasks.confluencePageUrl', '').trim();

  const answer = await vscode.window.showInputBox({
    title: 'Import mẫu subtask từ Confluence',
    prompt: 'URL trang Confluence hoặc page id',
    placeHolder: 'https://acme.atlassian.net/wiki/spaces/STT/pages/19791882/Sub-task',
    value: configured,
    ignoreFocusOut: true,
    validateInput: (value) => (parseConfluencePageId(value) ? undefined : 'Không tìm thấy page id trong URL'),
  });
  if (answer === undefined) { return; }

  const pageId = parseConfluencePageId(answer);
  const credentials = await jiraCredentials.credentials();
  if (!credentials) {
    void vscode.window.showWarningMessage('AIDLC: chưa cấu hình Jira. Chạy "AIDLC: Connect Jira" trước.');
    return;
  }

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Đang đọc trang Confluence…' },
    async () => {
      try {
        const client = new ConfluenceClient({
          credentials,
          timeoutMs: Math.max(1, jiraCredentials.settings().requestTimeoutSeconds) * 1_000,
        });
        const page = await client.page(pageId);
        const current = jiraSubtaskService.loadTemplate(root);
        const merged = mergeImportedTemplate(
          current,
          parseSubtaskPage(page.body),
          {
            confluenceUrl: answer.trim(),
            importedAt: new Date().toISOString().slice(0, 10),
          },
        );
        // Fail here rather than after the user accepts a diff that cannot load.
        validateSubtaskTemplate(merged.template, 'imported');
        return { ok: true as const, page, merged };
      } catch (err) {
        return { ok: false as const, message: describeSprintError(err).errorMessage };
      }
    },
  );

  if (!result.ok) {
    output.appendLine(`[jira] import mẫu subtask LỖI: ${result.message}`);
    void vscode.window.showErrorMessage(`Không import được mẫu: ${result.message}`);
    return;
  }

  const { page, merged } = result;
  output.appendLine(
    `[jira] đọc "${page.title}" (v${page.version}) — ${merged.template.title.domains.length} domain, `
    + `${merged.template.body.sections.length} mục`,
  );
  for (const warning of merged.warnings) { output.appendLine(`[jira]   ⚠ ${warning}`); }

  const target = jiraSubtaskService.templatePath(root);
  const proposed = renderTemplateYaml(merged.template);

  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8').trim() === proposed.trim()) {
    void vscode.window.showInformationMessage('Mẫu subtask đã khớp với trang Confluence — không có gì đổi.');
    return;
  }

  // Diff view: left = what is in the repo, right = the proposal. The user edits
  // and saves the right-hand side to accept, or closes it to decline.
  const draftPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-jira-template-')),
    path.basename(target),
  );
  fs.writeFileSync(draftPath, proposed, 'utf8');

  await vscode.commands.executeCommand(
    'vscode.diff',
    vscode.Uri.file(target),
    vscode.Uri.file(draftPath),
    'Mẫu subtask: hiện tại ↔ import từ Confluence',
    { preview: false },
  );

  const action = await vscode.window.showInformationMessage(
    merged.warnings.length > 0
      ? `Đã dựng bản nháp với ${merged.warnings.length} cảnh báo (xem Output). Xem diff rồi quyết định.`
      : 'Đã dựng bản nháp. Xem diff rồi quyết định.',
    'Áp dụng',
    'Để tôi tự sửa',
  );
  if (action !== 'Áp dụng') { return; }

  // Re-read the draft: the user may have edited it inside the diff view.
  const finalText = fs.readFileSync(draftPath, 'utf8');
  try {
    validateSubtaskTemplate(jsYaml.load(finalText), path.basename(target));
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Bản nháp không hợp lệ, chưa lưu: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, finalText, 'utf8');
  await config.update('subtasks.confluencePageUrl', answer.trim(), vscode.ConfigurationTarget.Workspace);
  output.appendLine(`[jira] đã lưu mẫu subtask vào ${target}`);
  void vscode.window.showInformationMessage('Đã cập nhật mẫu subtask.');
}

/**
 * Render the template back to YAML with a header explaining where it came from.
 *
 * `lineWidth: -1` disables js-yaml's line folding: a folded description or
 * placeholder would still parse, but it makes the diff harder to read, and this
 * file exists to be reviewed in a diff.
 */
function renderTemplateYaml(template: unknown): string {
  const body = jsYaml.dump(template, { lineWidth: -1, noRefs: true, sortKeys: false });
  return [
    '# Mẫu subtask Jira — sinh từ trang Confluence bằng',
    '# `AIDLC: Import Jira Subtask Template`, rồi được người review chấp nhận.',
    '#',
    '# Sửa tay được. `plan:` (map domain → step của pipeline) không đến từ trang',
    '# Confluence, nên lần import sau sẽ giữ nguyên phần đó.',
    '',
    body,
  ].join('\n');
}
