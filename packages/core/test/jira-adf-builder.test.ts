import { describe, it, expect } from 'vitest';

import {
  buildSubtaskAdf,
  renderSubtaskMarkdown,
  type RenderedSection,
} from '../src/integrations/jira/adfBuilder';
import { adfToMarkdown } from '../src/integrations/jira/adfToMarkdown';
import type { AdfNode } from '../src/integrations/jira/JiraTypes';

/** The five sections of the STT/Sub-task template, in order. */
const SECTIONS: RenderedSection[] = [
  { heading: '🔧 Description', kind: 'prose', lines: ['Redirect to /goodbye after IdP logout.'] },
  {
    heading: '✅ Completion Criteria',
    kind: 'bulletList',
    lines: ['Lands on /goodbye in one redirect', 'Session cookie cleared first'],
  },
  { heading: '📋 Checklist', kind: 'taskList', lines: ['Implement', 'Execute Test'] },
  { heading: '🔗 Parent Task', kind: 'bulletList', lines: ['ACME-4830'] },
  { heading: '🏷️ Labels', kind: 'inlineCode', lines: ['auth', 'frontend'] },
];

const types = (nodes: AdfNode[] | undefined) => (nodes ?? []).map((n) => n.type);

describe('buildSubtaskAdf — document shape', () => {
  it('emits a versioned doc root', () => {
    const adf = buildSubtaskAdf(SECTIONS);
    expect(adf.type).toBe('doc');
    expect(adf.version).toBe(1);
  });

  it('emits heading + body per section with rules between', () => {
    const adf = buildSubtaskAdf(SECTIONS);
    expect(types(adf.content)).toEqual([
      'heading', 'paragraph',
      'rule', 'heading', 'bulletList',
      'rule', 'heading', 'taskList',
      'rule', 'heading', 'bulletList',
      'rule', 'heading', 'paragraph',
    ]);
  });

  it('omits the separator when asked', () => {
    const adf = buildSubtaskAdf(SECTIONS, { separator: false });
    expect(types(adf.content)).not.toContain('rule');
  });

  it('uses heading level 3 by default, matching the template ###', () => {
    const adf = buildSubtaskAdf(SECTIONS);
    expect(adf.content?.[0]?.attrs?.level).toBe(3);
  });

  it('honours a custom heading level', () => {
    const adf = buildSubtaskAdf(SECTIONS, { headingLevel: 2 });
    expect(adf.content?.[0]?.attrs?.level).toBe(2);
  });

  it('drops a section whose lines are empty or whitespace', () => {
    const adf = buildSubtaskAdf([
      SECTIONS[0],
      { heading: '📋 Checklist', kind: 'taskList', lines: [] },
      { heading: '🏷️ Labels', kind: 'inlineCode', lines: ['  '] },
    ]);
    expect(types(adf.content)).toEqual(['heading', 'paragraph']);
  });

  it('returns an empty doc when every section is empty', () => {
    const adf = buildSubtaskAdf([{ heading: 'x', kind: 'prose', lines: [] }]);
    expect(adf.content).toEqual([]);
  });
});

describe('buildSubtaskAdf — taskList is a real Jira checklist', () => {
  const taskListNode = () => {
    const adf = buildSubtaskAdf(SECTIONS);
    return adf.content?.find((n) => n.type === 'taskList');
  };

  it('emits taskItem children, not text bullets', () => {
    expect(types(taskListNode()?.content)).toEqual(['taskItem', 'taskItem']);
  });

  it('starts every item unchecked', () => {
    for (const item of taskListNode()?.content ?? []) {
      expect(item.attrs?.state).toBe('TODO');
    }
  });

  it('gives the list and every item a localId — Jira rejects the payload without one', () => {
    const list = taskListNode();
    expect(typeof list?.attrs?.localId).toBe('string');
    expect(String(list?.attrs?.localId)).not.toBe('');
    for (const item of list?.content ?? []) {
      expect(String(item.attrs?.localId)).not.toBe('');
    }
  });

  it('keeps every localId unique across the document', () => {
    const list = taskListNode();
    const ids = [list?.attrs?.localId, ...(list?.content ?? []).map((i) => i.attrs?.localId)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic, so payloads are snapshot-testable', () => {
    expect(JSON.stringify(buildSubtaskAdf(SECTIONS)))
      .toBe(JSON.stringify(buildSubtaskAdf(SECTIONS)));
  });
});

describe('buildSubtaskAdf — section kinds', () => {
  it('splits prose into paragraphs on blank lines', () => {
    const adf = buildSubtaskAdf([
      { heading: 'H', kind: 'prose', lines: ['one', '', 'two'] },
    ], { separator: false });
    expect(types(adf.content)).toEqual(['heading', 'paragraph', 'paragraph']);
  });

  it('joins prose lines inside one paragraph with a hardBreak', () => {
    const adf = buildSubtaskAdf([
      { heading: 'H', kind: 'prose', lines: ['first', 'second'] },
    ], { separator: false });
    expect(types(adf.content?.[1]?.content)).toEqual(['text', 'hardBreak', 'text']);
  });

  it('emits one listItem per bullet line', () => {
    const adf = buildSubtaskAdf([SECTIONS[1]], { separator: false });
    const list = adf.content?.[1];
    expect(types(list?.content)).toEqual(['listItem', 'listItem']);
    expect(list?.content?.[0]?.content?.[0]?.type).toBe('paragraph');
  });

  it('marks each label as inline code, comma separated', () => {
    const adf = buildSubtaskAdf([SECTIONS[4]], { separator: false });
    const para = adf.content?.[1];
    expect(types(para?.content)).toEqual(['text', 'text', 'text']);
    expect(para?.content?.[0]?.marks?.[0]?.type).toBe('code');
    expect(para?.content?.[1]?.text).toBe(', ');
    expect(para?.content?.[2]?.marks?.[0]?.type).toBe('code');
  });
});

describe('renderSubtaskMarkdown — the preview the user approves', () => {
  it('reproduces the template block structure', () => {
    expect(renderSubtaskMarkdown(SECTIONS)).toBe(
      '### 🔧 Description\n'
      + 'Redirect to /goodbye after IdP logout.\n'
      + '\n---\n\n'
      + '### ✅ Completion Criteria\n'
      + '- Lands on /goodbye in one redirect\n'
      + '- Session cookie cleared first\n'
      + '\n---\n\n'
      + '### 📋 Checklist\n'
      + '- [ ] Implement\n'
      + '- [ ] Execute Test\n'
      + '\n---\n\n'
      + '### 🔗 Parent Task\n'
      + '- ACME-4830\n'
      + '\n---\n\n'
      + '### 🏷️ Labels\n'
      + '`auth`, `frontend`',
    );
  });

  it('drops the same empty sections the ADF builder drops', () => {
    const sections: RenderedSection[] = [
      SECTIONS[0],
      { heading: '📋 Checklist', kind: 'taskList', lines: [] },
    ];
    expect(renderSubtaskMarkdown(sections)).not.toContain('Checklist');
    expect(types(buildSubtaskAdf(sections).content)).toEqual(['heading', 'paragraph']);
  });

  it('round-trips through the reader with the same visible content', () => {
    // The preview and the payload come from one model; reading the payload back
    // must not surface anything the preview did not show.
    const viaAdf = adfToMarkdown(buildSubtaskAdf(SECTIONS));
    for (const section of SECTIONS) {
      expect(viaAdf).toContain(section.heading);
      for (const line of section.lines) {
        expect(viaAdf).toContain(line);
      }
    }
    expect(viaAdf).toContain('- [ ] Implement');
  });
});
