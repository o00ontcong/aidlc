import { describe, expect, it } from 'vitest';

import { DOC_IDEA, DOC_MODULES, DOC_REQUIREMENTS, DOC_USE_CASES, getFileSpec } from '../src/discover/DocSpec';
import { extractManagedDocument, renderManagedDocument } from '../src/context/ContextMarkdownBridge';
import type { ContextObject } from '../src/contracts/projectContext';

function objectsBySection(extracted: ReturnType<typeof extractManagedDocument>): Record<string, ContextObject[]> {
  const out: Record<string, ContextObject[]> = {};
  for (const [key, section] of Object.entries(extracted.sections)) out[key] = section.objects;
  return out;
}

describe('ContextMarkdownBridge — round trip (import -> render -> import produces the same objects)', () => {
  it('round-trips a mixed prose + items document (IDEA.md)', () => {
    const spec = getFileSpec(DOC_IDEA)!;
    const original = [
      '# Idea',
      '',
      '## Original sentence',
      '',
      'A note-taking app for busy parents.',
      '',
      '## Problem',
      '',
      'Parents forget errands mid-day.',
      '',
      '## Users',
      '',
      '- **U-01** — Busy parent',
      '- **U-02** — Caregiver',
      '  A person who is not the parent but helps with errands.',
      '',
      '## Core value',
      '',
      'Never forget an errand again.',
      '',
      '## Minimum MVP',
      '',
      'A single shared list.',
      '',
    ].join('\n');

    const first = extractManagedDocument(spec, original);
    expect(first.blockers).toEqual([]);
    const rendered = renderManagedDocument(spec, first.meta, objectsBySection(first));
    const second = extractManagedDocument(spec, rendered);
    expect(second.blockers).toEqual([]);
    expect(second.sections).toEqual(first.sections);
    expect(second.meta).toEqual(first.meta);

    // Semantic content survives even though byte-identical isn't required (heading/whitespace conventions may normalize).
    expect(rendered).toContain('A note-taking app for busy parents.');
    expect(rendered).toContain('- **U-02** — Caregiver');
    expect(rendered).toContain('A person who is not the parent but helps with errands.');
  });

  it('round-trips grouped ids (REQUIREMENTS.md non-functional NFR-<GROUP>-NN)', () => {
    const spec = getFileSpec(DOC_REQUIREMENTS)!;
    const original = [
      '# Requirements',
      '',
      '## Functional requirements',
      '',
      '- **FR-01** — Users can add an item to the list',
      '- **FR-02** — Users can check an item off',
      '- **FR-03** — Users can share the list',
      '',
      '## Non-functional requirements',
      '',
      '- **NFR-PERF-01** — List loads in under 200ms',
      '- **NFR-A11Y-01** — Screen reader labels on every control',
      '',
    ].join('\n');

    const first = extractManagedDocument(spec, original);
    expect(first.blockers).toEqual([]);
    expect(first.sections.functional.objects.map((o) => o.entityKey)).toEqual(['FR-01', 'FR-02', 'FR-03']);
    expect(first.sections.nonFunctional.objects.map((o) => o.entityKey)).toEqual(['NFR-PERF-01', 'NFR-A11Y-01']);

    const rendered = renderManagedDocument(spec, first.meta, objectsBySection(first));
    const second = extractManagedDocument(spec, rendered);
    expect(second.sections).toEqual(first.sections);
  });

  it('round-trips records with list + scalar fields and preserves an undeclared field as trailingMarkdown (MODULES.md)', () => {
    const spec = getFileSpec(DOC_MODULES)!;
    const original = [
      '# Modules',
      '',
      '## Modules',
      '',
      '### M-01 — Notification service',
      '',
      '- **Responsibility:** Sends push/email alerts',
      '- **Depends on:**',
      '  - M-02',
      '  - M-03',
      '- **Folder:** src/notifications',
      '- **Owner:** platform-team',
      '',
      '### M-02 — Storage',
      '',
      '- **Responsibility:** Durable persistence',
      '',
    ].join('\n');

    const first = extractManagedDocument(spec, original);
    expect(first.blockers).toEqual([]);
    const m01 = first.sections.modules.objects.find((o) => o.entityKey === 'M-01')! as Extract<ContextObject, { kind: 'record' }>;
    expect(m01.fields).toEqual([
      { label: 'Responsibility', values: ['Sends push/email alerts'] },
      { label: 'Depends on', values: ['M-02', 'M-03'] },
      { label: 'Folder', values: ['src/notifications'] },
    ]);
    // "Owner" is not a declared field for Modules — preserved, not dropped.
    expect(m01.trailingMarkdown).toContain('Owner');
    expect(m01.trailingMarkdown).toContain('platform-team');

    const rendered = renderManagedDocument(spec, first.meta, objectsBySection(first));
    const second = extractManagedDocument(spec, rendered);
    expect(second.sections).toEqual(first.sections);
    expect(rendered).toContain('platform-team');
  });

  it('round-trips records whose fields cite ids by reference (USE_CASES.md, multi-line list fields)', () => {
    const spec = getFileSpec(DOC_USE_CASES)!;
    const original = [
      '# Use cases',
      '',
      '## Use cases',
      '',
      '### UC-01 — Add an errand',
      '',
      '- **Actor:** Parent',
      '- **Trigger:** Taps "add"',
      '- **Preconditions:**',
      '  - App is open',
      '- **Main flow:**',
      '  - Enter text',
      '  - Tap save',
      '- **Alternate flows:**',
      '- **Postconditions:**',
      '  - Item appears in list',
      '',
    ].join('\n');

    const first = extractManagedDocument(spec, original);
    expect(first.blockers).toEqual([]);
    const rendered = renderManagedDocument(spec, first.meta, objectsBySection(first));
    const second = extractManagedDocument(spec, rendered);
    expect(second.sections).toEqual(first.sections);
  });

  it('preserves preamble content and an undeclared ("unknown") section, round-tripping both', () => {
    const spec = getFileSpec(DOC_IDEA)!;
    const original = [
      '# Idea',
      '',
      '> Internal note: reviewed 2026-01-01.',
      '',
      '## Original sentence',
      '',
      'Seed sentence.',
      '',
      '## Notes for reviewers',
      '',
      'Please double-check the MVP scope before sign-off.',
      '',
      '## Problem',
      '',
      'The problem statement.',
      '',
      '## Users',
      '',
      '- **U-01** — Someone',
      '',
      '## Core value',
      '',
      'Value.',
      '',
      '## Minimum MVP',
      '',
      'MVP.',
      '',
    ].join('\n');

    const first = extractManagedDocument(spec, original);
    expect(first.blockers).toEqual([]);
    expect(first.meta.preambleMarkdown).toContain('Internal note: reviewed 2026-01-01.');
    expect(first.meta.unmanagedBlocks).toHaveLength(1);
    expect(first.meta.unmanagedBlocks[0]!.afterSectionKey).toBe('seed');
    expect(first.meta.unmanagedBlocks[0]!.markdown).toContain('Notes for reviewers');
    expect(first.meta.unmanagedBlocks[0]!.markdown).toContain('double-check the MVP scope');

    const rendered = renderManagedDocument(spec, first.meta, objectsBySection(first));
    expect(rendered).toContain('Internal note: reviewed 2026-01-01.');
    expect(rendered).toContain('## Notes for reviewers');
    expect(rendered).toContain('Please double-check the MVP scope before sign-off.');
    // The unmanaged section must still sit right after "Original sentence" and before "Problem".
    expect(rendered.indexOf('Original sentence')).toBeLessThan(rendered.indexOf('Notes for reviewers'));
    expect(rendered.indexOf('Notes for reviewers')).toBeLessThan(rendered.indexOf('## Problem'));

    const second = extractManagedDocument(spec, rendered);
    expect(second.sections).toEqual(first.sections);
    expect(second.meta).toEqual(first.meta);
  });

  it('preserves the actual file title even when it differs from the DocSpec default title', () => {
    const spec = getFileSpec(DOC_IDEA)!;
    const original = ['# My Custom Product Idea', '', '## Original sentence', '', 'Seed.', ''].join('\n');
    const first = extractManagedDocument(spec, original);
    expect(first.meta.title).toBe('My Custom Product Idea');
    const rendered = renderManagedDocument(spec, first.meta, objectsBySection(first));
    expect(rendered.split('\n')[0]).toBe('# My Custom Product Idea');
  });

  it('flags unrecognized content inside a declared section as a blocker, not silent data loss', () => {
    const spec = getFileSpec(DOC_IDEA)!;
    const withStray = ['# Idea', '', '## Users', '', 'Just some prose someone typed here instead of a bullet.', ''].join('\n');
    const extracted = extractManagedDocument(spec, withStray);
    expect(extracted.blockers.length).toBeGreaterThan(0);
    expect(extracted.blockers[0]).toContain('Users');
  });
});

describe('ContextMarkdownBridge — bootstrap of a missing file', () => {
  it('extracting empty content produces empty objects for every declared section, never throws', () => {
    const spec = getFileSpec(DOC_IDEA)!;
    const extracted = extractManagedDocument(spec, '');
    expect(extracted.blockers).toEqual([]);
    expect(extracted.sections.users.objects).toEqual([]);
    expect(extracted.sections.problem.objects).toEqual([{ schemaVersion: 1, kind: 'prose', entityKey: 'SEC:product/IDEA.md#problem', documentPath: 'product/IDEA.md', sectionKey: 'problem', markdown: '' }]);
  });

  it('rendering an entirely empty structured document produces the full skeleton with every declared section heading', () => {
    const spec = getFileSpec(DOC_IDEA)!;
    const empty = extractManagedDocument(spec, '');
    const rendered = renderManagedDocument(spec, empty.meta, objectsBySection(empty));
    for (const section of spec.sections) expect(rendered).toContain(`## ${section.heading}`);
  });
});
