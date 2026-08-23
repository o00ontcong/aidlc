/**
 * Sprint data for the Sprint tab: fetch, cache, and push to the webview.
 *
 * The decisions live in {@link ./jiraSprintLogic} (pure, tested). This file owns
 * the VS Code side — settings, the `workspaceState` cache, in-flight tracking,
 * and posting messages.
 *
 * Module singleton with `init(context, output)` from `activate()`, matching
 * {@link ./workspaceUiPrefs}: the webview panel is built with only an
 * `extensionUri`, so there is no `ExtensionContext` to thread through it. The
 * panel {@link JiraSprintService.attach}es while open and detaches on dispose,
 * so a fetch that outlives the panel posts nowhere instead of throwing.
 *
 * Two behaviours worth knowing:
 *
 *   - **Cache first, then revalidate.** {@link JiraSprintService.snapshot} is
 *     synchronous, so the tab paints from the last fetch the moment it opens;
 *     the network call follows and posts an update. The cache key covers
 *     everything that changes the result set, so a stale query's tickets can
 *     never be shown under a new one.
 *   - **One fetch at a time, last request wins.** Clicking through sprints fires
 *     several fetches; each carries a token, and a late reply from a superseded
 *     fetch is dropped instead of overwriting the current view.
 */

import * as vscode from 'vscode';

import {
  JiraClient,
  issueFields,
  parseBoard,
  parseIssues,
  parseSprint,
  pickCurrentSprint,
  resolvePointsFieldId,
  buildSprintJql,
  type JiraBoard,
  type JiraSprint,
  type JiraTicket,
} from '@aidlc/core';

import { jiraCredentials } from './jiraCredentials';
import {
  buildSprintState,
  describeSprintError,
  isCacheFresh,
  sprintCacheKey,
  EMPTY_SPRINT_STATE,
  type EpicLinkSource,
  type SprintCache,
  type SprintScope,
  type SprintState,
} from './jiraSprintLogic';

const CACHE_KEY = 'aidlc.jira.sprintCache';
const SCOPE_KEY = 'aidlc.jira.sprintScope';
const SPRINT_KEY = 'aidlc.jira.selectedSprint';

/** What the open workspace panel supplies while it is alive. */
export interface JiraSprintPanelHooks {
  post: (message: Record<string, unknown>) => void;
  epics: () => EpicLinkSource[];
}

/** Result of one successful fetch. */
interface FetchedSprint {
  board?: JiraBoard;
  sprint?: JiraSprint;
  boards: JiraBoard[];
  sprints: JiraSprint[];
  tickets: JiraTicket[];
  syncedAt: string;
}

class JiraSprintServiceImpl {
  private context: vscode.ExtensionContext | null = null;
  private output: vscode.OutputChannel | null = null;
  private hooks: JiraSprintPanelHooks | null = null;

  /** Incremented per fetch; a reply with a stale token is discarded. */
  private fetchToken = 0;
  private inFlight = false;
  /** Points custom field id, resolved once per session per site. */
  private pointsFieldCache = new Map<string, string | null>();

  init(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
    this.context = context;
    this.output = output;
  }

  attach(hooks: JiraSprintPanelHooks): void {
    this.hooks = hooks;
  }

  detach(): void {
    this.hooks = null;
  }

  // ─── state ────────────────────────────────────────────────────────────────

  /**
   * State from cache only — no network, no awaits. This is what rides along in
   * the synchronous `state` push so the tab has content on first paint.
   *
   * Token presence cannot be read synchronously (SecretStorage is async), so a
   * present cache is taken as proof of past credentials. Otherwise a connected
   * user would see the "connect Jira" empty state flash on every panel open; the
   * first {@link refresh} corrects the state either way.
   */
  snapshot(): SprintState {
    const cache = this.readCache();
    return buildSprintState({
      settings: jiraCredentials.settings(),
      hasToken: Boolean(cache),
      scope: this.scope(),
      epics: this.epics(),
      cache,
    });
  }

  scope(): SprintScope {
    return this.context?.workspaceState.get<SprintScope>(SCOPE_KEY) ?? 'mine';
  }

  /** True while a fetch is running. */
  get busy(): boolean {
    return this.inFlight;
  }

  // ─── commands from the webview ────────────────────────────────────────────

  async setScope(scope: SprintScope): Promise<void> {
    await this.context?.workspaceState.update(SCOPE_KEY, scope);
    await this.refresh({ force: true });
  }

  async selectSprint(sprintId: number): Promise<void> {
    await this.context?.workspaceState.update(SPRINT_KEY, sprintId || undefined);
    await this.refresh({ force: true });
  }

  async selectBoard(boardId: number): Promise<void> {
    await vscode.workspace.getConfiguration('aidlc.jira')
      .update('boardId', boardId, vscode.ConfigurationTarget.Workspace);
    // A new board invalidates the sprint choice.
    await this.context?.workspaceState.update(SPRINT_KEY, undefined);
    await this.refresh({ force: true });
  }

  /** Drop cached tickets — used after disconnecting so they do not linger. */
  async clearCache(): Promise<void> {
    await this.context?.workspaceState.update(CACHE_KEY, undefined);
    this.pointsFieldCache.clear();
    this.post(EMPTY_SPRINT_STATE);
  }

  /** One ticket from the current cache, for other services to read. */
  cachedTicket(key: string): JiraTicket | null {
    const wanted = key.trim().toUpperCase();
    return this.readCache()?.tickets.find((t) => t.key.toUpperCase() === wanted) ?? null;
  }

  /**
   * Fetch and push. Without `force`, a cache still inside the refresh window
   * short-circuits — reopening the tab should not hit Jira every time.
   */
  async refresh(options: { force?: boolean } = {}): Promise<void> {
    const settings = jiraCredentials.settings();
    const hasToken = await jiraCredentials.hasToken();
    const scope = this.scope();
    const epics = this.epics();

    if (!settings.site || !settings.email || !hasToken) {
      this.post(buildSprintState({ settings, hasToken, scope, epics }));
      return;
    }

    const cache = this.readCache();
    if (!options.force && cache && isCacheFresh(cache, Date.now(), settings.refreshMinutes)) {
      this.post(buildSprintState({ settings, hasToken, scope, epics, cache }));
      return;
    }

    // Show what we have while the fetch runs.
    this.post(buildSprintState({ settings, hasToken, scope, epics, cache, loading: true }));

    const token = ++this.fetchToken;
    this.inFlight = true;
    try {
      const client = await jiraCredentials.client();
      if (!client) {
        this.post(buildSprintState({ settings, hasToken: false, scope, epics, cache }));
        return;
      }
      const fetched = await this.fetchSprint(client, scope);
      if (token !== this.fetchToken) {
        this.log(`[sprint] bỏ kết quả cũ (token ${token}, hiện tại ${this.fetchToken})`);
        return;
      }
      await this.writeCache({
        key: sprintCacheKey(settings, scope, fetched.sprint?.id),
        savedAt: Date.now(),
        scope,
        board: fetched.board,
        sprint: fetched.sprint,
        boards: fetched.boards,
        sprints: fetched.sprints,
        tickets: fetched.tickets,
      });
      this.post(buildSprintState({ settings, hasToken, scope, epics, fetched }));
      this.log(
        `[sprint] ${fetched.tickets.length} ticket`
        + (fetched.sprint ? ` · ${fetched.sprint.name}` : '')
        + (fetched.board ? ` · board ${fetched.board.name}` : ''),
      );
    } catch (err) {
      if (token !== this.fetchToken) { return; }
      const error = describeSprintError(err);
      this.log(`[sprint] LỖI ${error.errorKind}: ${error.errorMessage}`);
      this.post(buildSprintState({ settings, hasToken, scope, epics, cache, error }));
    } finally {
      if (token === this.fetchToken) { this.inFlight = false; }
    }
  }

  // ─── fetching ─────────────────────────────────────────────────────────────

  /**
   * Resolve board → sprint → issues, falling back to a JQL search.
   *
   * The board path is preferred because it yields the sprint's name and dates for
   * the header. When the account sees no scrum board (common with team-managed
   * projects, or with narrow permissions), `sprint IN openSprints()` still finds
   * the right issues — just without sprint metadata. Failing outright there would
   * make the tab useless for a whole class of setups.
   */
  private async fetchSprint(client: JiraClient, scope: SprintScope): Promise<FetchedSprint> {
    const settings = jiraCredentials.settings();
    const [self, pointsFieldId] = await Promise.all([
      client.myself(),
      this.resolvePointsField(client, settings.site),
    ]);
    const fields = issueFields(pointsFieldId);
    const parseCtx = { siteBaseUrl: client.baseUrl, selfAccountId: self.accountId, pointsFieldId };

    const boards = (await client.boards(settings.projectKey || undefined))
      .map(parseBoard)
      .filter((b): b is JiraBoard => b !== null);

    const board = settings.boardId ? boards.find((b) => b.id === settings.boardId) : boards[0];

    if (!board) {
      const jql = buildSprintJql({
        scope,
        projectKey: settings.projectKey || undefined,
        override: settings.jql || undefined,
      });
      this.log(`[sprint] không có board — dùng JQL: ${jql}`);
      return {
        boards,
        sprints: [],
        tickets: parseIssues(await client.searchJql(jql, fields), parseCtx),
        syncedAt: new Date().toISOString(),
      };
    }

    const sprints = (await client.sprints(board.id, ['active', 'future']))
      .map(parseSprint)
      .filter((s): s is JiraSprint => s !== null);

    const wantedId = this.selectedSprintId();
    const sprint = (wantedId ? sprints.find((s) => s.id === wantedId) : null)
      ?? pickCurrentSprint(sprints)
      ?? undefined;

    if (!sprint) {
      this.log(`[sprint] board ${board.name} không có sprint active/future`);
      return { board, boards, sprints, tickets: [], syncedAt: new Date().toISOString() };
    }

    // Narrowing inside the sprint request avoids a second round trip.
    const jql = settings.jql.trim() || (scope === 'mine' ? 'assignee = currentUser()' : '');
    const raw = await client.sprintIssues(sprint.id, fields, jql || undefined);

    return {
      board,
      sprint,
      boards,
      sprints,
      tickets: parseIssues(raw, parseCtx),
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Story-points field id, cached per site for the session. The id differs per
   * Jira instance so it must be resolved rather than hardcoded — but it does not
   * change between refreshes, and `/rest/api/3/field` returns every field on the
   * site, which is a heavy payload to re-fetch each time.
   *
   * A failure here is swallowed: points are cosmetic, and losing them must not
   * take the whole sprint load down with them.
   */
  private async resolvePointsField(client: JiraClient, site: string): Promise<string | null> {
    const key = site.trim().toLowerCase();
    const cached = this.pointsFieldCache.get(key);
    if (cached !== undefined) { return cached; }
    try {
      const resolved = resolvePointsFieldId(await client.fields());
      this.pointsFieldCache.set(key, resolved);
      if (!resolved) { this.log('[sprint] site này không có field Story Points'); }
      return resolved;
    } catch (err) {
      this.log(`[sprint] không resolve được field points: ${describeSprintError(err).errorMessage}`);
      this.pointsFieldCache.set(key, null);
      return null;
    }
  }

  // ─── plumbing ─────────────────────────────────────────────────────────────

  private selectedSprintId(): number | undefined {
    const id = this.context?.workspaceState.get<number>(SPRINT_KEY);
    return typeof id === 'number' && id > 0 ? id : undefined;
  }

  private epics(): EpicLinkSource[] {
    try {
      return this.hooks?.epics() ?? [];
    } catch {
      // The panel supplies these; a failure there must not break a fetch.
      return [];
    }
  }

  /**
   * Cached tickets, but only when the cache belongs to the current query. A key
   * mismatch (board changed, scope flipped, JQL edited) counts as no cache.
   */
  private readCache(): SprintCache | null {
    const cache = this.context?.workspaceState.get<SprintCache>(CACHE_KEY);
    if (!cache || !Array.isArray(cache.tickets)) { return null; }
    const expected = sprintCacheKey(jiraCredentials.settings(), this.scope(), cache.sprint?.id);
    return cache.key === expected ? cache : null;
  }

  private async writeCache(cache: SprintCache): Promise<void> {
    await this.context?.workspaceState.update(CACHE_KEY, cache);
  }

  private post(state: SprintState): void {
    this.hooks?.post({ type: 'sprintState', state });
  }

  private log(line: string): void {
    this.output?.appendLine(line);
  }
}

export type JiraSprintService = JiraSprintServiceImpl;

export const jiraSprintService = new JiraSprintServiceImpl();
