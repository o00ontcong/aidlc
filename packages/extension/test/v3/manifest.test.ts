import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

type ManifestCommand = { command: string; title?: string; category?: string };

describe('V3 extension manifest', () => {
  it('contributes the V3 workspace command to the Command Palette', () => {
    const manifestPath = path.resolve(process.cwd(), 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      contributes?: { commands?: ManifestCommand[] };
    };

    expect(manifest.contributes?.commands).toContainEqual({
      command: 'aidlc.v3.open',
      title: 'Open AIDLC Workspace',
      icon: '$(rocket)',
      category: 'AIDLC',
    });
    expect(manifest.contributes?.commands?.map((command) => command.command)).toEqual(expect.arrayContaining([
      'aidlc.project.analyze', 'aidlc.project.setup', 'aidlc.epic.next', 'aidlc.epic.resume',
    ]));
  });
});
