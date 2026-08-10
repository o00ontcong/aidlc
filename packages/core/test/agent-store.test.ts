import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentStore, SkillStore, PipelineStore, type Agent, type Skill } from '../src';

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('AgentStore — write + read back frontmatter, keeps unknown fields', () => {
  let workspaceRoot: string;
  let globalRoot: string;
  let store: AgentStore;

  beforeEach(() => {
    workspaceRoot = tmpRoot('aidlc-agent-ws-');
    globalRoot = tmpRoot('aidlc-agent-global-');
    store = new AgentStore(workspaceRoot, globalRoot);
  });

  const AGENT: Agent = {
    id: 'design-recreator',
    name: 'Design Recreator',
    description: 'Dựng lại UI từ Figma/ảnh tham chiếu',
    model: 'claude-opus-4',
    tier: 'deep',
    skills: ['figma-to-ui', 'design-system', 'responsive-layout'],
    capabilities: ['figma', 'files', 'github', 'web'],
  };

  it('round-trips skills/capabilities exactly through the .md frontmatter file', () => {
    store.write(AGENT);
    const file = path.join(workspaceRoot, '.claude', 'agents', 'design-recreator.md');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain('id: design-recreator');

    const reloaded = new AgentStore(workspaceRoot, globalRoot).read('design-recreator');
    expect(reloaded).toEqual(AGENT);
  });

  it('exists() and list() see project entries', () => {
    store.write(AGENT);
    expect(store.exists('design-recreator')).toBe(true);
    expect(store.exists('nope')).toBe(false);
    expect(store.list().map((a) => a.id)).toEqual(['design-recreator']);
  });

  it('project entry shadows a global entry with the same id', () => {
    store.write({ ...AGENT, name: 'Global Version' }, 'global');
    store.write({ ...AGENT, name: 'Project Version' }, 'project');
    expect(store.read('design-recreator')?.name).toBe('Project Version');
    expect(store.list()).toHaveLength(1);
  });

  it('emits a change event on write', () => {
    const events: Array<{ id: string; scope: string }> = [];
    store.onChange((e) => events.push(e));
    store.write(AGENT);
    expect(events).toEqual([{ id: 'design-recreator', scope: 'project' }]);
  });
});

describe('SkillStore — body is the markdown content, frontmatter is metadata', () => {
  it('round-trips description/source/body', () => {
    const workspaceRoot = tmpRoot('aidlc-skill-ws-');
    const globalRoot = tmpRoot('aidlc-skill-global-');
    const store = new SkillStore(workspaceRoot, globalRoot);
    const skill: Skill = {
      id: 'figma-to-ui',
      source: 'design',
      description: 'Convert a Figma frame into UI code',
      body: '1. Fetch design context\n2. Map to components',
    };
    store.write(skill);
    expect(store.read('figma-to-ui')).toEqual(skill);
    expect(store.exists('figma-to-ui')).toBe(true);
  });
});

describe('PipelineStore — writes are always a project-scoped copy', () => {
  it('never overwrites the bundled definition, and read() prefers the project copy', () => {
    const workspaceRoot = tmpRoot('aidlc-pipeline-ws-');
    const bundled = {
      id: 'redraw-design',
      source: 'bundled' as const,
      version: '1.0.0',
      steps: [{ id: 'human-review', agent: undefined, humanReview: true, autoReview: false, skills: [], outputs: [], onReject: undefined }],
    };
    const store = new PipelineStore(workspaceRoot, [bundled]);
    expect(store.read('redraw-design')?.source).toBe('bundled');

    store.write({ ...bundled, version: '1.1.0' });
    expect(store.read('redraw-design')).toEqual({ ...bundled, source: 'project', version: '1.1.0' });

    const projectFile = path.join(workspaceRoot, '.aidlc', 'pipelines', 'redraw-design.yaml');
    expect(fs.existsSync(projectFile)).toBe(true);
  });
});
