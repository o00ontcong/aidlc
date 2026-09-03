import { describe, expect, it } from 'vitest';

import {
  applyOps,
  getFileSpec,
  nextId,
  parseDoc,
  renderEmptyDoc,
  findSection,
  DOC_REQUIREMENTS,
  DOC_USE_CASES,
  DOC_PROJECT_STRUCTURE,
} from '../src';

const REQ_SPEC = getFileSpec(DOC_REQUIREMENTS)!;
const UC_SPEC = getFileSpec(DOC_USE_CASES)!;
const STRUCT_SPEC = getFileSpec(DOC_PROJECT_STRUCTURE)!;

const REQUIREMENTS = `# Requirements

## Functional requirements

- **FR-01** — User có thể mở video local.
- **FR-02** — User có thể nạp subtitle #1.

## Non-functional requirements

- **NFR-PERF-01** — Seek dưới 200ms trên file 2GB.

## Ghi chú của bạn

Ưu tiên iOS trước.


Android tính sau.
`;

describe('parseDoc', () => {
  it('reads declared sections as items and keeps undeclared ones verbatim', () => {
    const doc = parseDoc(REQUIREMENTS, REQ_SPEC);
    expect(doc.title).toBe('Requirements');
    expect(findSection(doc, 'functional')!.items.map((i) => i.id)).toEqual(['FR-01', 'FR-02']);
    expect(findSection(doc, 'nonFunctional')!.items[0]!.text).toBe('Seek dưới 200ms trên file 2GB.');

    const own = doc.sections.find((s) => s.key.startsWith('unknown:'))!;
    expect(own.heading).toBe('Ghi chú của bạn');
    expect(own.kind).toBe('unknown');
    expect(own.prose).toContain('Android tính sau.');
  });

  it('reads an indented description under a requirement or feature', () => {
    const content = `# Requirements

## Functional requirements

- **FR-01** — User có thể mở video local.
  Chọn file từ Files; player nạp khung đầu.
- **FR-02** — User có thể nạp subtitle #1.
  Description: Một file .srt gắn vào track overlay thứ nhất.

## Non-functional requirements
`;
    const items = findSection(parseDoc(content, REQ_SPEC), 'functional')!.items;
    expect(items[0]).toMatchObject({
      id: 'FR-01',
      text: 'User có thể mở video local.',
      description: 'Chọn file từ Files; player nạp khung đầu.',
    });
    expect(items[1]!.description).toBe('Một file .srt gắn vào track overlay thứ nhất.');
  });

  it('round-trips a description through add and update', () => {
    const added = applyOps('', REQ_SPEC, [{
      op: 'addItem',
      section: 'functional',
      text: 'Mở video local.',
      description: 'Chọn file từ Files.',
    }]);
    expect(added.content).toContain('- **FR-01** — Mở video local.\n  Chọn file từ Files.');
    expect(findSection(parseDoc(added.content, REQ_SPEC), 'functional')!.items[0]!.description).toBe('Chọn file từ Files.');

    const updated = applyOps(added.content, REQ_SPEC, [{
      op: 'updateItem',
      id: 'FR-01',
      text: 'Mở video local.',
      description: 'Chọn file từ Files hoặc Files app.',
    }]);
    expect(findSection(parseDoc(updated.content, REQ_SPEC), 'functional')!.items[0]!.description)
      .toBe('Chọn file từ Files hoặc Files app.');

    const titleOnly = applyOps(updated.content, REQ_SPEC, [{
      op: 'updateItem',
      id: 'FR-01',
      text: 'User mở được video local.',
    }]);
    expect(findSection(parseDoc(titleOnly.content, REQ_SPEC), 'functional')!.items[0]).toMatchObject({
      text: 'User mở được video local.',
      description: 'Chọn file từ Files hoặc Files app.',
    });
  });

  it('does not parse item-looking lines inside a fenced block', () => {
    const content = `# Project structure

## Folder tree

\`\`\`text
App/
- **FR-99** — not a requirement, just a tree line
\`\`\`

## Module mapping

- **MAP-01** — M-01 lives in App/Core.
`;
    const doc = parseDoc(content, STRUCT_SPEC);
    expect(findSection(doc, 'tree')!.prose).toContain('FR-99');
    expect(findSection(doc, 'mapping')!.items.map((i) => i.id)).toEqual(['MAP-01']);
  });

  it('reads a record with inline and list fields', () => {
    const content = `# Use cases

## Use cases

### UC-01 — Open video

- **Actor:** người dùng cuối
- **Main flow:**
  1. Chọn file
  2. Player load file

\`\`\`mermaid
flowchart TD
\`\`\`
`;
    const record = findSection(parseDoc(content, UC_SPEC), 'useCases')!.records[0]!;
    expect(record.id).toBe('UC-01');
    expect(record.title).toBe('Open video');
    expect(record.fields.find((f) => f.label === 'Actor')!.value).toBe('người dùng cuối');
    expect(record.fields.find((f) => f.label === 'Main flow')!.items).toEqual(['Chọn file', 'Player load file']);
    expect(record.extra.join('\n')).toContain('flowchart TD');
  });

  it('mints the next id per section and per group', () => {
    const doc = parseDoc(REQUIREMENTS, REQ_SPEC);
    expect(nextId(findSection(doc, 'functional'), REQ_SPEC.sections[0]!)).toBe('FR-03');
    expect(nextId(findSection(doc, 'nonFunctional'), REQ_SPEC.sections[1]!, 'perf')).toBe('NFR-PERF-02');
    expect(nextId(findSection(doc, 'nonFunctional'), REQ_SPEC.sections[1]!, 'a11y')).toBe('NFR-A11Y-01');
  });
});

describe('applyOps', () => {
  it('leaves every line it did not touch byte-identical', () => {
    const before = REQUIREMENTS.split('\n');
    const after = applyOps(REQUIREMENTS, REQ_SPEC, [{ op: 'updateItem', id: 'FR-01', text: 'User mở được video local.' }])
      .content.split('\n');
    expect(after.length).toBe(before.length);
    after.forEach((line, idx) => {
      if (idx === before.indexOf('- **FR-01** — User có thể mở video local.')) {
        expect(line).toBe('- **FR-01** — User mở được video local.');
      } else {
        expect(line).toBe(before[idx]);
      }
    });
  });

  it('appends an item under its own section without disturbing the next one', () => {
    const result = applyOps(REQUIREMENTS, REQ_SPEC, [{ op: 'addItem', section: 'functional', text: 'Hai subtitle hiển thị đồng thời.' }]);
    expect(result.applied).toEqual([{ op: 'addItem', id: 'FR-03' }]);
    expect(result.content).toContain('- **FR-02** — User có thể nạp subtitle #1.\n- **FR-03** — Hai subtitle hiển thị đồng thời.\n\n## Non-functional');
    expect(result.content).toContain('## Ghi chú của bạn\n\nƯu tiên iOS trước.');
  });

  it('removes an item and heals the blank line it left behind', () => {
    const result = applyOps(REQUIREMENTS, REQ_SPEC, [{ op: 'removeItem', id: 'FR-02' }]);
    expect(result.content).not.toContain('FR-02');
    expect(result.content).toContain('- **FR-01** — User có thể mở video local.\n\n## Non-functional requirements');
  });

  it('refuses to re-use an existing id instead of overwriting it', () => {
    const result = applyOps(REQUIREMENTS, REQ_SPEC, [{ op: 'addItem', section: 'functional', id: 'FR-01', text: 'nope' }]);
    expect(result.applied).toEqual([]);
    expect(result.issues[0]).toContain('FR-01 already exists');
    expect(result.content).toContain('- **FR-01** — User có thể mở video local.');
  });

  it('creates a missing file in spec section order', () => {
    const result = applyOps('', REQ_SPEC, [
      { op: 'addItem', section: 'nonFunctional', group: 'perf', text: 'Khởi động dưới 1s.' },
      { op: 'addItem', section: 'functional', text: 'Mở video.' },
    ]);
    expect(result.content).toBe(`# Requirements

## Functional requirements

- **FR-01** — Mở video.

## Non-functional requirements

- **NFR-PERF-01** — Khởi động dưới 1s.
`);
  });

  it('round-trips a record through update without dropping its free content', () => {
    const seeded = applyOps('', UC_SPEC, [{
      op: 'addRecord',
      section: 'useCases',
      title: 'Open video',
      fields: [{ label: 'Actor', value: 'người dùng' }, { label: 'Main flow', items: ['Chọn file'] }],
    }]).content;
    const withNote = `${seeded.trimEnd()}\n\n> ghi chú tay\n`;

    const updated = applyOps(withNote, UC_SPEC, [{
      op: 'updateRecord',
      id: 'UC-01',
      fields: [{ label: 'Trigger', value: 'bấm Mở video' }],
    }]).content;

    const record = findSection(parseDoc(updated, UC_SPEC), 'useCases')!.records[0]!;
    expect(record.fields.map((f) => f.label)).toEqual(['Actor', 'Trigger', 'Main flow']);
    expect(record.fields.find((f) => f.label === 'Actor')!.value).toBe('người dùng');
    expect(record.extra.join('\n')).toContain('> ghi chú tay');
  });

  it('replaces prose without reformatting the sections around it', () => {
    const result = applyOps(REQUIREMENTS, STRUCT_SPEC, []);
    expect(result.content).toBe(REQUIREMENTS);

    const tree = applyOps(renderEmptyDoc(STRUCT_SPEC), STRUCT_SPEC, [
      { op: 'setProse', section: 'tree', value: '```text\nApp/\n└── Core/\n```' },
    ]).content;
    expect(findSection(parseDoc(tree, STRUCT_SPEC), 'tree')!.prose).toBe('```text\nApp/\n└── Core/\n```');
    expect(tree).toContain('## Naming conventions');
  });

  it('reports an op it cannot apply instead of throwing away the rest', () => {
    const result = applyOps(REQUIREMENTS, REQ_SPEC, [
      { op: 'updateItem', id: 'FR-99', text: 'ghost' },
      { op: 'updateItem', id: 'FR-02', text: 'Nạp subtitle #1 (.srt).' },
    ]);
    expect(result.issues).toEqual(['Item FR-99 not found.']);
    expect(result.applied).toEqual([{ op: 'updateItem', id: 'FR-02' }]);
    expect(result.content).toContain('- **FR-02** — Nạp subtitle #1 (.srt).');
  });
});
