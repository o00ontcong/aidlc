// v3/lib/tone.ts — Tone -> CSS var mapping. Never hex, only token names.

import type { Tone } from '../data/types';

export const TONE_COLOR: Record<Tone, string> = {
  acc: 'var(--acc)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  muted: 'var(--txt3)',
  txt: 'var(--txt)',
  track: 'var(--track)',
};

export const TONE_BG: Record<Tone, string> = {
  acc: 'var(--acc-bg)',
  warn: 'var(--warn-bg)',
  err: 'var(--err-bg)',
  muted: 'var(--hover)',
  txt: 'var(--hover)',
  track: 'var(--track)',
};

export const TONE_BORDER: Record<Tone, string> = {
  acc: 'var(--acc-bd)',
  warn: 'var(--warn-bd)',
  err: 'var(--err-bd)',
  muted: 'var(--bd)',
  txt: 'var(--bd)',
  track: 'var(--bd)',
};

export function toneColor(tone: Tone): string { return TONE_COLOR[tone]; }
export function toneBg(tone: Tone): string { return TONE_BG[tone]; }
export function toneBorder(tone: Tone): string { return TONE_BORDER[tone]; }
