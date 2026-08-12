/**
 * Filesystem store for `PipelineRun` (IMPLEMENT.md §1 StepState, §2 step 4).
 * Layout: `.aidlc/epics/<epicId>/pipeline-runs/<pipelineId>/{state.json,events.ndjson}`
 * — same NDJSON-event / atomic-write conventions as `EpicStore` (Step 1),
 * kept as a sibling rather than folded into `Epic.stages` because a registry
 * `Pipeline`'s step ids are arbitrary, not the closed `StageId` vocabulary.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  parsePipelineRun,
  parsePipelineRunEvent,
  type ActorRef,
  type Pipeline,
  type PipelineRun,
  type PipelineRunEvent,
} from '../contracts';
import { writeFileAtomic, recoverAtomicWrite } from '../epic';
import { redactSecrets } from '../release/ReleaseVerification';

const STATE_FILE = 'state.json';
const EVENTS_FILE = 'events.ndjson';

export class PipelineRunConflictError extends Error {
  constructor(readonly epicId: string, readonly pipelineId: string, readonly expected: number | null, readonly actual: number | null) {
    super(`PipelineRun ${epicId}/${pipelineId} revision changed while writing (expected ${expected ?? 'missing'}, actual ${actual ?? 'missing'}).`);
    this.name = 'PipelineRunConflictError';
  }
}

export class PipelineRunStore {
  constructor(private readonly workspaceRoot: string) {}

  dir(epicId: string, pipelineId: string): string {
    return path.join(this.workspaceRoot, '.aidlc', 'epics', epicId, 'pipeline-runs', pipelineId);
  }

  private stateFile(epicId: string, pipelineId: string): string {
    return path.join(this.dir(epicId, pipelineId), STATE_FILE);
  }

  private eventsFile(epicId: string, pipelineId: string): string {
    return path.join(this.dir(epicId, pipelineId), EVENTS_FILE);
  }

  /** Every `PipelineRun` recorded for one epic, across all pipelines it has run. */
  listForEpic(epicId: string): PipelineRun[] {
    const dir = path.join(this.workspaceRoot, '.aidlc', 'epics', epicId, 'pipeline-runs');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.load(epicId, entry.name))
      .filter((run): run is PipelineRun => run !== null);
  }

  /** Every durable run for one pipeline, including runs whose Epic is no
   * longer in the application read model. Used to protect pipeline deletion. */
  listForPipeline(pipelineId: string): PipelineRun[] {
    const epicsDir = path.join(this.workspaceRoot, '.aidlc', 'epics');
    if (!fs.existsSync(epicsDir)) return [];
    return fs.readdirSync(epicsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.load(entry.name, pipelineId))
      .filter((run): run is PipelineRun => run !== null);
  }

  /** `null` if this epic has never run this pipeline. */
  load(epicId: string, pipelineId: string): PipelineRun | null {
    const file = this.stateFile(epicId, pipelineId);
    recoverAtomicWrite(file);
    if (!fs.existsSync(file)) return null;
    return parsePipelineRun(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  /** Creates the initial projection — every step `awaiting-work`, attempt 1. */
  start(pipeline: Pipeline, epicId: string, at: string): PipelineRun {
    const run = parsePipelineRun({
      schemaVersion: 1,
      epicId,
      pipelineId: pipeline.id,
      pipelineVersion: pipeline.version,
      steps: pipeline.steps.map((step) => ({ id: step.id, status: 'awaiting-work' as const, attempt: 1 })),
      revision: 0,
      createdAt: at,
      updatedAt: at,
    });
    this.save(run, null);
    return run;
  }

  save(run: PipelineRun, expectedRevision: number | null): void {
    const validated = parsePipelineRun(run);
    const file = this.stateFile(validated.epicId, validated.pipelineId);
    if (expectedRevision === null) {
      writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
      return;
    }
    const current = this.load(validated.epicId, validated.pipelineId);
    const currentRevision = current?.revision ?? null;
    if (currentRevision !== expectedRevision) {
      throw new PipelineRunConflictError(validated.epicId, validated.pipelineId, expectedRevision, currentRevision);
    }
    writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
  }

  appendEventFor(epicId: string, pipelineId: string, event: PipelineRunEvent): void {
    const validated = parsePipelineRunEvent(redactSecrets(event));
    const file = this.eventsFile(epicId, pipelineId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file, 'a');
    try {
      fs.writeFileSync(fd, `${JSON.stringify(validated)}\n`, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  readEvents(epicId: string, pipelineId: string): PipelineRunEvent[] {
    const file = this.eventsFile(epicId, pipelineId);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => parsePipelineRunEvent(JSON.parse(line)));
  }

  /** `StateProjection.rebuild` (IMPLEMENT.md §2 step 1) for a `PipelineRun` — replays the event log's last known step statuses back onto `state.json`. Crash recovery only; does not reinterpret history. */
  rebuild(epicId: string, pipelineId: string): PipelineRun | null {
    const run = this.load(epicId, pipelineId);
    if (!run) return null;
    const events = this.readEvents(epicId, pipelineId);
    const lastByStep = new Map<string, PipelineRunEvent>();
    for (const event of events) {
      if (event.stepId) lastByStep.set(event.stepId, event);
    }
    let changed = false;
    const steps = run.steps.map((step) => {
      const last = lastByStep.get(step.id);
      if (!last?.to || last.to === step.status) return step;
      changed = true;
      return { ...step, status: last.to };
    });
    if (!changed) return run;
    const repaired = { ...run, steps, updatedAt: events.at(-1)!.at, revision: run.revision + 1 };
    this.save(repaired, run.revision);
    return repaired;
  }

  record(epicId: string, pipelineId: string, command: string, actor: ActorRef, patch: Partial<Pick<PipelineRunEvent, 'stepId' | 'from' | 'to' | 'detail'>>, at: string): void {
    this.appendEventFor(epicId, pipelineId, {
      schemaVersion: 1,
      at,
      actor,
      command,
      ...patch,
    });
  }
}
