import { type Idea } from '../contracts/idea';
import { renderIntentFromIdea } from './stageContent';

/** Markdown projection of the Idea research workflow — `INTENT.md` at scaffold time. */
export function renderIdeaBrief(idea: Idea): string {
  return renderIntentFromIdea(idea);
}
