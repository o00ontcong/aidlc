import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deleteShapeProposalDraft,
  loadShapeProposalDraft,
  parseShapeUpdateProposalText,
  saveShapeProposalDraft,
} from '../src/v2/shapeProposal';

describe('Shape proposal parsing', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('extracts a fenced shape-update object from a provider response', () => {
    const proposal = parseShapeUpdateProposalText(`Here is the final plan.

\`\`\`shape-update
{"selectedApproach":"Guided setup","acceptanceCriteria":["A new user finishes setup"]}
\`\`\``);

    expect(proposal).toEqual({
      selectedApproach: 'Guided setup',
      acceptanceCriteria: ['A new user finishes setup'],
    });
  });

  it('accepts a nested shape-update key and rejects empty input', () => {
    expect(parseShapeUpdateProposalText('{"shape-update":{"rationale":"Simple"}}'))
      .toEqual({ rationale: 'Simple' });
    expect(() => parseShapeUpdateProposalText('')).toThrow(/agent response is empty/i);
  });

  it('persists a proposal only for the matching Shape revision', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-shape-proposal-'));
    roots.push(root);
    const proposal = { selectedApproach: 'Guided setup', acceptanceCriteria: ['Setup completes'] };

    saveShapeProposalDraft({ root, shapeId: 'SHAPE-001', shapeRevision: 3, proposal });

    expect(loadShapeProposalDraft(root, 'SHAPE-001', 3)).toEqual(proposal);
    expect(loadShapeProposalDraft(root, 'SHAPE-001', 4)).toBeNull();
    deleteShapeProposalDraft(root, 'SHAPE-001');
    expect(loadShapeProposalDraft(root, 'SHAPE-001', 3)).toBeNull();
  });

  it('rejects unsafe Shape ids for proposal storage', () => {
    expect(() => loadShapeProposalDraft('/tmp', '../escape', 0)).toThrow(/unsafe shape id/i);
  });
});
