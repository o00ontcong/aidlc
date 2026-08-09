/**
 * Canonical Stage identifiers for the adaptive five-stage SDLC model (design
 * doc §3, TODO W1E "Canonical stage IDs: Understand, Plan, Build, Verify,
 * Ship"). This is a closed vocabulary — every workflow profile (Quick /
 * Standard / Parallel / Regulated, design doc §3.1) is compiled from a
 * subset of these five; there is no mechanism for a workflow pack to invent
 * a sixth top-level stage id. New *actions* inside a stage are how packs
 * extend behavior without growing the stage list (design doc §2.3).
 *
 * Lives in its own tiny module (rather than folded into `stage.ts` or
 * `epic.ts`) so both `autonomy.ts` (per-stage autonomy overrides) and
 * `stage.ts` (the `Stage`/`Action` data shapes) can depend on it without
 * creating an import cycle between those two.
 */

import { z } from 'zod';

export const STAGE_IDS = ['understand', 'plan', 'build', 'verify', 'ship'] as const;

export const StageIdSchema = z.enum(STAGE_IDS);
export type StageId = z.infer<typeof StageIdSchema>;

export function isStageId(value: string): value is StageId {
  return (STAGE_IDS as readonly string[]).includes(value);
}

/** Display labels — cosmetic only; UI/CLI may localize further. */
export const STAGE_LABELS: Readonly<Record<StageId, string>> = Object.freeze({
  understand: 'Understand',
  plan: 'Plan',
  build: 'Build',
  verify: 'Verify',
  ship: 'Ship',
});
