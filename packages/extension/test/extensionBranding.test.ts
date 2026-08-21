import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { embedJsonForScript, extensionDisplayName } from '../src/v2/extensionBranding';

describe('extensionDisplayName', () => {
  it('reads displayName from the extension package.json', () => {
    const root = path.resolve(__dirname, '..');
    expect(extensionDisplayName(root)).toBe('AIDLC Workspace');
  });
});

describe('embedJsonForScript', () => {
  it('escapes script-breaking sequences in briefing markdown', () => {
    const json = embedJsonForScript({ summary: '</script><p>OXUPass</p>' });
    expect(json).not.toContain('</script>');
    expect(json).toContain('\\u003c/script>');
    expect(JSON.parse(json).summary).toBe('</script><p>OXUPass</p>');
  });
});
