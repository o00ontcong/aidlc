/**
 * `docs/epics/<ID>/jira.json` — the record of what AIDLC wrote to Jira on an
 * epic's behalf.
 *
 * Today that means subtasks, and the point of the file is idempotency: a domain
 * already listed here is never created twice, however many times the preview
 * panel is reopened or the window reloaded.
 *
 * Pure by design — {@link ./jiraSubtaskService} owns the VS Code side (config,
 * client, file I/O), so everything decidable without those lives here and is
 * tested as a table rather than against a live board.
 */

/** One subtask we created, so we never create it twice. */
export interface LedgerSubtask {
  domain: string;
  key: string;
  createdAt: string;
  /** Template hash at creation time, to explain a later mismatch. */
  templateHash?: string;
}

/**
 * Deliberately a sidecar rather than more keys in `inputs.json`: that file means
 * "capability inputs at start time", not a log.
 */
export interface JiraLedger {
  site: string;
  ticket: string;
  sprintId?: number;
  subtasks: LedgerSubtask[];
}

export function emptyLedger(ticket = '', site = ''): JiraLedger {
  return { site, ticket, subtasks: [] };
}

/**
 * Parse a ledger read off disk. Anything malformed degrades to an empty ledger
 * rather than throwing — a corrupt audit file must not break a pipeline run.
 * Losing history is bad; blocking work is worse.
 */
export function parseLedger(raw: unknown): JiraLedger {
  if (!raw || typeof raw !== 'object') { return emptyLedger(); }
  const source = raw as Partial<JiraLedger>;
  return {
    site: typeof source.site === 'string' ? source.site : '',
    ticket: typeof source.ticket === 'string' ? source.ticket : '',
    ...(typeof source.sprintId === 'number' ? { sprintId: source.sprintId } : {}),
    subtasks: Array.isArray(source.subtasks)
      ? source.subtasks.filter(isLedgerSubtask)
      : [],
  };
}

function isLedgerSubtask(value: unknown): value is LedgerSubtask {
  const entry = value as Partial<LedgerSubtask> | null;
  return Boolean(entry && typeof entry.domain === 'string' && typeof entry.key === 'string');
}

export function appendSubtask(ledger: JiraLedger, entry: LedgerSubtask): JiraLedger {
  const others = ledger.subtasks.filter(
    (existing) => existing.domain.toLowerCase() !== entry.domain.toLowerCase(),
  );
  return { ...ledger, subtasks: [...others, entry] };
}

/** The Jira key an epic is linked to, from its `inputs.json`. */
export function ticketKeyFromInputs(inputs: unknown): string {
  if (!inputs || typeof inputs !== 'object') { return ''; }
  const value = (inputs as Record<string, unknown>).jira;
  return typeof value === 'string' ? value.trim() : '';
}
