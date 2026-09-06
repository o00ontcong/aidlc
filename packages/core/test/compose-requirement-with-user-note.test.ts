import { describe, it, expect } from 'vitest';

import {
  composeRequirementWithUserNote,
  extractUserNoteFromComposedRequirement,
  splitComposedRequirement,
  formatUserNoteBlock,
  userNoteCoverageIssues,
  USER_NOTE_HEADING,
  SOURCE_REQUIREMENT_HEADING,
  USER_NOTE_PRIORITY_RULE,
} from '../src/change/composeRequirementWithUserNote';

describe('composeRequirementWithUserNote', () => {
  it('returns the description unchanged when the note is empty', () => {
    expect(composeRequirementWithUserNote('## User Story\n\nAs a user…', '  ')).toBe('## User Story\n\nAs a user…');
    expect(composeRequirementWithUserNote('', '')).toBe('');
  });

  it('returns the note block when there is no source description', () => {
    const composed = composeRequirementWithUserNote('', 'Use recovery email, not SMS.');
    expect(composed).toBe(formatUserNoteBlock('Use recovery email, not SMS.'));
    expect(composed).toContain(USER_NOTE_HEADING);
    expect(composed).not.toContain(SOURCE_REQUIREMENT_HEADING);
  });

  it('puts the authoritative note above the source ticket so agents follow it on conflict', () => {
    const composed = composeRequirementWithUserNote(
      'Jira says use SMS OTP.',
      'Ticket is stale — use recovery email instead.',
    );
    expect(composed.startsWith(USER_NOTE_HEADING)).toBe(true);
    expect(composed).toContain('Ticket is stale — use recovery email instead.');
    expect(composed).toContain(`${SOURCE_REQUIREMENT_HEADING}\n\nJira says use SMS OTP.`);
    const noteAt = composed.indexOf('Ticket is stale');
    const sourceAt = composed.indexOf('Jira says use SMS OTP.');
    expect(noteAt).toBeGreaterThan(-1);
    expect(sourceAt).toBeGreaterThan(noteAt);
  });

  it('documents that the user note outranks description', () => {
    const composed = composeRequirementWithUserNote('old ticket', 'new instruction');
    expect(composed).toContain('outranks the description');
  });

  it('does not append the same note block twice', () => {
    const once = composeRequirementWithUserNote('ticket body', 'fix the AC');
    expect(composeRequirementWithUserNote(once, 'fix the AC')).toBe(once);
  });
});

describe('extractUserNoteFromComposedRequirement', () => {
  it('pulls the human note out of a composed block', () => {
    const composed = composeRequirementWithUserNote('Jira says SMS.', 'Use recovery email instead.');
    expect(extractUserNoteFromComposedRequirement(composed)).toBe('Use recovery email instead.');
  });
});

describe('splitComposedRequirement', () => {
  it('keeps the user note above the source description', () => {
    const split = splitComposedRequirement(
      composeRequirementWithUserNote('Jira body from the ticket.', 'Use the login input UI.'),
    );
    expect(split.userNote).toBe('Use the login input UI.');
    expect(split.sourceDescription).toBe('Jira body from the ticket.');
  });

  it('treats a plain description as source when there is no user note heading', () => {
    expect(splitComposedRequirement('just a ticket')).toEqual({
      userNote: '',
      sourceDescription: 'just a ticket',
    });
  });
});

describe('userNoteCoverageIssues', () => {
  const note = [
    'Two screens: Input Recovery Email Screen and Verify recovery email Screen.',
    'Figma: https://www.figma.com/design/abc123/recovery',
    'dùng ui input giống cái ui input tại màn hình login',
  ].join('\n');

  it('fails when the Figma URL and distinctive lines are missing', () => {
    const issues = userNoteCoverageIssues('# Requirement\n\n## 4. Screens (New / Update)\nN/A\n', note);
    expect(issues.some((issue) => issue.includes('figma.com'))).toBe(true);
    expect(issues.some((issue) => issue.includes('not folded'))).toBe(true);
  });

  it('passes when the requirement folds URLs and distinctive lines', () => {
    const requirement = [
      '# REQUIREMENT',
      '## 4. Screens (New / Update)',
      'Two screens: Input Recovery Email Screen and Verify recovery email Screen.',
      'Input Recovery Email Screen | New | https://www.figma.com/design/abc123/recovery |',
      'dùng ui input giống cái ui input tại màn hình login',
    ].join('\n');
    expect(userNoteCoverageIssues(requirement, note)).toEqual([]);
  });

  it('accepts a semantic screen/API mapping instead of demanding verbatim prose', () => {
    const semanticRequirement = [
      '# REQUIREMENT',
      '## 4. Screens (New / Update)',
      '| Screen | Change | Implementation |',
      '| Input Recovery Email Screen | New | Reuse the Login input UI |',
      '| Verify recovery email Screen | New | A separate view file for both add and edit flows |',
      '## 6. APIs (New / Update)',
      'API contract is taken from Jira comments.',
      'Figma: https://www.figma.com/design/abc123/recovery',
    ].join('\n');
    expect(semanticRequirement).not.toContain('dùng ui input giống cái ui input tại màn hình login');
    expect(userNoteCoverageIssues(semanticRequirement, note)).toEqual([]);
  });
});

describe('USER_NOTE_PRIORITY_RULE', () => {
  it('states that the user note outranks description', () => {
    expect(USER_NOTE_PRIORITY_RULE).toMatch(/outranks/);
    expect(USER_NOTE_PRIORITY_RULE).toMatch(/description/);
  });
});
