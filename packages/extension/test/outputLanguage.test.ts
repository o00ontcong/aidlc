import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ensureMarkdownOutputLanguagePolicy,
  markdownOutputLanguageInstruction,
  resolveAidlcLanguage,
} from '../src/v2/outputLanguage';

describe('output-language policy', () => {
  let root: string;

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-output-language-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('resolves explicit and automatic display-language settings', () => {
    expect(resolveAidlcLanguage('en', 'vi')).toBe('en');
    expect(resolveAidlcLanguage('vi', 'en')).toBe('vi');
    expect(resolveAidlcLanguage('auto', 'vi-VN')).toBe('vi');
    expect(resolveAidlcLanguage('auto', 'en-US')).toBe('en');
  });

  it('writes a Vietnamese Markdown instruction without touching user content', () => {
    const claudeDir = path.join(root, '.claude');
    fs.mkdirSync(claudeDir);
    const file = path.join(claudeDir, 'CLAUDE.md');
    fs.writeFileSync(file, '# User instructions\n\n<!-- aidlc:ast-graph:start -->keep<!-- aidlc:ast-graph:end -->\n');

    ensureMarkdownOutputLanguagePolicy(root, 'vi');
    const body = fs.readFileSync(file, 'utf8');
    expect(body).toContain('# User instructions');
    expect(body).toContain('aidlc:ast-graph:start');
    expect(body).toContain('in Vietnamese');
  });

  it('replaces only its managed block when the setting changes', () => {
    const file = ensureMarkdownOutputLanguagePolicy(root, 'vi');
    ensureMarkdownOutputLanguagePolicy(root, 'en');
    const body = fs.readFileSync(file, 'utf8');
    expect(body.match(/aidlc:output-language:start/g)).toHaveLength(1);
    expect(body).toContain('in English');
    expect(body).not.toContain('in Vietnamese');
    expect(markdownOutputLanguageInstruction('vi')).toContain('in Vietnamese');
  });
});
