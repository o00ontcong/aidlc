import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

import {
  formatSubtaskSummary,
  hashTemplateSource,
  isTemplateStale,
  loadSubtaskTemplate,
  referencedPlaceholders,
  resolveLines,
  resolvePlaceholders,
  SubtaskTemplateError,
  validateSubtaskTemplate,
  type SubtaskTemplate,
} from '../src/integrations/jira/subtaskTemplate';

const SHIPPED_TEMPLATE = path.resolve(__dirname, '../templates/jira/subtask-template.yaml');

/** Minimal valid template — every test that needs a tweak starts from this. */
const minimal = (): Record<string, unknown> => ({
  version: 1,
  title: { format: '[{{domain}}] {{what}}', domains: ['Backend', 'Testing'] },
  body: {
    sections: [
      { key: 'description', heading: '🔧 Description', kind: 'prose', required: true, from: ['ticket.description'] },
      { key: 'labels', heading: '🏷️ Labels', kind: 'inlineCode', autofill: ['{{labels}}'] },
    ],
  },
  plan: [
    { domain: 'Backend', what: '{{task.title}}', fromSteps: ['implement'] },
    { domain: 'Testing', what: '{{task.title}} — tests', fromSteps: ['execute-test'] },
  ],
  placeholders: ['domain', 'what', 'labels', 'task.title'],
});

describe('the shipped template', () => {
  const template = loadSubtaskTemplate(fs.readFileSync(SHIPPED_TEMPLATE, 'utf8'), SHIPPED_TEMPLATE);

  it('parses and validates', () => {
    expect(template.version).toBe(1);
  });

  it('carries the six domains from the Confluence page, in order', () => {
    expect(template.title.domains).toEqual([
      'Documentation', 'Frontend', 'Backend', 'Infra', 'Code review', 'Testing',
    ]);
  });

  it('prefixes the summary with the domain, as the page requires', () => {
    expect(template.title.format).toBe('[{{domain}}] {{what}}');
  });

  it('carries the five body sections in the page order', () => {
    expect(template.body.sections.map((s) => s.key)).toEqual([
      'description', 'completionCriteria', 'checklist', 'parentTask', 'labels',
    ]);
  });

  it('makes the Checklist a taskList so Jira renders real checkboxes', () => {
    const checklist = template.body.sections.find((s) => s.key === 'checklist');
    expect(checklist?.kind).toBe('taskList');
    expect(checklist?.required).toBe(false);
  });

  it('marks Description and Completion Criteria required', () => {
    expect(template.body.sections.find((s) => s.key === 'description')?.required).toBe(true);
    expect(template.body.sections.find((s) => s.key === 'completionCriteria')?.required).toBe(true);
  });

  it('separates sections with a rule, matching the page --- markers', () => {
    expect(template.body.separator).toBe('rule');
  });

  it('resolves the subtask issue type instead of hardcoding a name', () => {
    expect(template.fields.issueTypeName).toBe('auto');
  });

  it('plans one entry per domain', () => {
    expect(template.plan.map((p) => p.domain).sort()).toEqual(
      [...template.title.domains].sort(),
    );
  });

  it('leaves Infra off by default and the rest on', () => {
    const byDomain = new Map(template.plan.map((p) => [p.domain, p]));
    expect(byDomain.get('Infra')?.default).toBe(false);
    expect(byDomain.get('Documentation')?.default).toBe(true);
    expect(byDomain.get('Testing')?.default).toBe(true);
  });

  it('records the Confluence page it came from', () => {
    expect(template.source.confluence).toContain('/wiki/spaces/STT/pages/19791882/');
  });

  it('only references allowlisted placeholders', () => {
    const allowed = new Set(template.placeholders);
    const texts = [
      template.title.format,
      ...template.plan.map((p) => p.what),
      ...template.body.sections.flatMap((s) => s.autofill),
    ];
    for (const text of texts) {
      for (const token of referencedPlaceholders(text)) {
        expect(allowed.has(token), `${token} thiếu trong placeholders:`).toBe(true);
      }
    }
  });
});

describe('validateSubtaskTemplate — rejections', () => {
  it('rejects a wrong version', () => {
    expect(() => validateSubtaskTemplate({ ...minimal(), version: 2 })).toThrow(SubtaskTemplateError);
  });

  it('rejects an unknown section kind', () => {
    const raw = minimal() as any;
    raw.body.sections[0].kind = 'table';
    expect(() => validateSubtaskTemplate(raw)).toThrow(/kind/);
  });

  it('rejects an unknown content source rather than silently rendering nothing', () => {
    const raw = minimal() as any;
    raw.body.sections[0].from = ['ticket.descriptions'];
    expect(() => validateSubtaskTemplate(raw)).toThrow(SubtaskTemplateError);
  });

  it('rejects a plan domain missing from title.domains', () => {
    const raw = minimal() as any;
    raw.plan.push({ domain: 'Platform', what: 'x' });
    expect(() => validateSubtaskTemplate(raw)).toThrow(/Platform/);
  });

  it('rejects duplicate plan domains — dedupe keys off domain', () => {
    const raw = minimal() as any;
    raw.plan.push({ domain: 'Backend', what: 'again' });
    expect(() => validateSubtaskTemplate(raw)).toThrow(/trùng/);
  });

  it('rejects duplicate section keys', () => {
    const raw = minimal() as any;
    raw.body.sections.push({ key: 'description', heading: 'dup', kind: 'prose' });
    expect(() => validateSubtaskTemplate(raw)).toThrow(/key trùng/);
  });

  it('rejects an empty plan', () => {
    const raw = minimal() as any;
    raw.plan = [];
    expect(() => validateSubtaskTemplate(raw)).toThrow(SubtaskTemplateError);
  });

  it('names the file in the error so a hand-edit is findable', () => {
    expect(() => validateSubtaskTemplate({ version: 1 }, '.aidlc/x.yaml')).toThrow(/\.aidlc\/x\.yaml/);
  });
});

describe('loadSubtaskTemplate', () => {
  it('reports a YAML syntax error as such', () => {
    expect(() => loadSubtaskTemplate('version: 1\n  bad: [')).toThrow(/không parse được YAML/);
  });

  it('reports an empty file', () => {
    expect(() => loadSubtaskTemplate('')).toThrow(/rỗng/);
  });

  it('applies schema defaults', () => {
    const t = loadSubtaskTemplate(`
version: 1
title: { format: '[{{domain}}] x', domains: [Backend] }
body: { sections: [{ key: d, heading: D, kind: prose }] }
plan: [{ domain: Backend, what: x }]
`);
    expect(t.body.separator).toBe('rule');
    expect(t.title.maxLength).toBe(255);
    expect(t.fields.assignee).toBe('currentUser');
    expect(t.plan[0].default).toBe(true);
  });
});

describe('resolvePlaceholders — allowlist is the boundary', () => {
  const ctx = { domain: 'Backend', 'ticket.key': 'ACME-1', evil: 'pwned' };
  const allowed = ['domain', 'ticket.key'];

  it('substitutes an allowlisted token', () => {
    expect(resolvePlaceholders('[{{domain}}]', ctx, allowed)).toBe('[Backend]');
  });

  it('leaves a non-allowlisted token verbatim, even with a value present', () => {
    expect(resolvePlaceholders('{{evil}}', ctx, allowed)).toBe('{{evil}}');
  });

  it('substitutes empty for an allowlisted token with no value', () => {
    expect(resolvePlaceholders('x{{ticket.summary}}y', ctx, ['ticket.summary'])).toBe('xy');
  });

  it('tolerates inner whitespace', () => {
    expect(resolvePlaceholders('{{  domain  }}', ctx, allowed)).toBe('Backend');
  });

  it('joins an array value with a comma', () => {
    expect(resolvePlaceholders('{{labels}}', { labels: ['a', 'b'] }, ['labels'])).toBe('a, b');
  });

  it('leaves a bare string with no tokens alone', () => {
    expect(resolvePlaceholders('nothing here', ctx, allowed)).toBe('nothing here');
  });
});

describe('resolveLines', () => {
  it('expands a solo array token to one line per element', () => {
    expect(resolveLines(['{{labels}}'], { labels: ['auth', 'frontend'] }, ['labels']))
      .toEqual(['auth', 'frontend']);
  });

  it('joins an array token that shares the line with other text', () => {
    expect(resolveLines(['tags: {{labels}}'], { labels: ['a', 'b'] }, ['labels']))
      .toEqual(['tags: a, b']);
  });

  it('drops a line that resolves to nothing', () => {
    expect(resolveLines(['{{parent.key}}'], {}, ['parent.key'])).toEqual([]);
  });

  it('keeps a non-allowlisted token as a literal line', () => {
    expect(resolveLines(['{{nope}}'], { nope: ['x'] }, [])).toEqual(['{{nope}}']);
  });

  it('drops an empty array without leaving an empty bullet', () => {
    expect(resolveLines(['{{labels}}'], { labels: [] }, ['labels'])).toEqual([]);
  });
});

describe('formatSubtaskSummary', () => {
  const template = validateSubtaskTemplate(minimal()) as SubtaskTemplate;

  it('renders the domain prefix the page mandates', () => {
    const out = formatSubtaskSummary(template, { domain: 'Backend', what: 'Create DB migration script' });
    expect(out).toBe('[Backend] Create DB migration script');
  });

  it('collapses whitespace from a multiline ticket summary', () => {
    const out = formatSubtaskSummary(template, { domain: 'Backend', what: 'a\n  b   c' });
    expect(out).toBe('[Backend] a b c');
  });

  /** Same template, one domain, a shorter cap. */
  const capped = (maxLength: number) => validateSubtaskTemplate({
    ...minimal(),
    title: { format: '{{what}}', domains: ['Backend'], maxLength },
    plan: [{ domain: 'Backend', what: '{{task.title}}' }],
  });

  it('truncates on a word boundary at maxLength', () => {
    const out = formatSubtaskSummary(capped(20), { what: 'alpha beta gamma delta epsilon' });
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toBe('alpha beta gamma');
  });

  it('hard-cuts when there is no usable word boundary', () => {
    expect(formatSubtaskSummary(capped(8), { what: 'abcdefghijklmno' })).toBe('abcdefgh');
  });
});

describe('template staleness', () => {
  const template = validateSubtaskTemplate(minimal());

  it('hashes ignoring whitespace reflow', () => {
    expect(hashTemplateSource('a  b\n c')).toBe(hashTemplateSource('a b c'));
  });

  it('is not stale when the page is unchanged', () => {
    const body = '# Sub-task\nrules';
    const withHash = { ...template, source: { ...template.source, contentHash: hashTemplateSource(body) } };
    expect(isTemplateStale(withHash, body)).toBe(false);
  });

  it('is stale when the page changed', () => {
    const withHash = { ...template, source: { ...template.source, contentHash: hashTemplateSource('old') } };
    expect(isTemplateStale(withHash, 'new')).toBe(true);
  });

  it('is not stale when never imported — a default template is not a stale one', () => {
    expect(isTemplateStale(template, 'anything')).toBe(false);
  });
});
