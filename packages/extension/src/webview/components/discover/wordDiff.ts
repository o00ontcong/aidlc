/* Word-level diff for one entry's before/after text — an LCS over
 * whitespace-delimited tokens. Entries are a bullet or a sentence, never a
 * whole file, so an O(n·m) table is cheap; this is not meant to diff Markdown
 * files, only the short strings DiffView already tracks per item.
 */

export interface DiffToken {
  text: string;
  type: 'same' | 'add' | 'del';
}

function tokenize(text: string): string[] {
  // Keep whitespace as its own token so re-joining the pieces reproduces the
  // original spacing exactly.
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

export function wordDiff(before: string, after: string): { before: DiffToken[]; after: DiffToken[] } {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const beforeTokens: DiffToken[] = [];
  const afterTokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      beforeTokens.push({ text: a[i]!, type: 'same' });
      afterTokens.push({ text: b[j]!, type: 'same' });
      i++; j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      beforeTokens.push({ text: a[i]!, type: 'del' });
      i++;
    } else {
      afterTokens.push({ text: b[j]!, type: 'add' });
      j++;
    }
  }
  while (i < n) { beforeTokens.push({ text: a[i]!, type: 'del' }); i++; }
  while (j < m) { afterTokens.push({ text: b[j]!, type: 'add' }); j++; }

  return { before: beforeTokens, after: afterTokens };
}
