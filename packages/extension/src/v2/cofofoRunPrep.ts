/**
 * Before launching an agent or marking a CoFoFo step done, refresh the live
 * workflow + run snapshot so analyze gates on REQUIREMENT.md, and materialize
 * USER-NOTE.md so the agent cannot miss it.
 */
import * as path from 'path';

import {
  CofofoFoundationService,
  RunStateStore,
  rebaseRunPipelineSnapshot,
  writeEpicUserNoteFile,
  resolveEpicUserNote,
  USER_NOTE_FILENAME,
  USER_NOTE_PRIORITY_RULE,
  COFOFO_REQUIREMENT_REQUIRED_HEADINGS,
  activeEpicsDir,
  mirrorRunStateToEpic,
  ensureProviderManagedTaskCommand,
  normalizeStep,
} from '@aidlc/core';
import type { PipelineConfig } from '@aidlc/core';

import { readYaml } from './yamlIO';

export function extraFeedbackForDeliveryStep(args: {
  epicsDir: string;
  runId: string;
  userNote?: string;
  pipelineId?: string;
  phaseName?: string;
  producesContains?: string[];
}): string {
  const extra: string[] = [];
  const isCofofo = Boolean(args.pipelineId?.startsWith('cofofo-'));
  const isAnalyze = args.phaseName === 'analyze';
  const markers = (args.producesContains ?? []).filter((marker) => marker.length > 0);

  if (args.userNote) {
    extra.push(
      isAnalyze
        ? `READ ${args.epicsDir}/${args.runId}/${USER_NOTE_FILENAME} FIRST. ${USER_NOTE_PRIORITY_RULE} Fold every distinctive line and every URL into the requirement artifact.`
        : `READ ${args.epicsDir}/${args.runId}/${USER_NOTE_FILENAME} FIRST. ${USER_NOTE_PRIORITY_RULE}`,
    );
  }

  if (isCofofo && isAnalyze) {
    extra.push(
      `This analyze step must write ${args.epicsDir}/${args.runId}/artifacts/REQUIREMENT.md with headings ${COFOFO_REQUIREMENT_REQUIRED_HEADINGS.join(', ')}. REQUIREMENT.md is the only analyze Canvas artifact (execution snapshot). If leftover OPTIONS.md, EVIDENCE.md, or TASK-DECISIONS.md exist, fold them into §§ 9–10; they are not pipeline artifacts.`,
    );
  } else if (isCofofo && markers.length > 0) {
    extra.push(
      `This ${args.phaseName ?? 'step'} must include these exact headings in its produced files (pipeline gate): ${markers.join(', ')}.`,
    );
  }

  return extra.join('\n\n');
}

export function prepareDeliveryRun(root: string, runId: string): {
  extraFeedback: string;
  rebased: boolean;
} {
  const loaded = RunStateStore.load(root, runId);
  if (loaded?.pipelineId.startsWith('cofofo-')) {
    try {
      new CofofoFoundationService(root).ensureWorkflowRegistered();
      ensureProviderManagedTaskCommand(root);
    } catch (err) {
      console.warn('[prepareDeliveryRun] ensureWorkflowRegistered', err);
    }
  }

  const epicsDir = activeEpicsDir(root);
  const epicDir = path.join(root, epicsDir, runId);
  const note = resolveEpicUserNote(epicDir);
  if (note) {
    try { writeEpicUserNoteFile(epicDir, note); } catch { /* optional */ }
  }

  let rebased = false;
  const state = RunStateStore.load(root, runId) ?? loaded;
  const doc = readYaml(root);
  if (state) {
    const source = doc?.pipelines?.find((p) => String(p.id) === state.pipelineId) as PipelineConfig | undefined;
    if (source) {
      try {
        const next = rebaseRunPipelineSnapshot({ state, sourcePipeline: source });
        if (next.pipelineSnapshot?.hash !== state.pipelineSnapshot?.hash) {
          rebased = true;
          RunStateStore.save(root, next);
          try { mirrorRunStateToEpic(root, next, doc); } catch { /* mirror is best-effort */ }
        }
      } catch (err) {
        console.warn('[prepareDeliveryRun] rebase', err);
      }
    }
  }

  const live = RunStateStore.load(root, runId) ?? state;
  const pipeline = live?.pipelineSnapshot?.pipeline
    ?? (doc?.pipelines?.find((p) => String(p.id) === live?.pipelineId) as PipelineConfig | undefined);
  const current = pipeline && live ? pipeline.steps[live.currentStepIdx] : undefined;
  const norm = current ? normalizeStep(current) : undefined;

  return {
    extraFeedback: extraFeedbackForDeliveryStep({
      epicsDir,
      runId,
      userNote: note,
      pipelineId: live?.pipelineId,
      phaseName: norm?.name,
      producesContains: norm?.produces_contains,
    }),
    rebased,
  };
}
