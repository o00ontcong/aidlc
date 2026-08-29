import { describe, expect, it } from 'vitest';

import { extractJsonObject, readIdeaPrepResult } from '../src/v2/ideaPrepResult';

describe('extractJsonObject', () => {
  it('parses bare JSON', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips a markdown fence', () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a":1}\n```\nDone.')).toEqual({ a: 1 });
  });

  it('extracts the object between the first { and last } when unfenced prose surrounds it', () => {
    expect(extractJsonObject('Sure, here it is: {"a":1} — let me know if you need more.')).toEqual({ a: 1 });
  });

  it('rejects an empty response', () => {
    expect(() => extractJsonObject('   ')).toThrow(/empty/);
  });

  it('rejects a JSON array at the top level', () => {
    expect(() => extractJsonObject('[1,2,3]')).toThrow(/JSON object/);
  });
});

describe('readIdeaPrepResult', () => {
  it('reads a well-formed response', () => {
    const result = readIdeaPrepResult({
      selfAnswered: [{ question: 'Test framework?', answer: 'XCTest', source: 'STACK-PROFILE.json' }],
      questions: [{
        id: 'q1', text: 'What changes for the user?', reason: 'You said it feels stuck.', highImpact: true, dependsOn: [],
        options: [{ id: 'a', label: 'Instant refresh', recommended: true }, { id: 'b', label: 'A notification', recommended: false }],
      }],
    });
    expect(result.selfAnswered).toHaveLength(1);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]!.dependsOn).toEqual([]);
  });

  it('drops a question with fewer than two usable options instead of failing the whole batch', () => {
    const result = readIdeaPrepResult({
      selfAnswered: [],
      questions: [
        { id: 'q1', text: 'Good question', reason: 'x', highImpact: false, dependsOn: [], options: [{ id: 'a', label: 'A', recommended: true }, { id: 'b', label: 'B', recommended: false }] },
        { id: 'q2', text: 'Broken question', reason: 'x', highImpact: false, dependsOn: [], options: [{ id: 'a', label: 'Only one' }] },
      ],
    });
    expect(result.questions.map((q) => q.id)).toEqual(['q1']);
  });

  it('forces exactly one recommended option when the agent forgot to mark one', () => {
    const result = readIdeaPrepResult({
      selfAnswered: [],
      questions: [{ id: 'q1', text: 'x', reason: 'x', highImpact: false, dependsOn: [], options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }],
    });
    expect(result.questions[0]!.options.filter((o) => o.recommended)).toHaveLength(1);
  });

  it('drops a malformed self-answer entry without failing the whole batch', () => {
    const result = readIdeaPrepResult({
      selfAnswered: [{ question: 'Missing source' }, { question: 'Good one', answer: 'yes', source: 'AGENTS.md' }],
      questions: [],
    });
    expect(result.selfAnswered).toEqual([{ question: 'Good one', answer: 'yes', source: 'AGENTS.md' }]);
  });

  it('throws when nothing usable survives narrowing', () => {
    expect(() => readIdeaPrepResult({ selfAnswered: [], questions: [] })).toThrow(/no usable/);
    expect(() => readIdeaPrepResult({})).toThrow(/no usable/);
  });

  it('keeps dependsOn ids so the batcher can order dependent questions', () => {
    const result = readIdeaPrepResult({
      selfAnswered: [],
      questions: [{ id: 'q2', text: 'x', reason: 'x', highImpact: false, dependsOn: ['q1'], options: [{ id: 'a', label: 'A', recommended: true }, { id: 'b', label: 'B' }] }],
    });
    expect(result.questions[0]!.dependsOn).toEqual(['q1']);
  });
});
