/**
 * Canvas → terminal feedback. A formal review Send does not run annotron's
 * in-window agent; the extension consolidates unresolved comments and starts
 * the owning step slash command in a visible terminal.
 */

const FRAME_HEADERS = [
  /^canvas review requested changes\b/i,
  /^reviewer feedback collected\b/i,
  /^only comments with status\b/i,
  /^after applying (each|a)\b/i,
  /^update the artifact\/source\b/i,
  /^treat the following reviewer\b/i,
  /^##\s+/i,
];

function isFrameHeader(line: string): boolean {
  return FRAME_HEADERS.some((pattern) => pattern.test(line));
}

/**
 * Preserve every human instruction while stripping empty/duplicate lines and
 * telling the terminal agent to mark applied comments resolved in the sidecar.
 */
export function consolidateCanvasFeedback(feedback: string): string {
  const lines = feedback
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const unique = [...new Map(lines.map((line) => [line.toLocaleLowerCase(), line])).values()];
  const body = unique
    .filter((line) => !isFrameHeader(line))
    .map((line) => (line.startsWith('- ') ? line : `- ${line.replace(/^[-*]\s+/, '')}`))
    .join('\n');
  return [
    'Canvas review requested changes. Treat the following reviewer feedback as authoritative for this rerun.',
    'Update the artifact/source owned by this step; do not wait for or start an agent inside Canvas.',
    'Each comment below carries an `id` and `status`. After you apply a comment, set that annotation `status` to `"resolved"` and `resolvedAt` to an ISO timestamp in the sibling `.annotron.json` sidecar (same stem as the reviewed Markdown). Leave comments you could not apply as `open`. Do not send already-resolved comments.',
    '',
    '## Unresolved Canvas comments',
    body || '- Review the Canvas annotations and correct the requested issue.',
  ].join('\n');
}
