// BPM field rules. Pure functions; the field itself lives in transportBar.ts.

import { BPM_MAX, BPM_MIN, clamp } from '../model/project';

export const clampBpm = (v: number): number => clamp(v, BPM_MIN, BPM_MAX);

/** Reads what the user typed. Returns a clamped value (two decimals at most), or undefined if it is not a number. */
export function parseBpm(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const v = Number(t);
  if (!Number.isFinite(v)) return undefined;
  return clampBpm(Math.round(v * 100) / 100);
}

/** Arrow key step: 1, or 10 with Shift. `dir` is +1 for up and -1 for down. Clamped to 40..240. */
export function stepBpm(current: number, dir: 1 | -1, shift: boolean): number {
  return clampBpm(Math.round((current + dir * (shift ? 10 : 1)) * 100) / 100);
}
