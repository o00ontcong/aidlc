/**
 * Jira credentials and settings.
 *
 * The API token lives in VS Code `SecretStorage` and nowhere else. It is
 * deliberately NOT a setting: `settings.json` gets committed and carried around
 * by Settings Sync, so a token there leaks by design. Everything non-secret
 * (site, email, board, JQL) is ordinary configuration under `aidlc.jira.*`.
 *
 * Module singleton with `init(context)` from `activate()`, matching
 * {@link ./workspaceUiPrefs} — the webview panel only receives an
 * `extensionUri`, so there is no context to thread through it.
 */

import * as vscode from 'vscode';

import { JiraApiError, JiraClient, type JiraCredentials } from '@aidlc/core';

import type { JiraSettings } from './jiraSprintLogic';

const SECRET_KEY = 'aidlc.jira.apiToken';
const TOKEN_HELP_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

class JiraCredentialStore {
  private context: vscode.ExtensionContext | null = null;

  init(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /** Non-secret configuration. Safe to log, safe to send to a webview. */
  settings(): JiraSettings {
    const config = vscode.workspace.getConfiguration('aidlc.jira');
    return {
      site: config.get<string>('site', '').trim(),
      email: config.get<string>('email', '').trim(),
      projectKey: config.get<string>('projectKey', '').trim(),
      boardId: Number(config.get<number>('boardId', 0)) || 0,
      jql: config.get<string>('jql', '').trim(),
      refreshMinutes: Number(config.get<number>('refreshMinutes', 10)),
      requestTimeoutSeconds: Number(config.get<number>('requestTimeoutSeconds', 20)),
      transitionsEnabled: config.get<boolean>('transitions.enabled', false),
      subtasksEnabled: config.get<boolean>('subtasks.enabled', false),
      transitionMapping: {
        taskCreated: config.get<string>('transitions.onTaskCreated', '').trim(),
        review: config.get<string>('transitions.onReview', '').trim(),
        runCompleted: config.get<string>('transitions.onRunCompleted', '').trim(),
        runFailed: config.get<string>('transitions.onRunFailed', '').trim(),
      },
      transitionConfirm: config.get<boolean>('transitions.confirm', true),
    };
  }

  async token(): Promise<string> {
    if (!this.context) { return ''; }
    return (await this.context.secrets.get(SECRET_KEY)) ?? '';
  }

  /**
   * Whether a token exists, without reading its value. Callers that only need
   * to decide "configured or not" use this so the secret never enters a scope
   * that could log or serialize it.
   */
  async hasToken(): Promise<boolean> {
    return (await this.token()).length > 0;
  }

  /** Credentials ready to hand to a client, or null when something is missing. */
  async credentials(): Promise<JiraCredentials | null> {
    const settings = this.settings();
    const apiToken = await this.token();
    if (!settings.site || !settings.email || !apiToken) { return null; }
    return { site: settings.site, email: settings.email, apiToken };
  }

  /** A configured client, or null when credentials are incomplete. */
  async client(): Promise<JiraClient | null> {
    const credentials = await this.credentials();
    if (!credentials) { return null; }
    return new JiraClient({
      credentials,
      timeoutMs: Math.max(1, this.settings().requestTimeoutSeconds) * 1_000,
    });
  }

  async setToken(token: string): Promise<void> {
    if (!this.context) { return; }
    await this.context.secrets.store(SECRET_KEY, token);
  }

  async clearToken(): Promise<void> {
    if (!this.context) { return; }
    await this.context.secrets.delete(SECRET_KEY);
  }

  /** Fires whenever the token is added, changed or removed. */
  onDidChangeToken(listener: () => void): vscode.Disposable {
    if (!this.context) { return new vscode.Disposable(() => {}); }
    return this.context.secrets.onDidChange((event) => {
      if (event.key === SECRET_KEY) { listener(); }
    });
  }
}

export const jiraCredentials = new JiraCredentialStore();

/** Which field a connect failure points at, so a form can highlight it. */
export type ConnectFailureField = 'site' | 'email' | 'token';

export interface ConnectAttemptResult {
  ok: boolean;
  /** Display name of the verified account, on success. */
  account?: string;
  message?: string;
  field?: ConnectFailureField;
}

/**
 * Verify credentials against `GET /rest/api/3/myself`, and store them only if
 * Jira accepts them.
 *
 * Verifying first is the whole point. A typo'd token stored silently becomes a
 * 401 on the Sprint tab minutes later, where it reads like a permissions
 * problem; caught here it says "that token did not work" while the user still
 * has the token page open.
 *
 * Shared by the dialog and the command-palette wizard so there is one place
 * that decides what "connected" means — and one place that touches the secret.
 */
export async function verifyAndStoreJiraCredentials(
  credentials: JiraCredentials,
): Promise<ConnectAttemptResult> {
  const site = credentials.site.trim();
  const email = credentials.email.trim();
  const apiToken = credentials.apiToken.trim();

  if (!site) { return { ok: false, message: 'Thiếu Jira site.', field: 'site' }; }
  if (!email.includes('@')) { return { ok: false, message: 'Email không hợp lệ.', field: 'email' }; }
  if (!apiToken) { return { ok: false, message: 'Thiếu API token.', field: 'token' }; }

  let account = '';
  try {
    const client = new JiraClient({
      credentials: { site, email, apiToken },
      timeoutMs: Math.max(1, jiraCredentials.settings().requestTimeoutSeconds) * 1_000,
    });
    const self = await client.myself();
    account = self.displayName || self.emailAddress;
  } catch (err) {
    return { ok: false, message: describeAuthFailure(err), field: blameField(err) };
  }

  // Site and email are not secrets; the token never goes near settings.json.
  // Written at Workspace scope: which Jira site/account this repo talks to is a
  // property of this project, not of the user's machine — matches boardId /
  // transitions.* / subtasks.* below.
  const config = vscode.workspace.getConfiguration('aidlc.jira');
  await config.update('site', site, vscode.ConfigurationTarget.Workspace);
  await config.update('email', email, vscode.ConfigurationTarget.Workspace);
  await jiraCredentials.setToken(apiToken);

  return { ok: true, account };
}

/**
 * Which field to blame. A 401 is the credential pair, and the token is the half
 * people get wrong — an email typo usually produces the same 401, so the message
 * names both while the highlight goes on the token. A 404 means the site name
 * resolved to something without a Jira API.
 */
function blameField(err: unknown): ConnectFailureField | undefined {
  if (!(err instanceof JiraApiError)) { return undefined; }
  switch (err.kind) {
    case 'auth':
      return 'token';
    case 'not_found':
    case 'network':
      return 'site';
    default:
      return undefined;
  }
}

/**
 * Connect wizard: site → email → token, then verify against
 * `GET /rest/api/3/myself` before storing anything.
 *
 * Verifying first matters. A typo'd token stored silently turns into a 401 on
 * the Sprint tab minutes later, where it reads like a permissions problem; the
 * same typo caught here says "that token did not work" while the user still has
 * the token page open.
 */
export async function connectJiraCommand(): Promise<void> {
  const current = jiraCredentials.settings();

  const site = await vscode.window.showInputBox({
    title: 'Kết nối Jira (1/3)',
    prompt: 'Jira Cloud site',
    placeHolder: 'acme.atlassian.net',
    value: current.site,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'Nhập site, ví dụ acme.atlassian.net'),
  });
  if (site === undefined) { return; }

  const email = await vscode.window.showInputBox({
    title: 'Kết nối Jira (2/3)',
    prompt: 'Email của account Atlassian',
    placeHolder: 'you@company.com',
    value: current.email,
    ignoreFocusOut: true,
    validateInput: (value) => (value.includes('@') ? undefined : 'Nhập email của account Atlassian'),
  });
  if (email === undefined) { return; }

  const token = await vscode.window.showInputBox({
    title: 'Kết nối Jira (3/3)',
    prompt: 'API token (lưu trong SecretStorage, không vào settings.json)',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'Nhập API token'),
  });
  if (token === undefined) { return; }

  const verified = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Đang xác thực với Jira…' },
    () => verifyAndStoreJiraCredentials({ site, email, apiToken: token }),
  );

  if (!verified.ok) {
    const action = await vscode.window.showErrorMessage(
      `Không kết nối được Jira: ${verified.message}`,
      'Tạo API token',
      'Thử lại',
    );
    if (action === 'Tạo API token') {
      await vscode.env.openExternal(vscode.Uri.parse(TOKEN_HELP_URL));
    } else if (action === 'Thử lại') {
      await connectJiraCommand();
    }
    return;
  }

  void vscode.window.showInformationMessage(
    `Đã kết nối Jira: ${verified.account} @ ${site.trim()}`,
  );
}

export async function disconnectJiraCommand(): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'Xoá API token Jira khỏi SecretStorage? Site và email trong settings vẫn giữ nguyên.',
    { modal: true },
    'Xoá token',
  );
  if (confirm !== 'Xoá token') { return; }
  await jiraCredentials.clearToken();
  void vscode.window.showInformationMessage('Đã xoá API token Jira.');
}

/**
 * Test the connection and report into the Output channel.
 *
 * Prints identity, board count and the active sprint — enough to tell "the token
 * works" from "the token works but this account sees no scrum board", which are
 * different problems with the same symptom (an empty Sprint tab).
 */
export async function testJiraConnectionCommand(output: vscode.OutputChannel): Promise<void> {
  const settings = jiraCredentials.settings();
  const client = await jiraCredentials.client();
  output.show(true);
  output.appendLine('');
  output.appendLine(`[jira] test connection — site=${settings.site || '(chưa đặt)'}`);

  if (!client) {
    output.appendLine('[jira] thiếu site / email / token. Chạy "AIDLC: Connect Jira" trước.');
    void vscode.window.showWarningMessage('Chưa cấu hình Jira. Chạy "AIDLC: Connect Jira".');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Đang kiểm tra kết nối Jira…' },
    async () => {
      try {
        const self = await client.myself();
        output.appendLine(`[jira] account: ${self.displayName} <${self.emailAddress}> (${self.accountId})`);

        const boards = await client.boards(settings.projectKey || undefined);
        output.appendLine(
          `[jira] scrum board: ${boards.length}`
          + (boards.length > 0
            ? ` — ${boards.slice(0, 5).map((b) => `${b.name} (#${b.id})`).join(', ')}`
            : ' — account này không thấy board scrum nào; Sprint tab sẽ dùng đường JQL.'),
        );

        const boardId = settings.boardId || boards[0]?.id;
        if (boardId) {
          const sprints = await client.sprints(boardId, ['active', 'future']);
          const active = sprints.filter((s) => (s.state ?? '').toLowerCase() === 'active');
          output.appendLine(
            `[jira] board #${boardId}: ${active.length} sprint active, ${sprints.length - active.length} future`
            + (active.length > 0 ? ` — active: ${active.map((s) => s.name).join(', ')}` : ''),
          );
        }
        void vscode.window.showInformationMessage(`Jira OK — ${self.displayName}, ${boards.length} board.`);
      } catch (err) {
        const message = err instanceof JiraApiError ? err.message : String(err);
        output.appendLine(`[jira] LỖI: ${message}`);
        void vscode.window.showErrorMessage(`Jira: ${message}`);
      }
    },
  );
}

/**
 * Why the credential check failed, in terms the connect dialog can act on. A
 * 401 here is a wrong token; a 403 means the token is real but the account
 * cannot see the site — different fixes, so they must read differently.
 */
function describeAuthFailure(err: unknown): string {
  if (!(err instanceof JiraApiError)) {
    return err instanceof Error ? err.message : String(err);
  }
  switch (err.kind) {
    case 'auth':
      return 'email hoặc API token không đúng.';
    case 'forbidden':
      return 'token hợp lệ nhưng account không có quyền trên site này.';
    case 'not_found':
      return 'site đúng dạng nhưng không có API Jira ở đó — kiểm tra lại tên site.';
    case 'timeout':
    case 'network':
      return `không kết nối được (${err.message}).`;
    default:
      return err.message;
  }
}
