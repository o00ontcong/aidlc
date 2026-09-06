/**
 * Start-Epic input capture. Sprint prefills `inputs.jira` even when the
 * selected pipeline's agents never declared a `jira` capability, and the
 * host rewrites `PASS-123` task ids to `EPIC-123` — so the ticket key must
 * survive independently of both the capability list and the lifecycle EpicId.
 */

const JIRA_KEY = /^([A-Z][A-Z0-9_]*)-(\d+)$/i;
const JIRA_BROWSE = /\/browse\/([A-Z][A-Z0-9_]*-\d+)/i;

/**
 * Extract a Jira issue key from a typed value or browse URL.
 * `EPIC-N` is an AIDLC lifecycle id, not a Jira key.
 */
export function parseJiraIssueKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) { return ''; }
  const fromUrl = JIRA_BROWSE.exec(trimmed);
  if (fromUrl) {
    return parseJiraIssueKey(fromUrl[1]!);
  }
  const match = JIRA_KEY.exec(trimmed);
  if (!match) { return ''; }
  const prefix = match[1]!.toUpperCase();
  if (prefix === 'EPIC') { return ''; }
  return `${prefix}-${match[2]}`;
}

export function resolveJiraTicketKey(args: {
  inputs?: Record<string, string>;
  epicId?: string;
}): string {
  const fromInputs = parseJiraIssueKey(args.inputs?.jira ?? '');
  if (fromInputs) { return fromInputs; }
  return parseJiraIssueKey(args.epicId ?? '');
}

/**
 * Persist every non-empty typed/prefilled input. Declared capabilities are
 * not a filter — a Sprint-started epic must keep `jira` even when the
 * pipeline agent omitted that capability.
 */
export function collectStartEpicInputs(
  inputs: Record<string, string>,
  extras?: { epicId?: string },
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    const trimmed = value.trim();
    if (trimmed) { clean[key] = trimmed; }
  }
  const jira = resolveJiraTicketKey({ inputs: clean, epicId: extras?.epicId });
  if (jira) { clean.jira = jira; }
  return clean;
}
