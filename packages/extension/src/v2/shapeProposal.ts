import * as fs from 'fs';
import * as path from 'path';

export const SHAPE_PROPOSAL_DRAFT_FILE = 'proposal-draft.json';

interface StoredShapeProposalDraft {
  schemaVersion: 1;
  shapeId: string;
  shapeRevision: number;
  generatedAt: string;
  proposal: object;
}

function proposalDraftPath(root: string, shapeId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(shapeId)) {
    throw new Error(`Unsafe Shape id: ${shapeId}`);
  }
  return path.join(root, '.aidlc', 'shapes', shapeId, SHAPE_PROPOSAL_DRAFT_FILE);
}

/** Save a revision-bound recommendation without applying it to the Shape. */
export function saveShapeProposalDraft(opts: {
  root: string;
  shapeId: string;
  shapeRevision: number;
  proposal: object;
}): void {
  const file = proposalDraftPath(opts.root, opts.shapeId);
  const stored: StoredShapeProposalDraft = {
    schemaVersion: 1,
    shapeId: opts.shapeId,
    shapeRevision: opts.shapeRevision,
    generatedAt: new Date().toISOString(),
    proposal: opts.proposal,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

/** Restore only a draft created for the Shape's current revision. */
export function loadShapeProposalDraft(
  root: string,
  shapeId: string,
  shapeRevision: number,
): Record<string, unknown> | null {
  const file = proposalDraftPath(root, shapeId);
  if (!fs.existsSync(file)) return null;
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoredShapeProposalDraft>;
    if (
      stored.schemaVersion !== 1
      || stored.shapeId !== shapeId
      || stored.shapeRevision !== shapeRevision
      || !stored.proposal
      || typeof stored.proposal !== 'object'
      || Array.isArray(stored.proposal)
    ) return null;
    return stored.proposal as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function deleteShapeProposalDraft(root: string, shapeId: string): void {
  const file = proposalDraftPath(root, shapeId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/** Extract the bounded Shape patch from a provider response. */
export function parseShapeUpdateProposalText(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('The agent response is empty.');

  const fenced = trimmed.match(/```(?:json|shape-update)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? (() => {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  })();
  const parsed = JSON.parse(candidate.trim()) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  const nested = record['shape-update'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return record;
}
