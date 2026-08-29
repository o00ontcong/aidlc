import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ALLOWED_KINDS = new Set(['layering', 'path', 'naming', 'dependency', 'commandId']);
const ALLOWED_COMMANDS = new Set(['swift.build', 'swift.test', 'swift.test-targeted']);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const base = path.join(root, 'docs/project/foundation');
  const jsonPath = path.join(base, 'PROJECT-RULES.json');
  const mdPath = path.join(base, 'PROJECT-RULES.md');
  const driftPath = path.join(base, 'RULE-DRIFT.md');
  if (![jsonPath, mdPath, driftPath].every(existsSync)) return { decision: 'reject', reason: 'Thiếu JSON, Markdown hoặc RULE-DRIFT cho project rules.' };
  const source = readFileSync(jsonPath, 'utf8');
  let doc;
  try { doc = JSON.parse(source); } catch { return { decision: 'reject', reason: 'PROJECT-RULES.json không hợp lệ.' }; }
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.rules) || doc.rules.length === 0) return { decision: 'reject', reason: 'PROJECT-RULES cần schemaVersion: 1 và ít nhất một rule.' };
  for (const rule of doc.rules) {
    if (!rule.ruleId || !ALLOWED_KINDS.has(rule.kind) || !rule.scope || !rule.matcher || !['block', 'warn'].includes(rule.severity)) {
      return { decision: 'reject', reason: `Rule không đủ field máy kiểm được: ${rule.ruleId ?? '(missing id)'}.` };
    }
    if ('command' in rule || 'command' in rule.matcher || (rule.kind === 'commandId' && !ALLOWED_COMMANDS.has(rule.matcher.commandId))) {
      return { decision: 'reject', reason: `Rule ${rule.ruleId} chứa command tự do hoặc commandId ngoài allow-list.` };
    }
  }
  const durable = JSON.parse(JSON.stringify(doc));
  const hash = `sha256:${crypto.createHash('sha256').update(stableJson(durable)).digest('hex')}`;
  const rendered = readFileSync(mdPath, 'utf8');
  if (!rendered.includes(`aidlc:rules-source-sha256 ${hash}`) || !rendered.includes('## Rule Index')) {
    return { decision: 'reject', reason: 'PROJECT-RULES.md không mang marker/hash đúng từ JSON source.' };
  }
  return { decision: 'pass', reason: `${doc.rules.length} rule được render từ JSON, không có shell command tự do.` };
}
