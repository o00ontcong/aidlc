import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { installClaudeAidlcCommand, resolveClaudeCommandTemplatePath } from '../src/release/ClaudeCommandInstaller';

describe('ClaudeCommandInstaller', () => {
  it('installs the packaged /aidlc template without overwriting divergent content unless forced', () => {
    expect(fs.existsSync(resolveClaudeCommandTemplatePath())).toBe(true);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-claude-cmd-'));
    const first = installClaudeAidlcCommand(root);
    expect(first).toMatchObject({ installed: true, overwritten: false, path: '.claude/commands/aidlc.md' });
    expect(fs.existsSync(path.join(root, '.claude', 'commands', 'aidlc.md'))).toBe(true);

    const same = installClaudeAidlcCommand(root);
    expect(same.installed).toBe(false);

    fs.writeFileSync(path.join(root, '.claude', 'commands', 'aidlc.md'), 'custom\n');
    const blocked = installClaudeAidlcCommand(root);
    expect(blocked).toMatchObject({ installed: false, overwritten: false });
    const forced = installClaudeAidlcCommand(root, { force: true });
    expect(forced).toMatchObject({ installed: true, overwritten: true });
  });
});
