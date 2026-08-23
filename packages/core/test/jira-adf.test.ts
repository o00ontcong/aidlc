import { describe, it, expect } from 'vitest';

import { adfToMarkdown, extractAcceptanceCriteria } from '../src/integrations/jira/adfToMarkdown';
import type { AdfDoc } from '../src/integrations/jira/JiraTypes';

const doc = (...content: unknown[]): AdfDoc =>
  ({ type: 'doc', version: 1, content: content as AdfDoc['content'] });

const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });

describe('adfToMarkdown — degenerate input', () => {
  it('returns empty string for null / undefined', () => {
    expect(adfToMarkdown(null)).toBe('');
    expect(adfToMarkdown(undefined)).toBe('');
  });

  it('passes a plain string through (API v2 shape)', () => {
    expect(adfToMarkdown('  already text  ')).toBe('already text');
  });

  it('survives a doc with no content', () => {
    expect(adfToMarkdown({ type: 'doc', version: 1 })).toBe('');
  });

  it('skips malformed children instead of throwing', () => {
    const input = { type: 'doc', content: [null, undefined, 42, p(t('kept'))] } as unknown as AdfDoc;
    expect(adfToMarkdown(input)).toBe('kept');
  });
});

describe('adfToMarkdown — blocks', () => {
  it('renders paragraphs separated by a blank line', () => {
    expect(adfToMarkdown(doc(p(t('one')), p(t('two'))))).toBe('one\n\ntwo');
  });

  it('renders headings at their level', () => {
    const out = adfToMarkdown(doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Scope')] },
    ));
    expect(out).toBe('## Scope');
  });

  it('clamps an out-of-range heading level', () => {
    const out = adfToMarkdown(doc({ type: 'heading', attrs: { level: 99 }, content: [t('deep')] }));
    expect(out).toBe('###### deep');
  });

  it('renders a bullet list', () => {
    const out = adfToMarkdown(doc({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(t('first'))] },
        { type: 'listItem', content: [p(t('second'))] },
      ],
    }));
    expect(out).toBe('- first\n- second');
  });

  it('renders an ordered list starting at its declared order', () => {
    const out = adfToMarkdown(doc({
      type: 'orderedList',
      attrs: { order: 3 },
      content: [
        { type: 'listItem', content: [p(t('c'))] },
        { type: 'listItem', content: [p(t('d'))] },
      ],
    }));
    expect(out).toBe('3. c\n4. d');
  });

  it('indents a nested list', () => {
    const out = adfToMarkdown(doc({
      type: 'bulletList',
      content: [{
        type: 'listItem',
        content: [
          p(t('outer')),
          { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('inner'))] }] },
        ],
      }],
    }));
    expect(out).toContain('- outer');
    expect(out).toContain('  - inner');
  });

  it('renders a task list as markdown checkboxes, preserving DONE', () => {
    const out = adfToMarkdown(doc({
      type: 'taskList',
      attrs: { localId: 'x' },
      content: [
        { type: 'taskItem', attrs: { state: 'DONE' }, content: [t('shipped')] },
        { type: 'taskItem', attrs: { state: 'TODO' }, content: [t('pending')] },
      ],
    }));
    expect(out).toBe('- [x] shipped\n- [ ] pending');
  });

  it('renders a code block with its language', () => {
    const out = adfToMarkdown(doc({
      type: 'codeBlock',
      attrs: { language: 'sql' },
      content: [t('select 1')],
    }));
    expect(out).toBe('```sql\nselect 1\n```');
  });

  it('renders a blockquote with > on every line', () => {
    const out = adfToMarkdown(doc({
      type: 'blockquote',
      content: [p(t('line one')), p(t('line two'))],
    }));
    expect(out).toBe('> line one\n>\n> line two');
  });

  it('renders a rule', () => {
    expect(adfToMarkdown(doc({ type: 'rule' }))).toBe('---');
  });

  it('keeps panel content and drops the panel chrome', () => {
    const out = adfToMarkdown(doc({
      type: 'panel',
      attrs: { panelType: 'warning' },
      content: [p(t('careful'))],
    }));
    expect(out).toBe('careful');
  });
});

describe('adfToMarkdown — inline', () => {
  it('applies strong / em / code / strike marks', () => {
    const out = adfToMarkdown(doc(p(
      t('b', [{ type: 'strong' }]),
      t('i', [{ type: 'em' }]),
      t('c', [{ type: 'code' }]),
      t('s', [{ type: 'strike' }]),
    )));
    expect(out).toBe('**b**_i_`c`~~s~~');
  });

  it('wraps a link outside other marks', () => {
    const out = adfToMarkdown(doc(p(
      t('docs', [{ type: 'strong' }, { type: 'link', attrs: { href: 'https://x.test' } }]),
    )));
    expect(out).toBe('[**docs**](https://x.test)');
  });

  it('ignores an unknown mark but keeps the text', () => {
    const out = adfToMarkdown(doc(p(t('plain', [{ type: 'textColor', attrs: { color: '#ff0000' } }]))));
    expect(out).toBe('plain');
  });

  it('renders hardBreak as a newline inside the paragraph', () => {
    expect(adfToMarkdown(doc(p(t('a'), { type: 'hardBreak' }, t('b'))))).toBe('a\nb');
  });

  it('renders a mention as @name without doubling the @', () => {
    expect(adfToMarkdown(doc(p({ type: 'mention', attrs: { text: '@Cong' } })))).toBe('@Cong');
  });

  it('renders emoji by glyph, falling back to shortName', () => {
    expect(adfToMarkdown(doc(p({ type: 'emoji', attrs: { text: '🎯' } })))).toBe('🎯');
    expect(adfToMarkdown(doc(p({ type: 'emoji', attrs: { shortName: ':tada:' } })))).toBe(':tada:');
  });

  it('renders an inlineCard as its URL', () => {
    const out = adfToMarkdown(doc(p({ type: 'inlineCard', attrs: { url: 'https://j.test/ACME-1' } })));
    expect(out).toBe('https://j.test/ACME-1');
  });

  it('renders a status lozenge as inline code', () => {
    expect(adfToMarkdown(doc(p({ type: 'status', attrs: { text: 'BLOCKED' } })))).toBe('`BLOCKED`');
  });

  it('renders a date node as an ISO day', () => {
    const ts = Date.UTC(2026, 7, 22);
    expect(adfToMarkdown(doc(p({ type: 'date', attrs: { timestamp: String(ts) } })))).toBe('2026-08-22');
  });
});

describe('adfToMarkdown — tables and media', () => {
  const row = (...cells: string[]) => ({
    type: 'tableRow',
    content: cells.map((c) => ({ type: 'tableCell', content: [p(t(c))] })),
  });

  it('renders a rectangular table as a pipe table', () => {
    const out = adfToMarkdown(doc({ type: 'table', content: [row('h1', 'h2'), row('a', 'b')] }));
    expect(out).toBe('| h1 | h2 |\n| --- | --- |\n| a | b |');
  });

  it('falls back to a flat list when rows are ragged', () => {
    const out = adfToMarkdown(doc({ type: 'table', content: [row('h1', 'h2'), row('only')] }));
    expect(out).toBe('- h1 · h2\n- only');
  });

  it('escapes a pipe inside a cell', () => {
    const out = adfToMarkdown(doc({ type: 'table', content: [row('a|b', 'c')] }));
    expect(out).toContain('a\\|b');
  });

  it('renders media as an alt-text placeholder', () => {
    const out = adfToMarkdown(doc({
      type: 'mediaSingle',
      content: [{ type: 'media', attrs: { alt: 'screenshot', type: 'file' } }],
    }));
    expect(out).toBe('[screenshot]');
  });

  it('falls back to a generic placeholder when media has no alt', () => {
    const out = adfToMarkdown(doc({ type: 'media', attrs: { type: 'file' } }));
    expect(out).toBe('[ảnh]');
  });
});

describe('adfToMarkdown — unknown nodes', () => {
  it('keeps text inside an unknown block node', () => {
    const out = adfToMarkdown(doc({
      type: 'bodiedExtension',
      attrs: { extensionKey: 'some.macro' },
      content: [p(t('macro body survives'))],
    }));
    expect(out).toBe('macro body survives');
  });

  it('keeps text inside a deeply nested unknown layout', () => {
    const out = adfToMarkdown(doc({
      type: 'layoutSection',
      content: [{ type: 'layoutColumn', content: [p(t('column text'))] }],
    }));
    expect(out).toBe('column text');
  });

  it('collapses runs of blank lines', () => {
    const out = adfToMarkdown(doc(p(t('a')), { type: 'paragraph' }, { type: 'paragraph' }, p(t('b'))));
    expect(out).toBe('a\n\nb');
  });
});

describe('extractAcceptanceCriteria', () => {
  it('pulls bullets from an Acceptance Criteria heading', () => {
    const md = '# Ticket\n\nSome context.\n\n### Acceptance Criteria\n- one\n- two\n\nOther prose.';
    expect(extractAcceptanceCriteria(md)).toEqual(['one', 'two']);
  });

  it('accepts the AC abbreviation and a bold heading', () => {
    expect(extractAcceptanceCriteria('**AC**\n- a')).toEqual(['a']);
  });

  it('accepts a Vietnamese heading', () => {
    expect(extractAcceptanceCriteria('## Tiêu chí hoàn thành\n- xong A')).toEqual(['xong A']);
  });

  it('accepts Definition of Done', () => {
    expect(extractAcceptanceCriteria('### Definition of Done\n- merged')).toEqual(['merged']);
  });

  it('strips checkbox markers', () => {
    expect(extractAcceptanceCriteria('### Acceptance Criteria\n- [ ] todo\n- [x] done'))
      .toEqual(['todo', 'done']);
  });

  it('accepts numbered criteria', () => {
    expect(extractAcceptanceCriteria('### Acceptance Criteria\n1. first\n2. second'))
      .toEqual(['first', 'second']);
  });

  it('returns [] when there is no AC section rather than guessing', () => {
    expect(extractAcceptanceCriteria('Just a description with\n- an unrelated bullet')).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(extractAcceptanceCriteria('')).toEqual([]);
  });

  it('stops at the next non-list line', () => {
    const md = '### Acceptance Criteria\n- kept\n\nNot a criterion.\n- also not';
    expect(extractAcceptanceCriteria(md)).toEqual(['kept']);
  });
});
