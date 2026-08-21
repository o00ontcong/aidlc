import * as fs from 'fs';
import * as path from 'path';

/** Human product name from package.json (`displayName`), used as the Workspace tab title. */
export function extensionDisplayName(extensionRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')) as {
      displayName?: unknown;
    };
    if (typeof pkg.displayName === 'string' && pkg.displayName.trim()) {
      return pkg.displayName.trim();
    }
  } catch {
    /* fall through */
  }
  return 'AIDLC Workspace';
}

/** JSON embedded in a <script> tag must not contain a raw `</script>` sequence. */
export function embedJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
