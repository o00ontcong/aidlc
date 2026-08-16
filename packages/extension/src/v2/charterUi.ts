/**
 * Lightweight readers for Charter Board / Alignment / Ship UI.
 * Slice 3 only *reads* CHARTER.json — define-charter lives in slice 1.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CharterGoal {
  id: string;
  title: string;
  metric?: string;
  status?: string;
}

export interface CharterInvariant {
  id: string;
  rule: string;
  severity?: string;
}

export interface CharterTechRule {
  id: string;
  kind: string;
  value: string;
}

export interface CharterSnapshot {
  present: boolean;
  revision?: number;
  hash?: string;
  goals: CharterGoal[];
  invariants: CharterInvariant[];
  techRules: CharterTechRule[];
  driftSummary?: string;
  conventionsPath?: string;
  rulesSyncStatus?: 'fresh' | 'stale' | 'unknown';
}

export interface EpicAlignment {
  goals: string[];
  status?: 'aligned' | 'variance' | 'stale';
}

export interface EpicShipInfo {
  prUrl?: string;
  status?: 'open' | 'approved' | 'merged';
  head?: string;
  base?: string;
}

function readTextSafe(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJsonSafe(file: string): unknown {
  const text = readTextSafe(file);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function readCharterSnapshot(workspaceRoot: string): CharterSnapshot {
  const charterPath = path.join(workspaceRoot, 'docs', 'project', 'charter', 'CHARTER.json');
  const raw = readJsonSafe(charterPath) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    return { present: false, goals: [], invariants: [], techRules: [] };
  }

  const goals = Array.isArray(raw.goals)
    ? (raw.goals as Array<Record<string, unknown>>).map((g) => ({
        id: String(g.id ?? ''),
        title: String(g.title ?? ''),
        metric: g.metric != null ? String(g.metric) : undefined,
        status: g.status != null ? String(g.status) : undefined,
      })).filter((g) => g.id)
    : [];

  const invariants = Array.isArray(raw.invariants)
    ? (raw.invariants as Array<Record<string, unknown>>).map((inv) => ({
        id: String(inv.id ?? ''),
        rule: String(inv.rule ?? ''),
        severity: inv.severity != null ? String(inv.severity) : undefined,
      })).filter((inv) => inv.id)
    : [];

  const techRules = Array.isArray(raw.techRules)
    ? (raw.techRules as Array<Record<string, unknown>>).map((t) => ({
        id: String(t.id ?? ''),
        kind: String(t.kind ?? ''),
        value: String(t.value ?? ''),
      })).filter((t) => t.id)
    : [];

  const driftPath = path.join(workspaceRoot, 'docs', 'project', 'conformance', 'DRIFT-REPORT.md');
  const driftText = readTextSafe(driftPath);
  let driftSummary: string | undefined;
  if (driftText) {
    const violated = (driftText.match(/VIOLATED/gi) ?? []).length;
    const ok = (driftText.match(/OK|PASS|ALIGNED/gi) ?? []).length;
    driftSummary = violated
      ? `${violated} VIOLATED · see DRIFT-REPORT.md`
      : ok
        ? `No VIOLATED markers (${ok} OK/aligned mentions)`
        : driftText.slice(0, 240).trim();
  }

  const conventionsPath = path.join('docs', 'project', 'conventions', 'CONVENTIONS.md');
  const conventionsAbs = path.join(workspaceRoot, conventionsPath);

  return {
    present: true,
    revision: typeof raw.revision === 'number' ? raw.revision : undefined,
    hash: typeof raw.hash === 'string' ? raw.hash : undefined,
    goals,
    invariants,
    techRules,
    driftSummary,
    conventionsPath: fs.existsSync(conventionsAbs) ? conventionsPath : undefined,
    rulesSyncStatus: 'unknown',
  };
}

export function readDiffIgnore(workspaceRoot: string): string[] {
  const file = path.join(workspaceRoot, '.aidlc', 'diffignore');
  const text = readTextSafe(file);
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export function readEpicAlignment(epicDir: string): EpicAlignment | undefined {
  const alignmentPath = path.join(epicDir, 'artifacts', 'ALIGNMENT.md');
  const text = readTextSafe(alignmentPath);
  if (!text) return undefined;

  const goals = [...new Set(text.match(/\bG-\d+\b/g) ?? [])];
  let status: EpicAlignment['status'] = 'aligned';
  if (/stale\s+charter/i.test(text) || /charterRevision.*stale/i.test(text)) {
    status = 'stale';
  } else if (
    fs.existsSync(path.join(epicDir, 'artifacts', 'variance-requests'))
    || /variance\s+pending/i.test(text)
  ) {
    const vrDir = path.join(epicDir, 'artifacts', 'variance-requests');
    if (fs.existsSync(vrDir)) {
      try {
        const pending = fs.readdirSync(vrDir).some((n) => {
          if (!n.endsWith('.md')) return false;
          const body = readTextSafe(path.join(vrDir, n)) ?? '';
          return !/\*\*Status:\*\*\s*approved\b/i.test(body);
        });
        if (pending) status = 'variance';
      } catch { /* keep aligned */ }
    } else {
      status = 'variance';
    }
  }
  return { goals, status };
}

export function readEpicShip(epicDir: string, pipeline: string | null): EpicShipInfo | undefined {
  if (!pipeline || pipeline.includes('work-package')) return undefined;
  if (
    pipeline !== 'cohesive-feature' && !pipeline.startsWith('cohesive-feature')
    && pipeline !== 'feature-implement' && !pipeline.startsWith('feature-implement')
    && pipeline !== 'feature-spike' && !pipeline.startsWith('feature-spike')
  ) {
    // Still allow PR-LINK.md on feature-like pipelines.
    if (!pipeline.includes('feature')) return undefined;
  }
  const text = readTextSafe(path.join(epicDir, 'artifacts', 'PR-LINK.md'));
  if (!text) return undefined;

  const prUrl = text.match(/https?:\/\/[^\s)]+/i)?.[0];
  const head = text.match(/\*\*Head:\*\*\s*`?([^\s`]+)`?/i)?.[1]
    ?? text.match(/head[=:]\s*`?([^\s`]+)`?/i)?.[1];
  const base = text.match(/\*\*Base:\*\*\s*`?([^\s`]+)`?/i)?.[1]
    ?? text.match(/base[=:]\s*`?([^\s`]+)`?/i)?.[1];
  let status: EpicShipInfo['status'] = 'open';
  if (/\bmerged\b/i.test(text)) status = 'merged';
  else if (/\bapproved\b/i.test(text)) status = 'approved';
  return { prUrl, head, base, status };
}

export function readReviewDiff(epicDir: string): string | undefined {
  const text = readTextSafe(path.join(epicDir, 'artifacts', 'REVIEW-DIFF.md'));
  return text?.trim() ? text : undefined;
}
