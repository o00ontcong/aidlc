import type { Idea, IdeaStage } from '../contracts/idea';
import { ALLOWED_ACTIONS_BY_STAGE, IdeaAgentActionSchema, type IdeaAgentAction, type IdeaAgentActionType } from './agentActions';

interface ParsedBlock {
  type: string;
  title?: string;
  body: string;
}

export interface ParsedProposal {
  actions: IdeaAgentAction[];
  /** Human-readable reasons for anything dropped — never silently discarded (spec §32). */
  unparsed: string[];
}

const HEADING_RE = /^###\s+([a-z_]+)(?:\s*:\s*(.+))?\s*$/i;
/** `- item`, `* item`, or a numbered `1. item` / `1) item` — agents write both styles. */
const BULLET_RE = /^(?:[-*]+|\d+[.)])\s*(.+)$/;
const SUBLIST_LABEL_RE = /^(Pros|Cons|Risks|Tradeoffs|Validation):\s*$/i;

/** Splits the pasted Markdown into `### <type>[: <title>]` blocks. Text before the first heading (stray prose) is dropped. */
function splitBlocks(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let current: { type: string; title?: string; bodyLines: string[] } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = HEADING_RE.exec(line);
    if (m) {
      if (current) blocks.push({ type: current.type, title: current.title, body: current.bodyLines.join('\n').trim() });
      current = { type: m[1]!.trim().toLowerCase(), title: m[2]?.trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) blocks.push({ type: current.type, title: current.title, body: current.bodyLines.join('\n').trim() });
  return blocks;
}

function bulletLines(body: string): string[] {
  return body.split(/\r?\n/)
    .map((l) => BULLET_RE.exec(l.trim())?.[1]?.trim())
    .filter((v): v is string => !!v);
}

/** `add_option`/`update_option` body: free-text description, then optional `Pros:`/`Cons:`/`Risks:`/`Tradeoffs:` bullet sub-lists and a `Validation:` line. */
function parseOptionBody(body: string): { description: string; pros: string[]; cons: string[]; risks: string[]; tradeoffs: string[]; validation?: string } {
  const lists: Record<'pros' | 'cons' | 'risks' | 'tradeoffs', string[]> = { pros: [], cons: [], risks: [], tradeoffs: [] };
  const descLines: string[] = [];
  let currentLabel: keyof typeof lists | 'validation' | null = null;
  let validation: string | undefined;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    const label = SUBLIST_LABEL_RE.exec(line);
    if (label) { currentLabel = label[1]!.toLowerCase() as keyof typeof lists | 'validation'; continue; }
    if (currentLabel === 'validation') {
      const bullet = BULLET_RE.exec(line);
      const text = bullet ? bullet[1]! : line;
      if (text) validation = validation ? `${validation} ${text}` : text;
    } else if (currentLabel) {
      const bullet = BULLET_RE.exec(line);
      if (bullet) lists[currentLabel].push(bullet[1]!.trim());
    } else {
      descLines.push(raw);
    }
  }
  return { description: descLines.join('\n').trim(), ...lists, validation };
}

/** `add_source` body convention: `<path or URL> — <question>`. Missing the dash means no question was given. */
function splitSourceLine(body: string): { source: string; question: string } {
  const idx = body.indexOf(' — ');
  if (idx < 0) return { source: body.trim(), question: '' };
  return { source: body.slice(0, idx).trim(), question: body.slice(idx + 3).trim() };
}

function buildCandidate(type: IdeaAgentActionType, block: ParsedBlock): unknown {
  switch (type) {
    case 'set_problem': case 'set_context': case 'add_user': case 'add_assumption':
    case 'add_unknown': case 'add_existing_solution': case 'add_validation':
    case 'set_recommendation': case 'rewrite_final_idea': case 'set_next_step':
      return block.body ? { type, value: block.body } : null;
    case 'ask_user':
      return block.body ? { type, question: block.body } : null;
    case 'add_finding':
      return block.body ? { type, text: block.body, findingType: (block.title ?? '').toLowerCase(), sourceIds: [] } : null;
    case 'add_source': {
      const { source, question } = splitSourceLine(block.body);
      return source ? { type, source, sourceType: block.title ?? 'doc', question } : null;
    }
    case 'add_option': {
      const parsed = parseOptionBody(block.body);
      return block.title ? { type, title: block.title, ...parsed } : null;
    }
    case 'update_option': {
      const parsed = parseOptionBody(block.body);
      return block.title ? { type, title: block.title, ...parsed } : null;
    }
    case 'add_risk':
      return block.title && block.body ? { type, optionTitle: block.title, value: block.body } : null;
    case 'propose_decision':
      return block.title && block.body ? { type, status: block.title, recommendation: block.body } : null;
    case 'set_scope': case 'set_out_of_scope': case 'set_success_criteria':
      return { type, value: bulletLines(block.body) };
    case 'mark_ready':
      return { type };
    default:
      return null;
  }
}

/** Rejects a duplicate `add_finding`/`add_option` against what the Idea already has — spec §32. Shared by both parsers below. */
function makeDeduper(idea: Idea) {
  const existingFindingTexts = new Set(idea.research.findings.map((f) => f.text.trim().toLowerCase()));
  const existingOptionTitles = new Set(idea.explore.options.map((o) => o.title.trim().toLowerCase()));
  return (action: IdeaAgentAction): string | null => {
    if (action.type === 'add_finding' && existingFindingTexts.has(action.text.trim().toLowerCase())) {
      return `Finding "${action.text}" already exists — skipped.`;
    }
    if (action.type === 'add_option' && existingOptionTitles.has(action.title.trim().toLowerCase())) {
      return `Option "${action.title}" already exists — skipped.`;
    }
    return null;
  };
}

function parseStrictBlocks(blocks: ParsedBlock[], stage: IdeaStage, idea: Idea): ParsedProposal {
  const actions: IdeaAgentAction[] = [];
  const unparsed: string[] = [];
  const dedupe = makeDeduper(idea);

  for (const block of blocks) {
    const type = block.type as IdeaAgentActionType;
    if (!ALLOWED_ACTIONS_BY_STAGE[stage].includes(type)) {
      unparsed.push(`"${block.type}" is not an allowed action in the "${stage}" stage — ignored.`);
      continue;
    }
    const candidate = buildCandidate(type, block);
    if (!candidate) {
      unparsed.push(`Could not read a "${block.type}" block — it was empty or missing its title — ignored.`);
      continue;
    }
    const parsed = IdeaAgentActionSchema.safeParse(candidate);
    if (!parsed.success) {
      unparsed.push(`"${block.type}" block did not match the expected shape — ignored.`);
      continue;
    }
    const dupeReason = dedupe(parsed.data);
    if (dupeReason) { unparsed.push(dupeReason); continue; }
    actions.push(parsed.data);
  }
  return { actions, unparsed };
}

// ── Natural-language notes fallback ─────────────────────────────────
//
// Agentic CLI tools (Claude Code, Cursor, ...) asked to "write up your
// understanding" very often write a normal Markdown doc with `##` headings
// named after the field (`## Problem`, `## Users`, ...) instead of the exact
// `### action_type` block format `buildStagePrompt` asks for — especially
// when the human ran the prompt through a coding agent that also has file
// write access, rather than a plain chat. Rather than forcing every agent to
// match one bespoke wire format, this fallback recognizes the same field
// vocabulary the app itself uses (see `stageContent.ts`'s renderer and
// `ideasI18n.ts`'s labels) and maps it onto the identical `IdeaAgentAction`
// set — so it goes through the exact same low/high-impact approval path.

interface NaturalBlock { heading: string; body: string }

const NATURAL_HEADING_RE = /^#{2,3}\s+(.+?)\s*$/;

function splitNaturalBlocks(markdown: string): NaturalBlock[] {
  const blocks: NaturalBlock[] = [];
  let current: { heading: string; bodyLines: string[] } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = NATURAL_HEADING_RE.exec(line);
    if (m) {
      if (current) blocks.push({ heading: current.heading, body: current.bodyLines.join('\n').trim() });
      current = { heading: m[1]!.trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) blocks.push({ heading: current.heading, body: current.bodyLines.join('\n').trim() });
  return blocks;
}

export type NaturalMode = 'single' | 'perBullet' | 'list';
/** `label` is the canonical heading text shown to an agent asked to write this stage's notes — kept next to its matching `match` regex so the two can never drift apart. */
interface NaturalRule { match: RegExp; mode: NaturalMode; action: IdeaAgentActionType; label: string }

const NATURAL_RULES: Record<IdeaStage, NaturalRule[]> = {
  understand: [
    { match: /^problem$/i, mode: 'single', action: 'set_problem', label: 'Problem' },
    { match: /^context$/i, mode: 'single', action: 'set_context', label: 'Context' },
    { match: /^users?(\s*\/?\s*use cases?)?$/i, mode: 'perBullet', action: 'add_user', label: 'Users / use cases' },
    { match: /^assumptions?$/i, mode: 'perBullet', action: 'add_assumption', label: 'Assumptions' },
    { match: /^(open )?unknowns?$/i, mode: 'perBullet', action: 'add_unknown', label: 'Unknowns' },
  ],
  research: [
    { match: /^findings?$/i, mode: 'perBullet', action: 'add_finding', label: 'Findings' },
    { match: /^existing solutions?$/i, mode: 'perBullet', action: 'add_existing_solution', label: 'Existing solutions' },
    { match: /^sources?( to read)?$/i, mode: 'perBullet', action: 'add_source', label: 'Sources' },
    { match: /^(open )?unknowns?$/i, mode: 'perBullet', action: 'add_unknown', label: 'Unknowns' },
  ],
  explore: [
    { match: /^(idea-level )?validation( ideas)?$/i, mode: 'perBullet', action: 'add_validation', label: 'Validation ideas' },
  ],
  decide: [
    { match: /^recommendation$/i, mode: 'single', action: 'set_recommendation', label: 'Recommendation' },
    { match: /^final idea$/i, mode: 'single', action: 'rewrite_final_idea', label: 'Final idea' },
    { match: /^scope$/i, mode: 'list', action: 'set_scope', label: 'Scope' },
    { match: /^out[ -]of[ -]scope$/i, mode: 'list', action: 'set_out_of_scope', label: 'Out of scope' },
    { match: /^success criteria$/i, mode: 'list', action: 'set_success_criteria', label: 'Success criteria' },
    { match: /^next step$/i, mode: 'single', action: 'set_next_step', label: 'Next step' },
  ],
  ready: [],
};

/**
 * Canonical `## <heading>` vocabulary for a stage, in the exact spelling the
 * natural-notes fallback recognizes — used to tell an agent (via
 * `IdeaAgentCommand.ts`) exactly which headings to write, so what gets
 * written and what gets read never drift apart. `mode` says whether that
 * heading's body should be one short paragraph, a bullet list, or (for
 * `list`-mode actions like `set_scope`) a bullet list that replaces the
 * whole field rather than appending to it.
 */
export function naturalHeadingsForStage(stage: IdeaStage): Array<{ label: string; mode: NaturalMode }> {
  return NATURAL_RULES[stage].map((rule) => ({ label: rule.label, mode: rule.mode }));
}

function naturalCandidate(action: IdeaAgentActionType, text: string): unknown {
  switch (action) {
    case 'set_problem': case 'set_context': case 'set_recommendation': case 'rewrite_final_idea':
    case 'set_next_step': case 'add_user': case 'add_assumption': case 'add_unknown': case 'add_validation':
      return text ? { type: action, value: text } : null;
    case 'add_existing_solution':
      return text ? { type: action, text } : null;
    case 'add_finding': {
      const m = /^\[(fact|assumption|inference)\]\s*/i.exec(text);
      const findingType = m ? m[1]!.toLowerCase() : 'inference';
      const body = m ? text.slice(m[0].length) : text;
      return body ? { type: action, text: body, findingType, sourceIds: [] } : null;
    }
    case 'add_source': {
      const { source, question } = splitSourceLine(text);
      return source ? { type: action, source, sourceType: 'doc', question } : null;
    }
    default:
      return null;
  }
}

/**
 * Fallback parser for a human-written (or agent-written) notes document that
 * uses plain `##`/`###` field headings instead of the `### action_type`
 * wire format. Only tried when {@link parseStrictBlocks} finds nothing at
 * all — a well-formed reply in the exact format always wins.
 */
function parseNaturalNotes(markdown: string, stage: IdeaStage, idea: Idea): ParsedProposal {
  const actions: IdeaAgentAction[] = [];
  const unparsed: string[] = [];
  const dedupe = makeDeduper(idea);
  const rules = NATURAL_RULES[stage];

  const push = (candidate: unknown) => {
    if (!candidate) return;
    const result = IdeaAgentActionSchema.safeParse(candidate);
    if (!result.success) return;
    const dupeReason = dedupe(result.data);
    if (dupeReason) { unparsed.push(dupeReason); return; }
    actions.push(result.data);
  };

  for (const block of splitNaturalBlocks(markdown)) {
    const rule = rules.find((r) => r.match.test(block.heading.trim()));
    if (rule) {
      if (!block.body) continue;
      if (rule.mode === 'single') {
        push(naturalCandidate(rule.action, block.body));
      } else if (rule.mode === 'list') {
        const lines = bulletLines(block.body);
        push({ type: rule.action, value: lines.length ? lines : [block.body] });
      } else {
        for (const line of (bulletLines(block.body).length ? bulletLines(block.body) : [block.body])) {
          push(naturalCandidate(rule.action, line));
        }
      }
      continue;
    }
    // In Explore, any other heading is treated as a solution option's title —
    // its body reuses the same Pros/Cons/Risks/Tradeoffs/Validation parser as `add_option`.
    if (stage === 'explore' && block.heading.trim()) {
      push({ type: 'add_option', title: block.heading.trim(), ...parseOptionBody(block.body) });
    }
    // Any other heading (e.g. "## Open questions asked", "## Still missing
    // before this stage can close") doesn't map to a structured field — not
    // every section of a human-written note has to; it is just not imported.
  }
  return { actions, unparsed };
}

/**
 * Parses a human-pasted (or file-imported) AI proposal into validated
 * {@link IdeaAgentAction}s. Nothing here calls an LLM — the text is whatever
 * the human decided to paste back, or a file their agent wrote to disk.
 * Tries the exact `### action_type` wire format first (`buildStagePrompt`'s
 * format); if the text doesn't contain a single recognizable block of that
 * form, falls back to reading plain `##`/`###` field headings (the common
 * shape an agentic CLI tool writes when just asked to "write up your
 * understanding"). Every rejection (unknown heading, wrong-stage action,
 * unparsable block, malformed payload, duplicate finding/option) is
 * surfaced in `unparsed` rather than silently dropped or thrown (spec §32).
 */
export function parseAgentProposal(markdown: string, stage: IdeaStage, idea: Idea): ParsedProposal {
  const blocks = splitBlocks(markdown);
  if (blocks.length === 0) {
    const natural = parseNaturalNotes(markdown, stage, idea);
    if (natural.actions.length > 0) return natural;
    return { actions: [], unparsed: ['No "### action_type" block or recognizable "## <Field>" heading was found in the text.'] };
  }
  return parseStrictBlocks(blocks, stage, idea);
}
