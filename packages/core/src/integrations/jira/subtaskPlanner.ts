/**
 * Decide which subtasks to propose for a ticket, and render each one.
 *
 * Pure function of (ticket, pipeline steps, template, ledger, project metadata)
 * → {@link SubtaskDraft}[]. No I/O, no Jira calls: the extension gathers the
 * inputs, this decides, and the user ticks the final list. Keeping the decision
 * here means the awkward parts — dedupe, label rules, blocked drafts — are unit
 * tested instead of discovered against a live board.
 *
 * Three rules earn their keep:
 *
 *   1. **Per domain, not per step.** The template's taxonomy is domains; the
 *      built-in pipeline has seven steps. One subtask per step would bury the
 *      ticket, so several steps collapse into one domain subtask.
 *   2. **Dedupe against reality, twice.** A domain already in the ledger was
 *      created by us; a domain matching an existing `[Domain]` subtask on the
 *      ticket was created by a teammate. Both suppress the draft — the second
 *      is what stops us duplicating hand-made work.
 *   3. **Block before calling Jira.** A project can require a custom field the
 *      template cannot fill. Better to disable the draft with the field name
 *      than to let Jira answer 400 and guess at why.
 */

import { renderSubtaskMarkdown, type RenderedSection } from './adfBuilder';
import type { JiraTicket } from './JiraTypes';
import {
  formatSubtaskSummary,
  resolveLines,
  type PlaceholderContext,
  type SubtaskPlanEntry,
  type SubtaskTemplate,
} from './subtaskTemplate';

/** One pipeline step, as much of it as planning needs. */
export interface PlannerStep {
  /** Step / phase id (`implement`, `test-plan`). */
  id: string;
  /** Human name (`Execute Test`) — what lands in the Checklist. */
  name: string;
  /** `produces_contains` fragments, used as completion criteria. */
  producesContains?: string[];
}

/** What we already created for this ticket, read from `docs/epics/<ID>/jira.json`. */
export interface SubtaskLedgerEntry {
  domain: string;
  key: string;
}

export interface PlanSubtasksInput {
  template: SubtaskTemplate;
  ticket: JiraTicket;
  /** Steps of the pipeline chosen for the AIDLC task. */
  steps: PlannerStep[];
  /** Already-created subtasks from our ledger. */
  ledger?: SubtaskLedgerEntry[];
  /** AIDLC task id + title, when a task already exists. */
  task?: { id?: string; title?: string; description?: string };
  /**
   * Field names the project requires that the template cannot supply. Comes
   * from `createmeta`; each name blocks every draft, since it is a project-level
   * requirement.
   */
  missingRequiredFields?: string[];
  /** Review gate step ids, mapped by the `reviewGates` pseudo-step. */
  reviewGateStepIds?: string[];
}

export interface SubtaskDraft {
  domain: string;
  summary: string;
  /** Section model — the ADF payload and the preview both come from this. */
  sections: RenderedSection[];
  /** Preview text, identical in content to what will be written. */
  descriptionMd: string;
  labels: string[];
  /** Pipeline steps this subtask stands for, for the provenance chip. */
  fromSteps: string[];
  /** Pre-ticked in the panel. False for anything blocked or already created. */
  selected: boolean;
  /** Set when the domain already exists on Jira — draft renders read-only. */
  existingKey?: string;
  /** Non-empty = cannot be created; each entry is a human-readable reason. */
  blockedBy: string[];
}

/**
 * Build the draft list. Every plan entry produces a draft — including ones that
 * are suppressed or blocked — because the panel shows why a domain is absent.
 * Entries whose `when` does not match are the only ones omitted entirely.
 */
export function planSubtasks(input: PlanSubtasksInput): SubtaskDraft[] {
  const { template, ticket, steps } = input;
  const ledger = input.ledger ?? [];
  const missingFields = input.missingRequiredFields ?? [];

  const drafts: SubtaskDraft[] = [];
  for (const entry of template.plan) {
    if (!matchesLabels(entry, ticket.labels)) { continue; }

    const entrySteps = resolveEntrySteps(entry, steps, input.reviewGateStepIds ?? []);
    const context = buildContext(template, entry, input, entrySteps);
    const summary = formatSubtaskSummary(template, context);
    const sections = renderSections(template, context, ticket, entrySteps, input.task);
    const labels = resolveLabels(template, ticket);

    const existingKey = findExisting(entry.domain, ledger, ticket);
    const blockedBy: string[] = [];
    if (missingFields.length > 0) {
      blockedBy.push(
        `Project bắt buộc field ${missingFields.map((f) => `"${f}"`).join(', ')} mà mẫu không điền được.`,
      );
    }
    for (const section of template.body.sections) {
      if (!section.required) { continue; }
      const rendered = sections.find((s) => s.heading === section.heading);
      if (!rendered || rendered.lines.length === 0) {
        blockedBy.push(`Mục bắt buộc "${section.heading}" không có nội dung.`);
      }
    }

    drafts.push({
      domain: entry.domain,
      summary,
      sections,
      descriptionMd: renderSubtaskMarkdown(sections, { separator: template.body.separator === 'rule' }),
      labels,
      fromSteps: entrySteps.map((s) => s.id),
      selected: entry.default && !existingKey && blockedBy.length === 0,
      ...(existingKey ? { existingKey } : {}),
      blockedBy,
    });
  }
  return drafts;
}

/** See `WhenSchema` — `orNoneOf` is an OR fallback, not an exclusion. */
function matchesLabels(entry: SubtaskPlanEntry, ticketLabels: string[]): boolean {
  const when = entry.when;
  if (!when) { return true; }
  const any = when.ticketLabelsAny ?? [];
  const noneOf = when.orNoneOf ?? [];
  if (any.length === 0 && noneOf.length === 0) { return true; }

  const have = new Set(ticketLabels.map((l) => l.toLowerCase()));
  const hasAny = (list: string[]) => list.some((l) => have.has(l.toLowerCase()));

  if (hasAny(any)) { return true; }
  return noneOf.length > 0 && !hasAny(noneOf);
}

/**
 * Map a plan entry's `fromSteps` onto the pipeline's actual steps. Ids the
 * pipeline does not have are dropped — a recipe that skips `prototype` should
 * not put "Prototype" in the checklist. `reviewGates` is a pseudo-id standing
 * for whatever review steps the pipeline has.
 */
function resolveEntrySteps(
  entry: SubtaskPlanEntry,
  steps: PlannerStep[],
  reviewGateStepIds: string[],
): PlannerStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: PlannerStep[] = [];
  for (const id of entry.fromSteps) {
    if (id === 'reviewGates') {
      for (const gateId of reviewGateStepIds) {
        const step = byId.get(gateId);
        if (step && !out.includes(step)) { out.push(step); }
      }
      continue;
    }
    const step = byId.get(id);
    if (step && !out.includes(step)) { out.push(step); }
  }
  return out;
}

function buildContext(
  template: SubtaskTemplate,
  entry: SubtaskPlanEntry,
  input: PlanSubtasksInput,
  entrySteps: PlannerStep[],
): PlaceholderContext {
  const { ticket, task } = input;
  // `what` may itself contain placeholders, so resolve it against the same
  // context minus itself before exposing it to the title format.
  const base: PlaceholderContext = {
    domain: entry.domain,
    labels: resolveLabels(template, ticket),
    'parent.key': ticket.key,
    'parent.summary': ticket.summary,
    'ticket.key': ticket.key,
    'ticket.summary': ticket.summary,
    'task.id': task?.id ?? ticket.key,
    'task.title': task?.title ?? ticket.summary,
    'step.name': entrySteps.map((s) => s.name).join(', '),
    'step.agent': entrySteps.map((s) => s.id).join(', '),
  };
  const [what] = resolveLines([entry.what], base, template.placeholders);
  return { ...base, what: what ?? entry.what };
}

/** Render every template section for one draft. */
function renderSections(
  template: SubtaskTemplate,
  context: PlaceholderContext,
  ticket: JiraTicket,
  entrySteps: PlannerStep[],
  task: PlanSubtasksInput['task'],
): RenderedSection[] {
  return template.body.sections.map((section) => {
    // `autofill` wins: it is an explicit instruction in the template.
    const lines = section.autofill.length > 0
      ? resolveLines(section.autofill, context, template.placeholders)
      : firstNonEmptySource(section.from, { ticket, entrySteps, task });
    return { heading: section.heading, kind: section.kind, lines };
  });
}

/** Try each declared source in order; first one with content wins. */
function firstNonEmptySource(
  sources: readonly string[],
  data: { ticket: JiraTicket; entrySteps: PlannerStep[]; task: PlanSubtasksInput['task'] },
): string[] {
  for (const source of sources) {
    const lines = readSource(source, data);
    if (lines.length > 0) { return lines; }
  }
  return [];
}

function readSource(
  source: string,
  { ticket, entrySteps, task }: { ticket: JiraTicket; entrySteps: PlannerStep[]; task: PlanSubtasksInput['task'] },
): string[] {
  switch (source) {
    case 'ticket.description':
      return splitLines(ticket.descriptionMd);
    case 'ticket.acceptanceCriteria':
      return ticket.acceptanceCriteria.filter((c) => c.trim());
    case 'task.description':
      return splitLines(task?.description ?? '');
    case 'steps.producesContains':
      return entrySteps.flatMap((s) => s.producesContains ?? []).filter((c) => c.trim());
    case 'steps.names':
      return entrySteps.map((s) => s.name).filter((n) => n.trim());
    default:
      return [];
  }
}

function splitLines(text: string): string[] {
  return text.split('\n').map((l) => l.trimEnd()).filter((l, i, all) => l.trim() || (i > 0 && all[i - 1].trim()));
}

function resolveLabels(template: SubtaskTemplate, ticket: JiraTicket): string[] {
  const out = template.fields.inheritParentLabels ? [...ticket.labels] : [];
  for (const label of template.fields.labels) {
    if (!out.includes(label)) { out.push(label); }
  }
  return out;
}

/**
 * Has this domain already been created? Our ledger is authoritative; failing
 * that, match the `[Domain]` prefix against subtasks already on the ticket so
 * we do not duplicate one a teammate made by hand.
 */
function findExisting(
  domain: string,
  ledger: SubtaskLedgerEntry[],
  ticket: JiraTicket,
): string | undefined {
  const fromLedger = ledger.find((e) => e.domain.toLowerCase() === domain.toLowerCase());
  if (fromLedger) { return fromLedger.key; }
  const prefix = `[${domain.toLowerCase()}]`;
  const byPrefix = ticket.existingSubtasks.find((s) => s.summary.trim().toLowerCase().startsWith(prefix));
  return byPrefix?.key;
}
