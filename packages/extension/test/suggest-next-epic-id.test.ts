import { describe, expect, it } from 'vitest';

import {
  formatSequencedEpicId,
  suggestNextEpicId,
  suggestNextEpicNumber,
} from '../src/v2/suggestNextEpicId';

describe('suggestNextEpicId', () => {
  it('starts at 1 when there are no numbered epics', () => {
    expect(suggestNextEpicId([])).toBe('1');
    expect(suggestNextEpicId(['README', 'notes'])).toBe('1');
    expect(suggestNextEpicNumber([])).toBe(1);
  });

  it('continues from the highest EPIC-NNN as digits only', () => {
    expect(suggestNextEpicId(['EPIC-001', 'EPIC-003'])).toBe('4');
  });

  it('continues the highest PREFIX-NNN number as digits only', () => {
    expect(suggestNextEpicId([
      'PASS-474',
      'PASS-1059',
      'PASS-1051',
      'PASS-893',
    ])).toBe('1060');
  });

  it('does not zero-pad', () => {
    expect(suggestNextEpicId(['EPIC-0007'])).toBe('8');
  });
});

describe('formatSequencedEpicId', () => {
  it('wraps bare numbers as EPIC-{n}', () => {
    expect(formatSequencedEpicId('1060')).toBe('EPIC-1060');
    expect(formatSequencedEpicId(8)).toBe('EPIC-8');
  });

  it('rewrites PREFIX-NNN to EPIC-{n}', () => {
    expect(formatSequencedEpicId('PASS-1059')).toBe('EPIC-1059');
  });
});
