import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  IDEA_AGENT_COMMAND_NAME,
  IDEA_PIPELINE_COMMAND_NAME,
  IDEA_TRANSLATE_COMMAND_NAME,
  IdeaService,
  ideaAgentCommandBody,
  ideaPipelineCommandBody,
  ideaTranslateCommandBody,
  naturalHeadingsForStage,
  parseAgentProposal,
  syncIdeaAgentCommandForProvider,
  syncIdeaPipelineCommandForProvider,
  syncIdeaTranslateCommandForProvider,
} from '../src';

function temporary(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-agent-command-')); }

describe('ideaAgentCommandBody', () => {
  const body = ideaAgentCommandBody();

  it('lists exactly the headings the natural-notes parser recognizes for Understand/Research/Decide', () => {
    for (const stage of ['understand', 'research', 'decide'] as const) {
      for (const heading of naturalHeadingsForStage(stage)) {
        expect(body).toContain(`## ${heading.label}`);
      }
    }
  });

  it('explains $ARGUMENTS and the Explore option-per-heading convention', () => {
    expect(body).toMatch(/\$ARGUMENTS.*<IDEA_ID> <STAGE>/s);
    expect(body).toMatch(/Pros:.*Cons:.*Risks:.*Tradeoffs:/s);
  });

  it('tells the agent to signal completion via "Read from file", never to mark a stage/idea done itself', () => {
    expect(body).toMatch(/Read from file/);
    expect(body).toMatch(/never write anything that marks this idea Ready/i);
  });
});

describe('syncIdeaAgentCommandForProvider', () => {
  it('writes the Claude command file without needing a workspace.yaml', () => {
    const root = temporary();
    expect(fs.existsSync(path.join(root, '.aidlc'))).toBe(false); // no workspace set up at all
    const written = syncIdeaAgentCommandForProvider(root, 'claude');
    expect(written).toHaveLength(1);
    const file = path.join(root, '.claude', 'commands', `${IDEA_AGENT_COMMAND_NAME}.md`);
    expect(written[0]).toBe(file);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('---'); // frontmatter present
    expect(content).toContain('Idea Research Agent');
  });

  it('writes the right file for each of the 4 providers', () => {
    const root = temporary();
    for (const providerId of ['claude', 'cursor', 'codex', 'opencode']) {
      syncIdeaAgentCommandForProvider(root, providerId);
    }
    expect(fs.existsSync(path.join(root, '.claude', 'commands', `${IDEA_AGENT_COMMAND_NAME}.md`))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cursor', 'commands', `${IDEA_AGENT_COMMAND_NAME}.md`))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cursor', 'skills', IDEA_AGENT_COMMAND_NAME, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.codex', 'skills', `aidlc-${IDEA_AGENT_COMMAND_NAME}`, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.opencode', 'commands', `${IDEA_AGENT_COMMAND_NAME}.md`))).toBe(true);
  });

  it('does not overwrite an existing file unless asked', () => {
    const root = temporary();
    syncIdeaAgentCommandForProvider(root, 'claude');
    const file = path.join(root, '.claude', 'commands', `${IDEA_AGENT_COMMAND_NAME}.md`);
    fs.writeFileSync(file, 'hand-edited', 'utf8');
    const written = syncIdeaAgentCommandForProvider(root, 'claude');
    expect(written).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe('hand-edited');
    const forced = syncIdeaAgentCommandForProvider(root, 'claude', true);
    expect(forced).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).not.toBe('hand-edited');
  });
});

describe('ideaPipelineCommandBody', () => {
  const body = ideaPipelineCommandBody();

  it('lists exactly the headings the natural-notes parser recognizes for Understand/Research/Decide', () => {
    for (const stage of ['understand', 'research', 'decide'] as const) {
      for (const heading of naturalHeadingsForStage(stage)) {
        expect(body).toContain(`## ${heading.label}`);
      }
    }
  });

  it('takes only <IDEA_ID> — no <STAGE> argument, it is auto-detected', () => {
    expect(body).toMatch(/\$ARGUMENTS.*<IDEA_ID>/s);
    expect(body).not.toMatch(/\$ARGUMENTS.*<STAGE>/s);
  });

  it('tells the agent to trust RESEARCH.md\'s Stage line over its own memory', () => {
    expect(body).toMatch(/\*\*Stage:\*\*/);
    expect(body).toMatch(/trust it over anything you\s+remember/);
  });

  it('never lets the agent mark the idea Ready or loop unattended', () => {
    expect(body).toMatch(/never write anything that marks this idea Ready/i);
    expect(body).toMatch(/Do not\s+sleep or poll/i);
    expect(body).toMatch(/Never attempt the next stage in this same turn/i);
  });
});

describe('syncIdeaPipelineCommandForProvider', () => {
  it('writes the Claude command file without needing a workspace.yaml', () => {
    const root = temporary();
    expect(fs.existsSync(path.join(root, '.aidlc'))).toBe(false);
    const written = syncIdeaPipelineCommandForProvider(root, 'claude');
    expect(written).toHaveLength(1);
    const file = path.join(root, '.claude', 'commands', `${IDEA_PIPELINE_COMMAND_NAME}.md`);
    expect(written[0]).toBe(file);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('---'); // frontmatter present
    expect(content).toContain('Idea Research Agent — Pipeline');
  });

  it('does not overwrite an existing file unless asked', () => {
    const root = temporary();
    syncIdeaPipelineCommandForProvider(root, 'claude');
    const file = path.join(root, '.claude', 'commands', `${IDEA_PIPELINE_COMMAND_NAME}.md`);
    fs.writeFileSync(file, 'hand-edited', 'utf8');
    const written = syncIdeaPipelineCommandForProvider(root, 'claude');
    expect(written).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe('hand-edited');
    const forced = syncIdeaPipelineCommandForProvider(root, 'claude', true);
    expect(forced).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).not.toBe('hand-edited');
  });
});

describe('ideaTranslateCommandBody', () => {
  const body = ideaTranslateCommandBody();

  it('takes only <IDEA_ID> — the target language comes from the input file, not $ARGUMENTS', () => {
    expect(body).toMatch(/\$ARGUMENTS.*<IDEA_ID>/s);
    expect(body).not.toMatch(/\$ARGUMENTS.*<LANGUAGE>/s);
  });

  it('reads translation-input.json and writes translation.json — tells the agent to leave RESEARCH.md/INTENT.md/notes files alone', () => {
    expect(body).toMatch(/translation-input\.json/);
    expect(body).toMatch(/translation\.json/);
    expect(body).toMatch(/do not write to.*RESEARCH\.md.*INTENT\.md.*NOTES\.md/is);
  });

  it('tells the agent to preserve ids and array length/order exactly', () => {
    expect(body).toMatch(/Copy every `id` field byte-for-byte unchanged/);
    expect(body).toMatch(/exact same length, in the exact same order/);
  });
});

describe('syncIdeaTranslateCommandForProvider', () => {
  it('writes the Claude command file without needing a workspace.yaml', () => {
    const root = temporary();
    expect(fs.existsSync(path.join(root, '.aidlc'))).toBe(false);
    const written = syncIdeaTranslateCommandForProvider(root, 'claude');
    expect(written).toHaveLength(1);
    const file = path.join(root, '.claude', 'commands', `${IDEA_TRANSLATE_COMMAND_NAME}.md`);
    expect(written[0]).toBe(file);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('---'); // frontmatter present
    expect(content).toContain('Idea Translate Agent');
  });

  it('does not overwrite an existing file unless asked', () => {
    const root = temporary();
    syncIdeaTranslateCommandForProvider(root, 'claude');
    const file = path.join(root, '.claude', 'commands', `${IDEA_TRANSLATE_COMMAND_NAME}.md`);
    fs.writeFileSync(file, 'hand-edited', 'utf8');
    const written = syncIdeaTranslateCommandForProvider(root, 'claude');
    expect(written).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe('hand-edited');
    const forced = syncIdeaTranslateCommandForProvider(root, 'claude', true);
    expect(forced).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).not.toBe('hand-edited');
  });
});

describe('IdeaAgentCommand output round-trips through parseAgentProposal', () => {
  it('a notes file following the command\'s own heading convention parses cleanly for Understand', () => {
    const ideas = new IdeaService(temporary());
    const idea = ideas.create({ seedSentence: 'x' });
    const notes = `# IDEA-001 — UNDERSTAND stage notes

## Problem

Users cannot find the export button.

## Context

A dashboard used by non-technical analysts.

## Users / use cases

- An analyst exporting a weekly report.

## Assumptions

- Assumes export always targets CSV today.

## Unknowns

- Whether PDF export is also expected.
`;
    const { actions, unparsed } = parseAgentProposal(notes, 'understand', idea);
    expect(unparsed).toEqual([]);
    expect(actions.map((a) => a.type).sort()).toEqual(['add_assumption', 'add_unknown', 'add_user', 'set_context', 'set_problem']);
  });
});
