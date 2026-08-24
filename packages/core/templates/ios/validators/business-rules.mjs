/**
 * Auto-review cho step `document-business-rules`.
 *
 * Chặn đúng một thứ: luật viết ra mà không có bằng chứng. Đó là ranh giới giữa
 * "ghi lại luật" và "bịa luật nghe hợp lý".
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const rulesPath = path.join(root, 'docs', 'project', 'domain', 'BUSINESS-RULES.md');
  const openPath = path.join(root, 'docs', 'project', 'domain', 'RULE-OPEN-QUESTIONS.md');

  if (!existsSync(rulesPath)) {
    return { decision: 'reject', reason: 'Thiếu docs/project/domain/BUSINESS-RULES.md.' };
  }
  if (!existsSync(openPath)) {
    return { decision: 'reject', reason: 'Thiếu RULE-OPEN-QUESTIONS.md — câu hỏi mở là đầu ra bắt buộc, kể cả khi rỗng.' };
  }

  const rules = readFileSync(rulesPath, 'utf8');
  if (!rules.includes('## Rule Index')) {
    return { decision: 'reject', reason: 'BUSINESS-RULES thiếu "## Rule Index".' };
  }

  const ids = [...rules.matchAll(/^\|\s*(BR-\d+)\s*\|/gm)].map((m) => m[1]);
  if (ids.length === 0) {
    return { decision: 'reject', reason: 'Rule Index chưa có luật nào (không thấy dòng BR-n).' };
  }

  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    return { decision: 'reject', reason: `ID luật bị trùng: ${[...new Set(dupes)].join(', ')}.` };
  }

  // Đếm Evidence *có dẫn nguồn thật*, không đếm marker suông: `**Evidence:** TBD`
  // là đúng thứ mà gate này tồn tại để chặn.
  const evidenceLines = [...rules.matchAll(/\*\*Evidence:\*\*(.*)$/gm)].map((m) => m[1]);
  const cited = evidenceLines.filter((line) => /\.(swift|md|json)\b|(^|[\s`])(src|docs|Tests)\//.test(line));
  if (cited.length < ids.length) {
    const empty = evidenceLines.length - cited.length;
    return {
      decision: 'reject',
      reason: `${ids.length} luật nhưng chỉ ${cited.length} dẫn được nguồn thật`
        + (empty > 0 ? ` (${empty} dòng **Evidence:** không có đường dẫn file)` : '')
        + ' — luật không dẫn được nguồn phải chuyển sang RULE-OPEN-QUESTIONS.',
    };
  }

  const confirmedWithoutTest = /Status:\s*confirmed/i.test(rules) && !/Tests?\//.test(rules);
  if (confirmedWithoutTest) {
    return {
      decision: 'reject',
      reason: 'Có luật Status: confirmed nhưng không trích dẫn test nào — confirmed cần bằng chứng test hoặc người xác nhận.',
    };
  }

  return { decision: 'pass', reason: `${ids.length} luật, tất cả đều có Evidence.` };
}
