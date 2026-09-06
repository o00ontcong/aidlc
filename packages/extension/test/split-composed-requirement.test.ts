import { describe, expect, it } from 'vitest';

import { splitComposedRequirement } from '../src/shared/splitComposedRequirement';

describe('splitComposedRequirement (webview)', () => {
  it('puts user note above source description', () => {
    const text = [
      '## User note (authoritative)',
      '',
      'This note is from the person who started the work. It outranks the description.',
      '',
      'Use the login input UI.',
      '',
      '## Source requirement',
      '',
      'Jira says SMS.',
    ].join('\n');
    expect(splitComposedRequirement(text)).toEqual({
      userNote: 'Use the login input UI.',
      sourceDescription: 'Jira says SMS.',
    });
  });
});
