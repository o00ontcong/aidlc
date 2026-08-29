/**
 * Turning a prep-agent's raw stdout into the shape `IdeaService.completePrep`
 * accepts. Mirrors the now-retired `parseShapeUpdateProposalText`'s fence-
 * stripping strategy — a real CLI response is not guaranteed to be bare JSON.
 */

export interface IdeaPrepSelfAnswered {
  question: string;
  answer: string;
  source: string;
}

export interface IdeaPrepQuestionOption {
  id: string;
  label: string;
  recommended: boolean;
}

export interface IdeaPrepQuestion {
  id: string;
  text: string;
  reason: string;
  highImpact: boolean;
  dependsOn: string[];
  options: IdeaPrepQuestionOption[];
}

export interface IdeaPrepResult {
  selfAnswered: IdeaPrepSelfAnswered[];
  questions: IdeaPrepQuestion[];
}

/** Extract the JSON object from a provider response, tolerating fences and surrounding prose. */
export function extractJsonObject(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('The agent response is empty.');
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? (() => {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  })();
  const parsed = JSON.parse(candidate.trim()) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.');
  }
  return parsed;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Narrow untrusted agent output to exactly what `IdeaService.completePrep`
 * needs. Silently drops a malformed entry rather than failing the whole
 * batch — one bad question should not throw away nine good ones — but
 * throws if nothing usable came back at all, so a genuinely broken response
 * surfaces as `prep.status: 'failed'` instead of a silent empty batch.
 */
export function readIdeaPrepResult(raw: unknown): IdeaPrepResult {
  const record = raw as Record<string, unknown>;

  const selfAnsweredRaw = Array.isArray(record.selfAnswered) ? record.selfAnswered : [];
  const selfAnswered: IdeaPrepSelfAnswered[] = selfAnsweredRaw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (!isString(e.question) || !isString(e.answer) || !isString(e.source)) return [];
    return [{ question: e.question.trim(), answer: e.answer.trim(), source: e.source.trim() }];
  });

  const questionsRaw = Array.isArray(record.questions) ? record.questions : [];
  const questions: IdeaPrepQuestion[] = questionsRaw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (!isString(e.id) || !isString(e.text) || !isString(e.reason)) return [];
    const optionsRaw = Array.isArray(e.options) ? e.options : [];
    const options: IdeaPrepQuestionOption[] = optionsRaw.flatMap((option) => {
      if (!option || typeof option !== 'object') return [];
      const o = option as Record<string, unknown>;
      if (!isString(o.id) || !isString(o.label)) return [];
      return [{ id: o.id.trim(), label: o.label.trim(), recommended: o.recommended === true }];
    });
    // A question with fewer than 2 usable options cannot be answered — drop
    // it rather than shipping a batch item the UI cannot render.
    if (options.length < 2) return [];
    if (!options.some((option) => option.recommended)) options[0]!.recommended = true;
    const dependsOn = Array.isArray(e.dependsOn) ? e.dependsOn.filter(isString).map((d) => d.trim()) : [];
    return [{
      id: e.id.trim(),
      text: e.text.trim(),
      reason: e.reason.trim(),
      highImpact: e.highImpact === true,
      dependsOn,
      options,
    }];
  });

  if (selfAnswered.length === 0 && questions.length === 0) {
    throw new Error('The agent response has no usable self-answers or questions.');
  }
  return { selfAnswered, questions };
}
