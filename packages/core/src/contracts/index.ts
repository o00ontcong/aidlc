/**
 * Barrel for the unified AIDLC domain contracts (design doc + TODO "W0 —
 * Domain contracts va architecture skeleton").
 *
 * This barrel is scoped to `contracts/**` only. Wiring these types into the
 * public `@aidlc/core` package export (`packages/core/src/index.ts`) is a
 * later, separate integration task (TODO W1I) — later lanes may import
 * directly from `../contracts` (or from this barrel) inside
 * `packages/core/src`, but re-exporting it from the package root is
 * explicitly out of scope for W0.
 */

export * from './ids';
export * from './stageId';
export * from './common';
export * from './errors';
export * from './model';
export * from './autonomy';
export * from './stage';
export * from './epic';
export * from './run';
export * from './command';
export * from './project';
export * from './foundation';
export * from './shape';
export * from './artifact';
export * from './capability';
