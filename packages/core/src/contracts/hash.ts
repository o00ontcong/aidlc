/**
 * Canonical JSON + content hashing shared by the Project Change / Context
 * contracts (implementation plan §6.1, §18.2).
 *
 * Rules locked by the plan:
 *   - Canonical JSON sorts object keys recursively; `undefined` values are
 *     dropped (they are never written to disk either); arrays keep the order
 *     given to them — callers normalize a "set-like" array (e.g. sort by a
 *     stable id) themselves before hashing if order must not affect the hash.
 *   - The hash is plain lowercase SHA-256 hex, with no `sha256:` prefix, "de
 *     tuong thich hash hien tai" (§18.2) — this matches
 *     `shape/ShapeService.ts`'s `hashShapeDecision`, not `cofofo/hash.ts`'s
 *     prefixed `sha256(...)`.
 */

import * as crypto from 'crypto';

import { z } from 'zod';

export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export const Sha256HexSchema = z
  .string()
  .regex(SHA256_HEX_PATTERN, 'Must be a lowercase SHA-256 hash (64 hex characters, no prefix)');

/** Canonical JSON string for `value`: sorted object keys, arrays kept in order, `undefined` dropped. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Lowercase SHA-256 hex (no prefix) of `canonicalJson(value)` — see module doc for the exact rules. */
export function sha256Hex(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}
