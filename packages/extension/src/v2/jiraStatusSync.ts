/**
 * Push AIDLC run progress back to Jira as status transitions.
 *
 * Wired from `saveRun()` in {@link ./runCommands}, which every run-state
 * *change* passes through (markStepDone, approveStep, rejectStep, skipStep…) —
 * one hook instead of a call at each site.
 *
 * Run *creation* is the exception: `scaffoldEpic` and `startRun` write the state
 * themselves, so the three places that start a run (the Start-Task modal, the
 * epic wizard, "Start pipeline run") call {@link onRunStateSaved} directly.
 * Without that, a ticket turned into a task keeps its old status until the first
 * step action — and if `review` fires first, the never-move-backwards guard
 * drops `taskCreated` entirely. The migration sweep in `epicsList` deliberately
 * does not call it: backfilling old epics must not transition their tickets.
 *
 * The rules this file exists to enforce, in the order they matter:
 *
 *   1. **Off by default.** `aidlc.jira.transitions.enabled` gates everything.
 *      This writes to a board other people are looking at.
 *   2. **Never block a run.** Every failure path logs and returns. A Jira
 *      outage, a revoked token, a workflow without the configured status — none
 *      of it may fail the pipeline the user is actually running.
 *   3. **Done always asks.** Even with `confirm` off. Closing a ticket is
 *      visible to the whole team and awkward to undo.
 *   4. **Never move backwards.** A re-emitted `taskCreated` must not drag a
 *      ticket from In Review back to In Progress.
 *   5. **Always leave a trace.** Every attempt — including the ones that did
 *      nothing — lands in the Output channel and in `docs/epics/<ID>/jira.json`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  epicsRoot,
  isDestructiveTransition,
  isForwardMove,
  parseTransitions,
  selectTransition,
  wantedStatusFor,
  type JiraTransition,
  type RunState,
  type TransitionEvent,
  type TransitionMapping,
} from '@aidlc/core';

import { jiraCredentials } from './jiraCredentials';
import { describeSprintError } from './jiraSprintLogic';
import {
  appendTransition,
  deriveTransitionEvent,
  describeTransitionOutcome,
  emptyLedger,
  epicIdOf,
  parseLedger,
  ticketKeyFromInputs,
  type JiraLedger,
  type LedgerTransition,
} from './jiraStatusSyncLogic';

const LEDGER_FILENAME = 'jira.json';

class JiraStatusSync {
  private output: vscode.OutputChannel | null = null;
  /** Guards against re-entering while an await is in flight for the same run. */
  private busyRuns = new Set<string>();

  init(output: vscode.OutputChannel): void {
    this.output = output;
  }

  /**
   * Called from `saveRun()` after the state is persisted. Fire-and-forget: the
   * caller must not await this, and it must never throw.
   */
  onRunStateSaved(workspaceRoot: string, state: RunState, doc: unknown): void {
    void this.handle(workspaceRoot, state, doc).catch((err: unknown) => {
      this.log(`[jira] status sync lỗi không mong đợi: ${describeSprintError(err).errorMessage}`);
    });
  }

  private async handle(workspaceRoot: string, state: RunState, doc: unknown): Promise<void> {
    if (!vscode.workspace.getConfiguration('aidlc.jira').get<boolean>('transitions.enabled', false)) {
      return;
    }
    if (this.busyRuns.has(state.runId)) { return; }

    const epicId = epicIdOf(state);
    if (!epicId) { return; }

    const epicDir = path.join(epicsRoot(workspaceRoot, asDoc(doc)), epicId);
    const ticket = this.readTicketKey(epicDir);
    if (!ticket) { return; }

    const ledger = this.readLedger(epicDir, ticket);
    const event = deriveTransitionEvent(state, ledger);
    if (!event) { return; }

    const mapping = this.mapping();
    const wanted = wantedStatusFor(mapping, event);
    if (!wanted) { return; }  // event deliberately mapped to nothing

    this.busyRuns.add(state.runId);
    try {
      await this.transition({ epicDir, ticket, event, wanted, runId: state.runId, ledger });
    } finally {
      this.busyRuns.delete(state.runId);
    }
  }

  /**
   * Resolve and perform one transition, recording the outcome whatever it is.
   *
   * Note the ordering: we read the issue's *current* transitions every time
   * rather than caching them. Transition ids belong to a workflow, not a status,
   * and what is available depends on where the issue is right now — a cached list
   * is a latent wrong-transition bug.
   */
  private async transition(args: {
    epicDir: string;
    ticket: string;
    event: TransitionEvent;
    wanted: string;
    runId: string;
    ledger: JiraLedger;
  }): Promise<void> {
    const { epicDir, ticket, event, wanted, runId } = args;
    const record = (outcome: LedgerTransition['outcome'], from: string, detail?: string) => {
      const entry: LedgerTransition = {
        at: new Date().toISOString(),
        event,
        runId,
        from,
        to: wanted,
        outcome,
        ...(detail ? { detail } : {}),
      };
      this.log(`${describeTransitionOutcome(entry)} · ${ticket}`);
      this.writeLedger(epicDir, appendTransition(args.ledger, entry));
    };

    const client = await jiraCredentials.client();
    if (!client) {
      record('skipped', '', 'chưa cấu hình Jira');
      return;
    }

    let current = '';
    let available: JiraTransition[] = [];
    try {
      const issue = await client.issue(ticket, 'status');
      current = issue.fields?.status?.name?.trim() ?? '';
      available = parseTransitions(await client.transitions(ticket));
    } catch (err) {
      // Retryable: recorded as `failed`, so the next step tries again.
      record('failed', current, describeSprintError(err).errorMessage);
      return;
    }

    const outcome = selectTransition({ wantedStatus: wanted, currentStatus: current, available });
    if (outcome.kind === 'already') {
      record('skipped', current, 'ticket đã ở trạng thái này');
      return;
    }
    if (outcome.kind === 'not_configured') { return; }
    if (outcome.kind === 'unavailable') {
      record(
        'skipped', current,
        `workflow không có transition tới "${wanted}"`
        + (outcome.available.length > 0 ? ` (đang có: ${outcome.available.join(', ')})` : ''),
      );
      this.warnOnce(
        `Jira: workflow của ${ticket} không có transition tới "${wanted}". `
        + 'Run vẫn chạy bình thường; sửa mapping trong settings nếu cần.',
      );
      return;
    }

    const { transition } = outcome;

    // Guard 4: a re-emitted early event must not walk the ticket backwards.
    const currentCategory = categoryOfCurrent(current, available);
    if (currentCategory && !isForwardMove(currentCategory, transition.toCategory)) {
      record('skipped', current, `không lùi trạng thái (${current} → ${transition.toStatus})`);
      return;
    }

    // Guard 3: Done always asks, regardless of the confirm setting.
    const destructive = isDestructiveTransition(transition);
    if (destructive || this.confirmEnabled()) {
      const choice = await vscode.window.showInformationMessage(
        `Chuyển ${ticket} sang "${transition.toStatus}" trên Jira?`
        + (current ? ` (đang là "${current}")` : ''),
        { modal: destructive },
        'Chuyển', 'Không lần này', 'Tắt hẳn',
      );
      if (choice === 'Tắt hẳn') {
        await vscode.workspace.getConfiguration('aidlc.jira')
          .update('transitions.enabled', false, vscode.ConfigurationTarget.Workspace);
        record('declined', current, 'người dùng tắt ghi ngược trạng thái');
        return;
      }
      if (choice !== 'Chuyển') {
        record('declined', current);
        return;
      }
    }

    try {
      await client.transitionIssue(ticket, transition.id);
      record('done', current);
    } catch (err) {
      record('failed', current, describeSprintError(err).errorMessage);
      this.warnOnce(`Jira: không chuyển được ${ticket} sang "${transition.toStatus}". Run không bị ảnh hưởng.`);
    }
  }

  // ─── config ───────────────────────────────────────────────────────────────

  private mapping(): TransitionMapping {
    return jiraCredentials.settings().transitionMapping;
  }

  private confirmEnabled(): boolean {
    return jiraCredentials.settings().transitionConfirm;
  }

  // ─── epic sidecar files ───────────────────────────────────────────────────

  /** `inputs.jira` — the single link between an epic and a Jira ticket. */
  private readTicketKey(epicDir: string): string {
    try {
      const raw = fs.readFileSync(path.join(epicDir, 'inputs.json'), 'utf8');
      return ticketKeyFromInputs(JSON.parse(raw));
    } catch {
      return '';
    }
  }

  private readLedger(epicDir: string, ticket: string): JiraLedger {
    try {
      const raw = fs.readFileSync(path.join(epicDir, LEDGER_FILENAME), 'utf8');
      const parsed = parseLedger(JSON.parse(raw));
      // Keep identity fresh without discarding history.
      return { ...parsed, ticket: ticket || parsed.ticket, site: jiraCredentials.settings().site };
    } catch {
      return emptyLedger(ticket, jiraCredentials.settings().site);
    }
  }

  private writeLedger(epicDir: string, ledger: JiraLedger): void {
    try {
      fs.mkdirSync(epicDir, { recursive: true });
      fs.writeFileSync(
        path.join(epicDir, LEDGER_FILENAME),
        `${JSON.stringify(ledger, null, 2)}\n`,
        'utf8',
      );
    } catch (err) {
      // Losing the audit trail is bad; failing the run over it is worse.
      this.log(`[jira] không ghi được ${LEDGER_FILENAME}: ${describeSprintError(err).errorMessage}`);
    }
  }

  // ─── plumbing ─────────────────────────────────────────────────────────────

  /** Warn at most once per message, so a per-step failure is not a toast storm. */
  private warned = new Set<string>();

  private warnOnce(message: string): void {
    if (this.warned.has(message)) { return; }
    this.warned.add(message);
    void vscode.window.showWarningMessage(message);
  }

  private log(line: string): void {
    this.output?.appendLine(line);
  }
}

/** `epicsRoot` accepts any object with an optional `state` key. */
function asDoc(doc: unknown): { state?: unknown } | null {
  return doc && typeof doc === 'object' ? (doc as { state?: unknown }) : null;
}

/**
 * Best-effort status category for the issue's *current* status.
 *
 * Jira's transition list describes destinations, not where you are, so the
 * current status usually is not in it. When it is not, we return null and skip
 * the backwards guard rather than guessing — a wrong guess would either block a
 * legitimate move or allow the regression we are trying to prevent.
 */
function categoryOfCurrent(
  current: string,
  available: readonly JiraTransition[],
): 'todo' | 'inprogress' | 'done' | null {
  const match = available.find((t) => t.toStatus.toLowerCase() === current.toLowerCase());
  return match ? match.toCategory : null;
}

export const jiraStatusSync = new JiraStatusSync();
