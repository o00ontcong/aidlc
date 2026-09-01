import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IdeaService, IdeaStateError, buildIdeaTranslationSnapshot, type IdeaTranslation } from '../src';

function temporary(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-translation-')); }

const USER = { kind: 'user' as const, id: 'owner' };
const NOW = '2026-08-01T00:00:00.000Z';

describe('buildIdeaTranslationSnapshot', () => {
  it('returns null for a brand-new idea with no content yet', () => {
    const ideas = new IdeaService(temporary());
    const idea = ideas.create({ seedSentence: 'x' });
    expect(buildIdeaTranslationSnapshot(idea, 'vi')).toBeNull();
  });

  it('includes only the fields that currently have content, with ids kept for findings/sources/existingSolutions', () => {
    const ideas = new IdeaService(temporary());
    let idea = ideas.create({ seedSentence: 'x' });
    idea = ideas.updateUnderstand(idea.id, idea.ideaRevision, {
      problem: 'No alert when temperature spikes.',
      assumptions: ['Users check the app manually today.'],
    }, USER);
    idea = ideas.updateResearch(idea.id, idea.ideaRevision, {
      findings: [{ id: 'f1', text: 'No push API exists today.', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW }],
    }, USER);

    const snapshot = buildIdeaTranslationSnapshot(idea, 'vi');
    expect(snapshot).toEqual({
      language: 'vi',
      understand: { problem: idea.understand.problem, assumptions: idea.understand.assumptions },
      research: { findings: [{ id: 'f1', text: 'No push API exists today.' }] },
    });
    // context/users/unknowns are still empty — must not appear at all.
    expect(snapshot!.understand).not.toHaveProperty('context');
    expect(snapshot!.understand).not.toHaveProperty('users');
  });
});

describe('IdeaService.applyTranslation', () => {
  function seedUnderstand(ideas: IdeaService, id: string, revision: number) {
    return ideas.updateUnderstand(id, revision, {
      problem: 'No alert when temperature spikes.',
      context: 'Weather app used by field workers.',
      users: ['Field worker checking conditions before a shift'],
      assumptions: ['Users check the app manually today.', 'Push permission is usually granted.'],
      unknowns: ['Whether iOS restricts background checks.'],
    }, USER);
  }

  it('replaces perBullet-style arrays in place — translating must not duplicate the originals alongside the translation', () => {
    const ideas = new IdeaService(temporary());
    let idea = ideas.create({ seedSentence: 'x' });
    idea = seedUnderstand(ideas, idea.id, idea.ideaRevision);

    const translation: IdeaTranslation = {
      language: 'vi',
      understand: {
        problem: 'Không có cảnh báo khi nhiệt độ tăng vọt.',
        assumptions: ['Người dùng tự kiểm tra app hôm nay.', 'Quyền push thường được cấp.'],
      },
    };
    const translated = ideas.applyTranslation(idea.id, translation, USER);

    expect(translated.understand.problem).toBe('Không có cảnh báo khi nhiệt độ tăng vọt.');
    // Exactly the translated pair — no leftover English duplicate alongside it.
    expect(translated.understand.assumptions).toEqual(['Người dùng tự kiểm tra app hôm nay.', 'Quyền push thường được cấp.']);
    // Untouched fields survive as-is.
    expect(translated.understand.context).toBe(idea.understand.context);
    expect(translated.understand.unknowns).toEqual(idea.understand.unknowns);
  });

  it('matches findings/sources/existingSolutions by id, translating only their text and leaving type/sourceIds/createdBy/createdAt untouched', () => {
    const ideas = new IdeaService(temporary());
    let idea = ideas.create({ seedSentence: 'x' });
    idea = ideas.updateUnderstand(idea.id, idea.ideaRevision, { problem: 'p', context: 'c', users: ['a user'] }, USER);
    idea = ideas.advanceStage(idea.id, idea.ideaRevision, USER);
    idea = ideas.updateResearch(idea.id, idea.ideaRevision, {
      findings: [
        { id: 'f1', text: 'No push API exists today.', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW },
        { id: 'f2', text: 'Users say they check manually.', type: 'assumption', sourceIds: [], createdBy: 'user', createdAt: NOW },
      ],
    }, USER);

    const translated = ideas.applyTranslation(idea.id, {
      language: 'vi',
      research: { findings: [{ id: 'f1', text: 'Chưa có push API nào tồn tại.' }] },
    }, USER);

    const f1 = translated.research.findings.find((f) => f.id === 'f1')!;
    const f2 = translated.research.findings.find((f) => f.id === 'f2')!;
    expect(f1.text).toBe('Chưa có push API nào tồn tại.');
    expect(f1.type).toBe('inference');
    expect(f1.createdAt).toBe(NOW);
    expect(f2.text).toBe('Users say they check manually.'); // untouched — not part of the translation
  });

  it('throws and applies nothing when a translated array\'s length no longer matches the current one', () => {
    const ideas = new IdeaService(temporary());
    let idea = ideas.create({ seedSentence: 'x' });
    idea = seedUnderstand(ideas, idea.id, idea.ideaRevision);
    const revisionBefore = idea.ideaRevision;

    expect(() => ideas.applyTranslation(idea.id, {
      language: 'vi',
      understand: { assumptions: ['only one translated item'] }, // current has 2
    }, USER)).toThrow(IdeaStateError);

    const reloaded = ideas.require(idea.id);
    expect(reloaded.ideaRevision).toBe(revisionBefore);
    expect(reloaded.understand.assumptions).toEqual(idea.understand.assumptions);
  });

  it('throws when a translated item references an id that no longer exists', () => {
    const ideas = new IdeaService(temporary());
    let idea = ideas.create({ seedSentence: 'x' });
    idea = ideas.updateUnderstand(idea.id, idea.ideaRevision, { problem: 'p', context: 'c', users: ['a user'] }, USER);
    idea = ideas.advanceStage(idea.id, idea.ideaRevision, USER);
    idea = ideas.updateResearch(idea.id, idea.ideaRevision, {
      findings: [{ id: 'f1', text: 'A finding.', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW }],
    }, USER);

    expect(() => ideas.applyTranslation(idea.id, {
      language: 'vi',
      research: { findings: [{ id: 'does-not-exist', text: 'x' }] },
    }, USER)).toThrow(IdeaStateError);
  });

  it('does not set needsReview — a translation is not new information for a later stage to re-check against', () => {
    const ideas = new IdeaService(temporary());
    let idea = ideas.create({ seedSentence: 'x' });
    idea = seedUnderstand(ideas, idea.id, idea.ideaRevision);
    idea = ideas.advanceStage(idea.id, idea.ideaRevision, USER); // now on "research" — understand is behind
    expect(idea.needsReview).toBeUndefined();

    const translated = ideas.applyTranslation(idea.id, {
      language: 'vi',
      understand: { problem: 'Đã dịch.' },
    }, USER);
    expect(translated.needsReview).toBeUndefined();
  });
});
