import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IdeaService, providerManagedIdeaCommandBody } from '@aidlc/core';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-prep-')); }

const AGENT = { kind: 'agent' as const, id: 'provider-native-idea-session' };

describe('provider-managed Idea preparation', () => {
  it('uses the native provider conversation and durable state, never terminal stdout', () => {
    const command = providerManagedIdeaCommandBody();
    expect(command).toContain('provider-native UI');
    expect(command).toContain('watches those files and does not consume terminal output');
    expect(command).toMatch(/persist selected option ids and\s+the batch submission/);
    expect(command).not.toContain('"humanAnswers"');
    expect(command).not.toContain('machine handoff object');
  });

  it('persists each native answer before continuing to the Intent checkpoint', () => {
    const workspaceRoot = root();
    const ideas = new IdeaService(workspaceRoot);
    const created = ideas.create({ seedSentence: 'Warn me when it gets dangerously hot.' });
    const preparing = ideas.startPrep(created.id, created.ideaRevision, 'visible-session', AGENT);
    let awaiting = ideas.completePrep(preparing.id, preparing.ideaRevision, {
      selfAnswered: [{
        question: 'Does the project already model a heat alert?',
        answer: 'No existing alert field was found.',
        source: 'Sources/SkyCast/Domain/WeatherSnapshot.swift',
        flagged: false,
      }],
      questions: [{
        id: 'delivery',
        text: 'How should the warning reach the person?',
        reason: 'This changes the product behavior and acceptance criteria.',
        highImpact: true,
        dependsOn: [],
        options: [
          { id: 'banner', label: 'Show an in-app banner', recommended: true },
          { id: 'notification', label: 'Send a notification', recommended: false },
        ],
      }],
    }, AGENT);

    expect(awaiting.checkpoint).toBe('awaiting_human');
    awaiting = ideas.saveAnswer(
      awaiting.id,
      awaiting.ideaRevision,
      'delivery',
      'banner',
      { kind: 'user', id: 'provider-native-user' },
    );
    const drafted = ideas.submitBatch(
      awaiting.id,
      awaiting.ideaRevision,
      { kind: 'user', id: 'provider-native-user' },
    );

    expect(drafted.checkpoint).toBe('intent_drafted');
    expect(drafted.answers).toEqual({ delivery: 'banner' });
    expect(fs.readFileSync(path.join(workspaceRoot, 'docs', 'ideas', drafted.id, 'INTENT.md'), 'utf8'))
      .toContain('in-app banner');
  });
});
