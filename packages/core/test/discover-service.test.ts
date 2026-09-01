import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscoverRevisionConflictError,
  DiscoverService,
  DOC_FEATURES,
  DOC_IDEA,
  DOC_REQUIREMENTS,
  DOC_TECH_STACK,
  type ActorRef,
} from '../src';

const USER: ActorRef = { kind: 'user', id: 'test' };
const AGENT: ActorRef = { kind: 'agent', id: 'discover-agent' };

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-discover-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }); }
});

function seeded(): DiscoverService {
  const service = new DiscoverService(newRoot());
  service.init({ seedSentence: 'App xem video hỗ trợ 2 subtitle cùng lúc.', actor: USER });
  return service;
}

function fillIdea(service: DiscoverService): void {
  service.applyOps(DOC_IDEA, [
    { op: 'setProse', section: 'problem', value: 'Người học ngoại ngữ không so được hai bản dịch cùng lúc.' },
    { op: 'addItem', section: 'users', text: 'Người học ngoại ngữ qua phim.' },
    { op: 'setProse', section: 'value', value: 'Hai subtitle song song, không phải tua đi tua lại.' },
    { op: 'setProse', section: 'mvp', value: 'Mở video local + nạp 2 file .srt.' },
  ], { actor: USER });
}

describe('DiscoverService — blueprint lifecycle', () => {
  it('writes the seed sentence into the doc, not into the sidecar only', () => {
    const service = seeded();
    const index = service.require();
    expect(index.currentStep).toBe('idea');
    expect(index.docsRoot).toBe('docs');

    const idea = fs.readFileSync(service.docFile(DOC_IDEA), 'utf8');
    expect(idea).toContain('## Original sentence\n\nApp xem video hỗ trợ 2 subtitle cùng lúc.');
    expect(idea).toContain('## Minimum MVP');
  });

  it('is idempotent — a second init keeps the first blueprint', () => {
    const service = seeded();
    const first = service.require();
    service.init({ seedSentence: 'khác hẳn', actor: USER });
    expect(service.require().seedSentence).toBe(first.seedSentence);
  });

  it('gates advancing on the step Definition of Done', () => {
    const service = seeded();
    expect(service.stepStatus('idea').canAdvance).toBe(false);
    expect(service.stepStatus('idea').requirements.filter((r) => !r.passed).map((r) => r.id))
      .toEqual(['problem', 'users', 'value', 'mvp']);

    fillIdea(service);
    expect(service.stepStatus('idea').canAdvance).toBe(true);
    expect(service.stepStatus('idea').completion).toBe(1);
    expect(service.advanceStep().currentStep).toBe('product');
  });

  it('rejects a write made against a stale revision', () => {
    const service = seeded();
    const stale = service.require().revision - 1;
    expect(() => service.applyOps(DOC_IDEA, [{ op: 'setProse', section: 'problem', value: 'x' }], {
      actor: USER,
      expectedRevision: stale,
    })).toThrow(DiscoverRevisionConflictError);
  });

  it('tracks who authored each item and honours a pin', () => {
    const service = seeded();
    service.applyOps(DOC_REQUIREMENTS, [{ op: 'addItem', section: 'functional', text: 'Mở video local.' }], { actor: USER });
    service.applyOps(DOC_REQUIREMENTS, [{ op: 'addItem', section: 'functional', text: 'Nạp subtitle #1.' }], { actor: AGENT });

    const index = service.setItemFlags(DOC_REQUIREMENTS, 'FR-01', { pinned: true });
    expect(index.items[`${DOC_REQUIREMENTS}#FR-01`]).toMatchObject({ origin: 'human', pinned: true });
    expect(index.items[`${DOC_REQUIREMENTS}#FR-02`]).toMatchObject({ origin: 'ai', pinned: false });
  });

  it('picks up an edit made outside the app', () => {
    const service = seeded();
    fs.writeFileSync(
      service.docFile(DOC_REQUIREMENTS),
      '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Viết tay trong editor.\n',
      'utf8',
    );
    const index = service.reindexAll(USER);
    expect(index.items[`${DOC_REQUIREMENTS}#FR-01`]?.origin).toBe('human');
    expect(service.readDoc(DOC_REQUIREMENTS).sections[0]!.items[0]!.text).toBe('Viết tay trong editor.');
  });
});

describe('DiscoverService — validation and traceability', () => {
  it('fails the coverage rule until every requirement is picked up by a feature', () => {
    const service = seeded();
    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'addItem', section: 'functional', text: 'Mở video local.' },
      { op: 'addItem', section: 'functional', text: 'Nạp subtitle #1.' },
      { op: 'addItem', section: 'functional', text: 'Hiển thị 2 subtitle.' },
      { op: 'addItem', section: 'nonFunctional', group: 'perf', text: 'Seek dưới 200ms.' },
    ], { actor: USER });
    expect(service.stepStatus('requirements').canAdvance).toBe(true);

    service.applyOps(DOC_FEATURES, [
      { op: 'addItem', section: 'features', group: 'video', text: 'Mở và phát video — FR-01.' },
    ], { actor: USER });
    const partial = service.stepStatus('features').requirements.find((r) => r.id === 'coversFr')!;
    expect(partial.passed).toBe(false);
    expect(partial.detail).toBe('not covered: FR-02, FR-03');

    service.applyOps(DOC_FEATURES, [
      { op: 'addItem', section: 'features', group: 'sub', text: 'Nạp và hiển thị subtitle — FR-02, FR-03.' },
    ], { actor: USER });
    expect(service.stepStatus('features').canAdvance).toBe(true);
  });

  it('does not count a coverage rule that has nothing to cover yet', () => {
    const service = seeded();
    const status = service.stepStatus('structure');
    const coverage = status.requirements.find((r) => r.id === 'mapsModules')!;
    expect(coverage.notApplicable).toBe(true);
    // Only the folder tree is actually outstanding, so an untouched step reads 0%.
    expect(status.completion).toBe(0);
    expect(status.canAdvance).toBe(false);
  });

  it('reports a citation of an id no document declares', () => {
    const service = seeded();
    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'addItem', section: 'functional', text: 'Mở video local.' },
    ], { actor: USER });
    service.applyOps(DOC_FEATURES, [
      { op: 'addItem', section: 'features', group: 'video', text: 'Phát video — FR-01, FR-42.' },
    ], { actor: USER });

    const dangling = service.validate().filter((i) => i.code === 'dangling-ref');
    expect(dangling).toHaveLength(1);
    expect(dangling[0]!.message).toContain('FR-42');
  });

  it('flags a line that is not in the item format as untracked', () => {
    const service = seeded();
    fs.writeFileSync(
      service.docFile(DOC_REQUIREMENTS),
      '# Requirements\n\n## Functional requirements\n\n- User có thể mở video (thiếu id)\n',
      'utf8',
    );
    expect(service.validate().some((i) => i.code === 'unparsed-line')).toBe(true);
  });

  it('counts ADR files for the tech-decisions Definition of Done', () => {
    const service = seeded();
    service.applyOps(DOC_TECH_STACK, [
      { op: 'addRecord', section: 'stack', title: 'Language', fields: [{ label: 'Choice', value: 'Swift' }, { label: 'Why', value: 'Nền tảng iOS.' }] },
      { op: 'addRecord', section: 'stack', title: 'UI', fields: [{ label: 'Choice', value: 'SwiftUI' }, { label: 'Why', value: 'Ít boilerplate.' }] },
      { op: 'addRecord', section: 'stack', title: 'Video', fields: [{ label: 'Choice', value: 'AVPlayer' }, { label: 'Why', value: 'Có sẵn trong SDK.' }] },
    ], { actor: USER });
    expect(service.stepStatus('techdecisions').requirements.find((r) => r.id === 'adr')!.passed).toBe(false);

    const adrDir = path.join(service.docsRoot(), 'architecture', 'ADR');
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(path.join(adrDir, 'ADR-001-swiftui.md'), '# ADR-001\n', 'utf8');
    expect(service.stepStatus('techdecisions').canAdvance).toBe(true);
  });
});

describe('DiscoverService — agent runs', () => {
  it('chooses fill for an empty step and refine once it has content', () => {
    const service = seeded();
    expect(service.startRun('requirements').run.mode).toBe('fill');
    service.applyOps(DOC_REQUIREMENTS, [{ op: 'addItem', section: 'functional', text: 'Mở video local.' }], { actor: USER });
    expect(service.startRun('requirements').run.mode).toBe('refine');
  });

  it('diffs what the agent wrote against the snapshot and flags guardrail breaches', () => {
    const service = seeded();
    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'addItem', section: 'functional', text: 'Mở video local.' },
      { op: 'addItem', section: 'functional', text: 'Nạp subtitle #1.' },
    ], { actor: USER });
    fs.appendFileSync(service.docFile(DOC_REQUIREMENTS), '\n## Ghi chú của bạn\n\nƯu tiên iOS.\n', 'utf8');
    service.reindexAll(USER);
    service.setItemFlags(DOC_REQUIREMENTS, 'FR-01', { pinned: true });

    const { run } = service.startRun('requirements');

    // Stand in for the agent: rewrite a pinned item, drop a human one, add a
    // new one, delete the user's own section, and touch an out-of-step doc.
    fs.writeFileSync(
      service.docFile(DOC_REQUIREMENTS),
      `# Requirements

## Functional requirements

- **FR-01** — Mở video local từ Files.
- **FR-03** — Hiển thị hai subtitle cùng lúc.
`,
      'utf8',
    );
    fs.writeFileSync(
      service.docFile(DOC_FEATURES),
      '# Features\n\n## Features\n\n- **F-VIDEO-01** — Phát video — FR-01.\n',
      'utf8',
    );

    const finished = service.finishRun(run.id);
    expect(finished.diff.added).toEqual([`${DOC_REQUIREMENTS}#FR-03`, `${DOC_FEATURES}#F-VIDEO-01`]);
    expect(finished.diff.updated).toEqual([`${DOC_REQUIREMENTS}#FR-01`]);
    expect(finished.diff.removed).toEqual([`${DOC_REQUIREMENTS}#FR-02`]);

    const codes = finished.guardrail.map((g) => g.code).sort();
    expect(codes).toEqual([
      'free-block-removed',   // the user's own '## Ghi chú của bạn' section
      'human-removed',        // FR-02 was written by the user
      'out-of-scope',         // FEATURES.md is not part of the requirements step
      'pinned-modified',      // FR-01 was pinned
      'section-removed',      // '## Non-functional requirements' is gone
    ]);
    expect(finished.run.guardrail.some((g) => g.startsWith('pinned-modified'))).toBe(true);
  });

  it('reverts a run back to the snapshot, docs and sidecar alike', () => {
    const service = seeded();
    service.applyOps(DOC_REQUIREMENTS, [{ op: 'addItem', section: 'functional', text: 'Mở video local.' }], { actor: USER });
    const original = fs.readFileSync(service.docFile(DOC_REQUIREMENTS), 'utf8');

    const { run } = service.startRun('requirements');
    fs.writeFileSync(
      service.docFile(DOC_REQUIREMENTS),
      '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Bị agent viết lại.\n- **FR-02** — Thêm mới.\n',
      'utf8',
    );
    service.finishRun(run.id);
    expect(service.readDoc(DOC_REQUIREMENTS).sections[0]!.items).toHaveLength(2);

    const index = service.revertRun(run.id);
    expect(fs.readFileSync(service.docFile(DOC_REQUIREMENTS), 'utf8')).toBe(original);
    expect(index.items[`${DOC_REQUIREMENTS}#FR-02`]).toBeUndefined();
    expect(index.runs.find((r) => r.id === run.id)!.revertable).toBe(false);
  });

  it('removes a doc the run created when reverting', () => {
    const service = seeded();
    const { run } = service.startRun('features');
    fs.writeFileSync(
      service.docFile(DOC_FEATURES),
      '# Features\n\n## Features\n\n- **F-VIDEO-01** — Phát video.\n',
      'utf8',
    );
    service.finishRun(run.id);
    expect(fs.existsSync(service.docFile(DOC_FEATURES))).toBe(true);

    service.revertRun(run.id);
    expect(fs.existsSync(service.docFile(DOC_FEATURES))).toBe(false);
  });
});
