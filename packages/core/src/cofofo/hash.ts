import * as crypto from 'crypto';
import * as fs from 'fs';

export function sha256(value: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function hashFile(file: string): string {
  return sha256(fs.readFileSync(file));
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashObject(value: unknown): string {
  // Match the durable JSON representation: optional `undefined` properties
  // are omitted on disk and therefore must not alter a hash before writing.
  const durable = JSON.parse(JSON.stringify(value)) as unknown;
  return sha256(stableJson(durable));
}
