/**
 * Create Jira subtasks from the team's template.
 *
 * Three steps, none of which runs on its own:
 *
 *     plan                     preview                    create
 *     ────                     ───────                    ──────
 *   ticket + pipeline +    panel: drafts, tick,      POST /issue/bulk
 *   template + ledger  →   blocked reasons shown  →  → ledger → per-draft result
 *   + createmeta
 *
 * The planning decision lives in `@aidlc/core`'s `subtaskPlanner` (pure, tested).
 * This file supplies its inputs from VS Code and the filesystem, then performs
 * the write.
 *
 * Two invariants worth stating:
 *
 *   - **Nothing is created without a click.** `aidlc.jira.subtasks.enabled` is
 *     off by default, and even on, the panel is a required step.
 *   - **A partial bulk failure is recorded as partial.** Jira's bulk endpoint
 *     succeeds per element; writing the ledger only on full success would make a
 *     retry create duplicates of whatever already landed.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  buildSubtaskPayload,
  epicsRoot,
  generatedCofofoWorkspace,
  hashTemplateSource,
  loadSubtaskTemplate,
  missingRequiredFields,
  planSubtasks,
  projectKeyFromIssueKey,
  resolveSubtaskIssueType,
  SUPPLIED_SUBTASK_FIELDS,
  type JiraClient,
  type JiraTicket,
  type PlannerStep,
  type SubtaskDraft,
  type SubtaskTemplate,
} from '@aidlc/core';

import { readYaml } from './yamlIO';
import { jiraCredentials } from './jiraCredentials';
import { describeSprintError } from './jiraSprintLogic';
import { selectableDrafts, stepsFromPipelineConfig, type RawPipelineStep } from './jiraSubtaskLogic';
import { jiraSprintService } from './jiraSprintService';
import {
  appendSubtask,
  emptyLedger,
  parseLedger,
  ticketKeyFromInputs,
  type JiraLedger,
} from './jiraLedger';

const LEDGER_FILENAME = 'jira.json';
const DEFAULT_TEMPLATE_PATH = '.aidlc/jira-subtask-template.yaml';
/** Shipped default, copied into the workspace on first use. */
const SEED_TEMPLATE_RELPATH = path.join('templates', 'jira', 'subtask-template.yaml');

/** One draft plus the identifiers the create step needs. */
export interface SubtaskPlanResult {
  ticketKey: string;
  drafts: SubtaskDraft[];
  /** Present when planning could not run at all. */
  error?: string;
  /** Non-fatal notes (template stale, no board, …). */
  notices: string[];
  /** Resolved subtask issue type, for the create call. */
  issueTypeId?: string;
  issueTypeName?: string;
}

export interface SubtaskCreateResult {
  ticketKey: string;
  created: Array<{ domain: string; key: string }>;
  failed: Array<{ domain: string; message: string }>;
}

export interface JiraSubtaskPanelHooks {
  post: (message: Record<string, unknown>) => void;
}

class JiraSubtaskServiceImpl {
  private extensionPath = '';
  private output: vscode.OutputChannel | null = null;
  private hooks: JiraSubtaskPanelHooks | null = null;

  init(extensionPath: string, output: vscode.OutputChannel): void {
    this.extensionPath = extensionPath;
    this.output = output;
  }

  attach(hooks: JiraSubtaskPanelHooks): void {
    this.hooks = hooks;
  }

  detach(): void {
    this.hooks = null;
  }

  // ─── plan ─────────────────────────────────────────────────────────────────

  /** Plan and post drafts for one ticket. */
  async planAndPost(ticketKey: string): Promise<void> {
    const result = await this.plan(ticketKey);
    this.hooks?.post({ type: 'subtaskDrafts', ...result });
  }

  /**
   * Assemble the planner's inputs, then plan.
   *
   * Never throws: a failure becomes `error` on the result so the panel can show
   * it in place instead of the user getting a toast with no context.
   */
  async plan(ticketKey: string): Promise<SubtaskPlanResult> {
    const notices: string[] = [];
    const empty = (error: string): SubtaskPlanResult =>
      ({ ticketKey, drafts: [], error, notices });

    try {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { return empty('Chưa mở project — cần workspace để đọc mẫu subtask.'); }

      const ticket = jiraSprintService.cachedTicket(ticketKey);
      if (!ticket) {
        return empty(`Không tìm thấy ${ticketKey} trong bản sprint đang có. Bấm Refresh rồi thử lại.`);
      }
      if (ticket.isSubtask) {
        return empty(`${ticket.key} bản thân là subtask — Jira không cho subtask lồng nhau.`);
      }

      let template: SubtaskTemplate;
      try {
        template = this.loadTemplate(root);
      } catch (err) {
        return empty(err instanceof Error ? err.message : String(err));
      }

      const projectKey = projectKeyFromIssueKey(ticket.key);
      if (!projectKey) { return empty(`Không suy ra được project key từ "${ticket.key}".`); }

      // createmeta tells us the subtask type id and what the project requires.
      let issueTypeId = '';
      let issueTypeName = '';
      let missingFields: string[] = [];
      const client = await jiraCredentials.client();
      if (!client) {
        notices.push('Chưa cấu hình Jira — chỉ xem trước được, chưa tạo được.');
      } else {
        try {
          const configured = vscode.workspace.getConfiguration('aidlc.jira')
            .get<string>('subtasks.issueTypeName', 'auto');
          const types = await client.createMetaIssueTypes(projectKey);
          const resolved = resolveSubtaskIssueType(types, configured);
          if (!resolved.issueType) {
            return empty(
              resolved.requestedNameMissing
                ? `Project ${projectKey} không có issue type subtask tên "${resolved.requestedNameMissing}". `
                  + `Đang có: ${resolved.candidates.map((c) => c.name).join(', ') || '(không có)'}.`
                : `Project ${projectKey} không có issue type subtask nào.`,
            );
          }
          issueTypeId = resolved.issueType.id;
          issueTypeName = resolved.issueType.name;
          if (resolved.candidates.length > 1) {
            notices.push(
              `Project có ${resolved.candidates.length} loại subtask — đang dùng "${issueTypeName}". `
              + 'Đổi bằng `aidlc.jira.subtasks.issueTypeName`.',
            );
          }
          missingFields = missingRequiredFields(
            await client.createMetaFields(projectKey, issueTypeId),
            SUPPLIED_SUBTASK_FIELDS,
          );
        } catch (err) {
          // Without createmeta we cannot promise the create will work, so the
          // drafts are shown but flagged rather than silently optimistic.
          notices.push(`Không đọc được createmeta: ${describeSprintError(err).errorMessage}`);
        }
      }

      const epic = this.findEpic(root, ticket.key);
      const { steps, reviewGateStepIds, pipelineId } = this.pipelineSteps(root, epic?.dir);
      if (pipelineId) { notices.push(`Checklist theo pipeline \`${pipelineId}\`.`); }

      const ledger = this.readLedger(root, ticket.key);
      const drafts = planSubtasks({
        template,
        ticket,
        steps,
        reviewGateStepIds,
        ledger: ledger.subtasks.map((entry) => ({ domain: entry.domain, key: entry.key })),
        missingRequiredFields: missingFields,
        ...(epic ? { task: { id: epic.epicId } } : {}),
      });

      return { ticketKey: ticket.key, drafts, notices, issueTypeId, issueTypeName };
    } catch (err) {
      return empty(describeSprintError(err).errorMessage);
    }
  }

  // ─── create ───────────────────────────────────────────────────────────────

  /**
   * Create the selected drafts, then post the per-draft outcome.
   *
   * Drafts are re-planned server-side rather than trusted from the webview: the
   * panel can only send back which domains the user ticked, and the content is
   * rebuilt from the template here. A webview cannot be the source of what we
   * write to Jira.
   */
  async createAndPost(ticketKey: string, domains: string[]): Promise<void> {
    const result = await this.create(ticketKey, domains);
    this.hooks?.post({ type: 'subtaskCreateResult', ...result });
    // Existing subtasks changed, so the sprint list is now stale.
    if (result.created.length > 0) { void jiraSprintService.refresh({ force: true }); }
  }

  private async create(ticketKey: string, domains: string[]): Promise<SubtaskCreateResult> {
    const fail = (message: string): SubtaskCreateResult =>
      ({ ticketKey, created: [], failed: [{ domain: '', message }] });

    try {
      if (!vscode.workspace.getConfiguration('aidlc.jira').get<boolean>('subtasks.enabled', false)) {
        return fail('Tạo subtask đang tắt — bật `aidlc.jira.subtasks.enabled` trước.');
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { return fail('Chưa mở project.'); }

      const plan = await this.plan(ticketKey);
      if (plan.error) { return fail(plan.error); }
      if (!plan.issueTypeId) { return fail('Chưa resolve được issue type subtask.'); }

      const selected = selectableDrafts(plan.drafts, domains);
      if (selected.length === 0) { return fail('Không có subtask nào tạo được trong lựa chọn.'); }

      const client = await jiraCredentials.client();
      if (!client) { return fail('Chưa cấu hình Jira.'); }

      const ticket = jiraSprintService.cachedTicket(ticketKey);
      if (!ticket) { return fail(`Không tìm thấy ${ticketKey} trong bản sprint đang có.`); }
      const template = this.loadTemplate(root);
      const assignTome = vscode.workspace.getConfiguration('aidlc.jira')
        .get<boolean>('subtasks.assignToMe', true);
      let assigneeAccountId: string | null = null;
      if (assignTome && template.fields.assignee === 'currentUser') {
        try {
          assigneeAccountId = (await client.myself()).accountId || null;
        } catch {
          // Not worth failing the create over — the subtask lands unassigned.
          assigneeAccountId = null;
        }
      }

      const payloads = selected.map((draft) => buildSubtaskPayload({
        parentKey: ticket.key,
        projectKey: projectKeyFromIssueKey(ticket.key),
        issueTypeId: plan.issueTypeId!,
        summary: draft.summary,
        sections: draft.sections,
        labels: draft.labels,
        assigneeAccountId,
        separator: template.body.separator === 'rule',
      }).fields);

      const created: SubtaskCreateResult['created'] = [];
      const failed: SubtaskCreateResult['failed'] = [];
      try {
        const outcomes = await client.createIssuesBulk(payloads);
        let ledger = this.readLedger(root, ticket.key);
        const templateHash = template.source.contentHash || hashTemplateSource(JSON.stringify(template));
        for (const outcome of outcomes) {
          const draft = selected[outcome.index];
          if (!draft) { continue; }
          if (outcome.error || !outcome.key) {
            failed.push({ domain: draft.domain, message: outcome.error ?? 'Jira không trả issue.' });
            this.log(`[jira] subtask [${draft.domain}] LỖI: ${outcome.error ?? 'không rõ'}`);
            continue;
          }
          created.push({ domain: draft.domain, key: outcome.key });
          // Written per element, not at the end: a retry after a partial failure
          // must not duplicate what already landed.
          ledger = appendSubtask(ledger, {
            domain: draft.domain,
            key: outcome.key,
            createdAt: new Date().toISOString(),
            templateHash,
          });
          this.writeLedger(root, ticket.key, ledger);
          this.log(`[jira] subtask [${draft.domain}] → ${outcome.key}`);
        }
      } catch (err) {
        const message = describeSprintError(err).errorMessage;
        this.log(`[jira] bulk create LỖI: ${message}`);
        return { ticketKey, created, failed: [{ domain: '', message }] };
      }

      return { ticketKey, created, failed };
    } catch (err) {
      return fail(describeSprintError(err).errorMessage);
    }
  }

  // ─── template ─────────────────────────────────────────────────────────────

  /**
   * Load the workspace template, seeding it from the shipped default on first
   * use so the feature works before anyone edits anything.
   */
  loadTemplate(root: string): SubtaskTemplate {
    const relative = vscode.workspace.getConfiguration('aidlc.jira')
      .get<string>('subtasks.templatePath', DEFAULT_TEMPLATE_PATH) || DEFAULT_TEMPLATE_PATH;
    const target = path.join(root, relative);
    if (!fs.existsSync(target)) { this.seedTemplate(target); }
    return loadSubtaskTemplate(fs.readFileSync(target, 'utf8'), relative);
  }

  templatePath(root: string): string {
    const relative = vscode.workspace.getConfiguration('aidlc.jira')
      .get<string>('subtasks.templatePath', DEFAULT_TEMPLATE_PATH) || DEFAULT_TEMPLATE_PATH;
    return path.join(root, relative);
  }

  /** Copy the shipped default into the workspace, so it is reviewable and editable. */
  private seedTemplate(target: string): void {
    const seed = path.join(this.extensionPath, SEED_TEMPLATE_RELPATH);
    if (!fs.existsSync(seed)) {
      throw new Error(`Không tìm thấy mẫu subtask mặc định trong extension (${SEED_TEMPLATE_RELPATH}).`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(seed, target);
    this.log(`[jira] đã tạo mẫu subtask tại ${target}`);
  }

  // ─── ledger ───────────────────────────────────────────────────────────────

  /**
   * The ledger for the epic linked to this ticket, or an in-memory one when the
   * ticket has no task yet. Subtasks can be created before a task exists; the
   * dedupe then falls back to the ticket's own `existingSubtasks`.
   */
  private readLedger(root: string, ticketKey: string): JiraLedger {
    const found = this.findEpic(root, ticketKey);
    const fresh = emptyLedger(ticketKey, jiraCredentials.settings().site);
    if (!found) { return fresh; }
    try {
      const parsed = parseLedger(
        JSON.parse(fs.readFileSync(path.join(found.dir, LEDGER_FILENAME), 'utf8')),
      );
      return { ...parsed, ticket: ticketKey, site: fresh.site };
    } catch {
      return fresh;
    }
  }

  private writeLedger(root: string, ticketKey: string, ledger: JiraLedger): void {
    const found = this.findEpic(root, ticketKey);
    if (!found) {
      // Creating subtasks before an AIDLC task exists is allowed; there is just
      // nowhere to record it yet. Dedupe then relies on the ticket's own
      // `existingSubtasks`, which Jira reports on the next refresh.
      this.log(`[jira] ${ticketKey} chưa có AIDLC task — subtask đã tạo nhưng chưa ghi được ledger.`);
      return;
    }
    try {
      fs.mkdirSync(found.dir, { recursive: true });
      fs.writeFileSync(
        path.join(found.dir, LEDGER_FILENAME), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8',
      );
    } catch (err) {
      this.log(`[jira] không ghi được ${LEDGER_FILENAME}: ${describeSprintError(err).errorMessage}`);
    }
  }

  /**
   * Find the epic claiming this ticket, by scanning `inputs.json` for a matching
   * `jira` key.
   *
   * The scan exists because the cached ticket carries no linkage — the sprint
   * cache stores raw Jira payloads, and the ticket → task join happens later,
   * for display. Reading the files is the authoritative answer either way.
   */
  private findEpic(root: string, ticketKey: string): { dir: string; epicId: string } | null {
    const dir = this.epicsDir(root);
    const wanted = ticketKey.trim().toUpperCase();
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) { continue; }
        const inputs = path.join(dir, entry.name, 'inputs.json');
        if (!fs.existsSync(inputs)) { continue; }
        const key = ticketKeyFromInputs(JSON.parse(fs.readFileSync(inputs, 'utf8')));
        if (key.toUpperCase() === wanted) {
          return { dir: path.join(dir, entry.name), epicId: entry.name };
        }
      }
    } catch { /* no epics dir yet */ }
    return null;
  }

  private epicsDir(root: string): string {
    try {
      return epicsRoot(root, readYaml(root));
    } catch {
      return path.join(root, 'docs', 'epics');
    }
  }

  // ─── pipeline steps ───────────────────────────────────────────────────────

  /**
   * Steps for the checklist, and which of them are review gates.
   *
   * Prefers the pipeline the linked task actually runs; falls back to the
   * default CoFoFo Feature pipeline so a ticket with no task yet still produces a
   * meaningful checklist rather than an empty one.
   */
  private pipelineSteps(root: string, epicDir?: string): {
    steps: PlannerStep[];
    reviewGateStepIds: string[];
    pipelineId: string;
  } {
    const fromWorkspace = epicDir ? this.stepsFromWorkspace(root, epicDir) : null;
    if (fromWorkspace) { return fromWorkspace; }

    const pipeline = generatedCofofoWorkspace().pipelines
      .find((candidate) => candidate.id === 'cofofo-feature');
    const fallback = stepsFromPipelineConfig((pipeline?.steps ?? []) as RawPipelineStep[]);
    return {
      ...fallback,
      pipelineId: pipeline?.id ?? '',
    };
  }

  /** Steps read from workspace.yaml for the pipeline the linked task uses. */
  private stepsFromWorkspace(root: string, epicDir: string): {
    steps: PlannerStep[];
    reviewGateStepIds: string[];
    pipelineId: string;
  } | null {
    try {
      const statePath = path.join(epicDir, 'state.json');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { pipeline?: string };
      const pipelineId = String(state.pipeline ?? '');
      if (!pipelineId) { return null; }

      const doc = readYaml(root);
      const pipelines = (doc?.pipelines ?? []) as Array<{ id?: string; steps?: RawPipelineStep[] }>;
      const pipeline = pipelines.find((p) => p.id === pipelineId);
      if (!pipeline?.steps) { return null; }

      const parsed = stepsFromPipelineConfig(pipeline.steps as RawPipelineStep[]);
      return parsed.steps.length > 0 ? { ...parsed, pipelineId } : null;
    } catch {
      return null;
    }
  }

  private log(line: string): void {
    this.output?.appendLine(line);
  }
}

export type JiraSubtaskService = JiraSubtaskServiceImpl;

export const jiraSubtaskService = new JiraSubtaskServiceImpl();
