import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscoverService,
  discoverCommandBody,
  discoverPipelineCommandBody,
  discoverDevDocsCommandBody,
  syncPipelineCommandsForProvider,
  builtinTemplatesRoot,
  DISCOVER_STEPS,
  DOC_REQUIREMENTS,
  type ActorRef,
} from '../src';

const USER: ActorRef = { kind: 'user', id: 'test' };

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-discover-loop-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }); }
});

describe('Discover agent command bodies', () => {
  it('describes every step and its files, generated from the spec', () => {
    const body = discoverCommandBody();
    for (const step of DISCOVER_STEPS) {
      expect(body).toContain(`(\`${step.id}\`)`);
      for (const file of step.files) { expect(body).toContain(file.path); }
    }
  });

  it('teaches exactly the item and record shapes the parser reads', () => {
    const body = discoverCommandBody();
    expect(body).toContain('- **FR-01** — text');
    expect(body).toContain('- **NFR-<GROUP>-01** — text');
    expect(body).toContain('one `### UC-01 — Title` block per entry');
    expect(body).toContain('`- **Actor:** value` — required');
    expect(body).toContain('`- **Main flow:**` then nested `  - ` bullets — required');
  });

  it('states the rules that keep an agent from clobbering the user', () => {
    const body = discoverCommandBody();
    expect(body).toContain('Ids are permanent');
    expect(body).toContain('Never touch a pinned entry');
    expect(body).toContain("Stay inside this step's files");
    expect(body).toContain('are the source of truth');
  });

  it('makes the pipeline variant read the current step instead of remembering it', () => {
    const body = discoverPipelineCommandBody();
    expect(body).toContain('.aidlc/discover/index.json');
    expect(body).toContain('trust it over anything you remember');
    expect(body).toContain('Never attempt two steps in one turn.');
  });

  it('derives the development docs from the stack rather than inventing them', () => {
    const body = discoverDevDocsCommandBody();
    expect(body).toContain('development/CODING_RULES.md');
    expect(body).toContain('do the Tech Decisions step');
    expect(body).not.toContain('IDEA.md');
  });

  it('installs all three commands for a provider with no pipeline yet', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), yaml.dump({ pipelines: [] }));

    syncPipelineCommandsForProvider(root, builtinTemplatesRoot(), 'claude');

    const dir = path.join(root, '.claude', 'commands');
    expect(fs.existsSync(path.join(dir, 'aidlc-discover.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'aidlc-discover-pipeline.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'aidlc-discover-dev-docs.md'))).toBe(true);
  });
});

describe('Discover run verdicts', () => {
  function withOneRequirement(): DiscoverService {
    const service = new DiscoverService(newRoot());
    service.init({ seedSentence: 'App xem video 2 subtitle.', actor: USER });
    service.applyOps(DOC_REQUIREMENTS, [
      { op: 'addItem', section: 'functional', text: 'Mở video local.' },
      { op: 'addItem', section: 'functional', text: 'Nạp subtitle #1.' },
    ], { actor: USER });
    return service;
  }

  /** Stand in for an agent writing the file itself, which is what really happens. */
  function agentWrites(service: DiscoverService, content: string): void {
    fs.writeFileSync(service.docFile(DOC_REQUIREMENTS), content, 'utf8');
  }

  it('leaves exactly one run awaiting a verdict', () => {
    const service = withOneRequirement();
    const { run } = service.startRun('requirements');
    expect(service.activeRun()?.id).toBe(run.id);
    expect(service.activeRun()?.status).toBe('running');

    agentWrites(service, '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Mở video local.\n- **FR-02** — Nạp subtitle #1.\n- **FR-03** — Hiển thị hai subtitle.\n\n## Non-functional requirements\n');
    expect(service.finishRun(run.id).run.status).toBe('review');

    service.keepRun(run.id);
    expect(service.activeRun()).toBeUndefined();
    expect(service.require().runs.find((r) => r.id === run.id)!.status).toBe('kept');
    expect(fs.existsSync(service.snapshotDir(run.id))).toBe(false);
  });

  it('grows the diff when the agent keeps writing after the first check', () => {
    const service = withOneRequirement();
    const { run } = service.startRun('requirements');

    agentWrites(service, '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Mở video local.\n- **FR-02** — Nạp subtitle #1.\n- **FR-03** — Hiển thị hai subtitle.\n\n## Non-functional requirements\n');
    expect(service.finishRun(run.id).diff.added).toEqual([`${DOC_REQUIREMENTS}#FR-03`]);

    agentWrites(service, '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Mở video local.\n- **FR-02** — Nạp subtitle #1.\n- **FR-03** — Hiển thị hai subtitle.\n- **FR-04** — Chỉnh offset từng subtitle.\n\n## Non-functional requirements\n');
    const second = service.finishRun(run.id);
    expect(second.diff.added).toEqual([`${DOC_REQUIREMENTS}#FR-03`, `${DOC_REQUIREMENTS}#FR-04`]);
    expect(second.run.status).toBe('review');
  });

  it('undoes one entry of a run and leaves the rest of it standing', () => {
    const service = withOneRequirement();
    const { run } = service.startRun('requirements');

    // The agent reworded FR-01, deleted FR-02, and added FR-03.
    agentWrites(service, '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Mở video local từ Files.\n- **FR-03** — Hiển thị hai subtitle.\n\n## Non-functional requirements\n');
    const finished = service.finishRun(run.id);
    expect(finished.diff).toMatchObject({
      added: [`${DOC_REQUIREMENTS}#FR-03`],
      updated: [`${DOC_REQUIREMENTS}#FR-01`],
      removed: [`${DOC_REQUIREMENTS}#FR-02`],
    });

    const result = service.revertEntries(run.id, [`${DOC_REQUIREMENTS}#FR-01`, `${DOC_REQUIREMENTS}#FR-02`], USER);
    expect(result.issues).toEqual([]);
    expect(result.reverted).toEqual([`${DOC_REQUIREMENTS}#FR-01`, `${DOC_REQUIREMENTS}#FR-02`]);

    const items = service.readDoc(DOC_REQUIREMENTS).sections[0]!.items;
    expect(items.map((i) => `${i.id}:${i.text}`)).toEqual([
      'FR-01:Mở video local.',       // reworded → back to the original wording
      'FR-03:Hiển thị hai subtitle.', // untouched by the partial undo
      'FR-02:Nạp subtitle #1.',       // deleted → restored (at the end of its section)
    ]);
    const reloaded = service.require().runs.find((r) => r.id === run.id)!;
    expect(reloaded.status).toBe('review');
    // The two reverted entries are back to matching the snapshot, so the
    // run's own diff should no longer list them — otherwise the dialog still
    // shows a "change" for something that was just undone.
    expect(reloaded.diff).toMatchObject({
      added: [`${DOC_REQUIREMENTS}#FR-03`],
      updated: [],
      removed: [],
    });
  });

  it('keeps one entry of a run — it survives "undo the whole run" and drops off the diff', () => {
    const service = withOneRequirement();
    const { run } = service.startRun('requirements');

    // Same three-way change as the partial-undo test above.
    agentWrites(service, '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Mở video local từ Files.\n- **FR-03** — Hiển thị hai subtitle.\n\n## Non-functional requirements\n');
    service.finishRun(run.id);

    const result = service.keepEntries(run.id, [`${DOC_REQUIREMENTS}#FR-03`]);
    expect(result.issues).toEqual([]);
    expect(result.kept).toEqual([`${DOC_REQUIREMENTS}#FR-03`]);

    // Confirmed, so it drops out of the run's diff — only FR-01/FR-02 are
    // still pending a verdict.
    const afterKeep = service.require().runs.find((r) => r.id === run.id)!;
    expect(afterKeep.diff).toMatchObject({
      added: [],
      updated: [`${DOC_REQUIREMENTS}#FR-01`],
      removed: [`${DOC_REQUIREMENTS}#FR-02`],
    });

    // And it's baked into the snapshot now, so undoing the rest of the run
    // does not take FR-03 down with it.
    service.revertRun(run.id);
    const items = service.readDoc(DOC_REQUIREMENTS).sections[0]!.items;
    expect(items.map((i) => i.id).sort()).toEqual(['FR-01', 'FR-02', 'FR-03']);
    expect(items.find((i) => i.id === 'FR-01')!.text).toBe('Mở video local.'); // FR-01 reverted
    expect(items.find((i) => i.id === 'FR-03')!.text).toBe('Hiển thị hai subtitle.'); // FR-03 kept
  });

  it('refuses a partial undo once the snapshot has been dropped', () => {
    const service = withOneRequirement();
    const { run } = service.startRun('requirements');
    agentWrites(service, '# Requirements\n\n## Functional requirements\n\n- **FR-01** — Đổi rồi.\n- **FR-02** — Nạp subtitle #1.\n');
    service.finishRun(run.id);
    service.keepRun(run.id);

    expect(() => service.revertEntries(run.id, [`${DOC_REQUIREMENTS}#FR-01`], USER))
      .toThrow(/can no longer be undone/);
  });
});
