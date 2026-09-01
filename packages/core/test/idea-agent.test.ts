import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  IdeaService,
  buildStagePrompt,
  parseAgentProposal,
  type Idea,
} from '../src';

function temporary(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-agent-')); }
const USER = { kind: 'user' as const, id: 'owner' };

function ideaAt(understand: Partial<Idea['understand']> = {}): Idea {
  const ideas = new IdeaService(temporary());
  const created = ideas.create({ seedSentence: 'Users cannot find the export button.' });
  return { ...created, understand: { ...created.understand, ...understand } };
}

describe('buildStagePrompt', () => {
  it('names the current stage, lists allowed actions, and lists missing requirements', () => {
    const idea = ideaAt();
    const prompt = buildStagePrompt(idea, 'understand');
    expect(prompt).toContain('CURRENT STAGE: UNDERSTAND');
    expect(prompt).toContain('set_problem');
    expect(prompt).toContain('Problem');
  });

  it('respects the Idea output language', () => {
    const idea = { ...ideaAt(), outputLanguage: 'vi' as const };
    const prompt = buildStagePrompt(idea, 'understand');
    expect(prompt).toContain('CURRENT STAGE: UNDERSTAND');
    expect(prompt).toMatch(/Idea Research Agent/);
    expect(prompt).toContain('Hiểu đúng vấn đề thật');
  });

  it('includes an explicit userMessage when given', () => {
    const idea = ideaAt();
    const prompt = buildStagePrompt(idea, 'understand', 'The user insists this must work offline.');
    expect(prompt).toContain('The user insists this must work offline.');
  });

  it('never lists an action outside the current stage\'s allowed set', () => {
    const idea = ideaAt();
    const prompt = buildStagePrompt(idea, 'understand');
    expect(prompt).not.toContain('propose_decision');
    expect(prompt).not.toContain('add_option');
  });
});

describe('parseAgentProposal', () => {
  it('parses a well-formed proposal into typed actions', () => {
    const idea = ideaAt();
    const md = [
      '### set_problem',
      'Users cannot find the export button because it is hidden behind a menu.',
      '',
      '### add_assumption',
      'Users expect export to be a single click.',
      '',
      '### ask_user',
      'Should export support CSV as well as PDF?',
    ].join('\n');
    const { actions, unparsed } = parseAgentProposal(md, 'understand', idea);
    expect(unparsed).toEqual([]);
    expect(actions.map((a) => a.type)).toEqual(['set_problem', 'add_assumption', 'ask_user']);
  });

  it('surfaces an unknown or wrong-stage action instead of crashing', () => {
    const idea = ideaAt();
    const md = '### propose_decision: go\nShip it.';
    const { actions, unparsed } = parseAgentProposal(md, 'understand', idea);
    expect(actions).toEqual([]);
    expect(unparsed[0]).toMatch(/not an allowed action/);
  });

  it('reports an empty paste instead of silently doing nothing', () => {
    const idea = ideaAt();
    const { actions, unparsed } = parseAgentProposal('Just some prose, no headings.', 'understand', idea);
    expect(actions).toEqual([]);
    expect(unparsed[0]).toMatch(/No "### action_type" block/);
  });

  it('dedupes a finding that already exists', () => {
    const ideas = new IdeaService(temporary());
    const created = ideas.create({ seedSentence: 'x' });
    const withFinding = ideas.updateResearch(created.id, created.ideaRevision, {
      findings: [{ id: 'f1', text: 'Users check manually today.', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: '2026-08-01T00:00:00.000Z' }],
    }, USER);
    const md = '### add_finding: inference\nUsers check manually today.';
    const { actions, unparsed } = parseAgentProposal(md, 'research', withFinding);
    expect(actions).toEqual([]);
    expect(unparsed[0]).toMatch(/already exists/);
  });

  it('parses add_option with Pros/Cons sub-lists', () => {
    const idea = ideaAt();
    const md = [
      '### add_option: Local on-device model',
      'Runs speech-to-text entirely on-device.',
      '',
      'Pros:',
      '- Works offline',
      '- No data leaves the device',
      '',
      'Cons:',
      '- Larger app size',
    ].join('\n');
    const { actions } = parseAgentProposal(md, 'explore', idea);
    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action.type).toBe('add_option');
    if (action.type === 'add_option') {
      expect(action.title).toBe('Local on-device model');
      expect(action.pros).toEqual(['Works offline', 'No data leaves the device']);
      expect(action.cons).toEqual(['Larger app size']);
    }
  });
});

describe('IdeaService.importAgentProposal', () => {
  it('applies low-impact actions immediately and logs one event', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const md = ['### add_assumption', 'Generating subtitles reduces user effort.'].join('\n');
    const { idea, unparsed } = ideas.importAgentProposal(created.id, created.ideaRevision, 'understand', md, USER);
    expect(unparsed).toEqual([]);
    expect(idea.understand.assumptions).toEqual(['Generating subtitles reduces user effort.']);
    const events = ideas.store.readEvents(created.id);
    expect(events.some((e) => e.type === 'ai_proposal_imported')).toBe(true);
  });

  it('queues high-impact actions for approval instead of applying them', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const md = ['### set_problem', 'Users cannot find the export button.'].join('\n');
    const { idea } = ideas.importAgentProposal(created.id, created.ideaRevision, 'understand', md, USER);
    expect(idea.understand.problem).toBe(''); // not applied yet
    expect(idea.pendingActions).toHaveLength(1);
    expect(idea.pendingActions[0]!.actionType).toBe('set_problem');
  });

  it('never applies mark_ready — accepting it only clears the suggestion', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    // Force the idea onto "decide" to make mark_ready a legally-allowed action for this stage.
    const atDecide: Idea = { ...ideas.require(created.id), stage: 'decide' };
    fs.writeFileSync(path.join(root, '.aidlc', 'ideas', created.id, 'state.json'), `${JSON.stringify(atDecide, null, 2)}\n`);

    const md = '### mark_ready\nThis looks ready.';
    const { idea } = ideas.importAgentProposal(created.id, atDecide.ideaRevision, 'decide', md, USER);
    expect(idea.pendingActions).toHaveLength(1);
    expect(idea.stage).toBe('decide'); // untouched

    const resolved = ideas.resolvePendingAction(created.id, idea.ideaRevision, idea.pendingActions[0]!.id, 'accept', USER);
    expect(resolved.stage).toBe('decide'); // still untouched — only markReady() can do this
    expect(resolved.pendingActions).toEqual([]);
  });

  it('resolvePendingAction(accept) applies a high-impact field change', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const md = ['### set_problem', 'Users cannot find the export button.'].join('\n');
    const { idea } = ideas.importAgentProposal(created.id, created.ideaRevision, 'understand', md, USER);
    const accepted = ideas.resolvePendingAction(created.id, idea.ideaRevision, idea.pendingActions[0]!.id, 'accept', USER);
    expect(accepted.understand.problem).toBe('Users cannot find the export button.');
    expect(accepted.pendingActions).toEqual([]);
  });

  it('resolvePendingAction(reject) discards the suggestion without applying it', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const md = ['### set_problem', 'Users cannot find the export button.'].join('\n');
    const { idea } = ideas.importAgentProposal(created.id, created.ideaRevision, 'understand', md, USER);
    const rejected = ideas.resolvePendingAction(created.id, idea.ideaRevision, idea.pendingActions[0]!.id, 'reject', USER);
    expect(rejected.understand.problem).toBe('');
    expect(rejected.pendingActions).toEqual([]);
  });
});
