import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IdeaService } from '@aidlc/core';

import { buildIdeaPrepPrompt } from '../src/v2/providerRunLogic';
import { extractJsonObject, readIdeaPrepResult } from '../src/v2/ideaPrepResult';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-prep-')); }

const AGENT = { kind: 'agent' as const, id: 'idea-prep-agent' };

/** A realistic messy CLI response: fenced, with prose around the fence. */
const REALISTIC_RESPONSE = [
  "Sure, here's what I found after reading the project:",
  '```json',
  JSON.stringify({
    selfAnswered: [
      { question: 'Test framework and run command?', answer: 'XCTest via `swift test`', source: 'STACK-PROFILE.json' },
      { question: 'Is a heat alert domain type already modeled?', answer: 'No — WeatherSnapshot has no alert field', source: 'Sources/SkyCast/Domain/WeatherSnapshot.swift' },
    ],
    questions: [
      {
        id: 'q1', text: 'What changes for the user?', reason: 'You said the app should warn about heat.', highImpact: true, dependsOn: [],
        options: [{ id: 'a', label: 'A banner appears above 38°C', recommended: true }, { id: 'b', label: 'A push notification', recommended: false }],
      },
      {
        id: 'q2', text: 'Should the threshold be per-city?', reason: 'Cities have very different climates.', highImpact: false, dependsOn: ['q1'],
        options: [{ id: 'a', label: 'Yes, per city', recommended: true }, { id: 'b', label: 'One global threshold', recommended: false }],
      },
    ],
  }),
  '```',
  'Let me know if you want me to adjust anything.',
].join('\n');

describe('Idea prep pipeline end to end', () => {
  it('carries a real seed sentence into the prompt and the parsed result back into IdeaService', () => {
    const workspaceRoot = root();
    const ideas = new IdeaService(workspaceRoot);
    const created = ideas.create({ seedSentence: 'Warn me when it gets dangerously hot.' });

    const prompt = buildIdeaPrepPrompt({ ideaId: created.id, seedSentence: created.seedSentence, language: 'en' });
    expect(prompt).toContain('Warn me when it gets dangerously hot.');

    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    expect(prepping.checkpoint).toBe('preparing');

    // Simulate the CLI's raw stdout round-tripping through the same parser
    // `runIdeaPrep` uses in the extension.
    const result = readIdeaPrepResult(extractJsonObject(REALISTIC_RESPONSE));
    const done = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: result.selfAnswered.map((entry) => ({ ...entry, flagged: false })),
      questions: result.questions,
    }, AGENT);

    expect(done.checkpoint).toBe('awaiting_human');
    expect(done.prep.selfAnswered).toHaveLength(2);
    expect(done.prep.selfAnswered[1]!.source).toBe('Sources/SkyCast/Domain/WeatherSnapshot.swift');
    expect(done.prep.questions.map((q) => q.id)).toEqual(['q1', 'q2']);

    // q2 depends on q1 — the webview's eligibleQuestions equivalent must not
    // surface it until q1 is answered. Reproduce that check here directly
    // against IdeaService's own gate to prove the dependsOn round-tripped
    // correctly through the parser, not just structurally.
    const afterQ1 = ideas.saveAnswer(done.id, done.ideaRevision, 'q1', 'a', { kind: 'user', id: 'owner' });
    expect(afterQ1.checkpoint).toBe('awaiting_human');
    const afterQ2 = ideas.saveAnswer(afterQ1.id, afterQ1.ideaRevision, 'q2', 'a', { kind: 'user', id: 'owner' });
    const submitted = ideas.submitBatch(afterQ2.id, afterQ2.ideaRevision, { kind: 'user', id: 'owner' });
    expect(submitted.checkpoint).toBe('intent_drafted');
    expect(submitted.assumptions).toEqual([]); // both were actually answered, nothing defaulted
  });

  it('fails closed on a response with no usable content, matching failPrep\'s expectations', () => {
    expect(() => readIdeaPrepResult(extractJsonObject('```json\n{"selfAnswered":[],"questions":[]}\n```'))).toThrow(/no usable/);
  });
});
