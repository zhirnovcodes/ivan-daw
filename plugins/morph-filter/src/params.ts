// The two knobs and everything derived from them. Pure, so the worklet, the UI and the tests share it.
//
// Same mapping as AxolotlPad's per-oscillator filter (core/domain/ParamMap.h):
//   D/W  -> res = lerp(0, 0.5, dw), mix = dw * 0.88
//   FREQ -> filterPosition, 0..1 on a log scale (20 Hz .. 20 kHz), morphing LP -> BP -> HP.

export type ParamId = 'dw' | 'freq';

export const DW_DEFAULT = 1;
export const FREQ_DEFAULT = 0.5;

/** One-pole glide on D/W, so a jump in mix or resonance never clicks. Position glides inside the C++ filter. */
export const DW_GLIDE_S = 0.005;

/** The worklet updates the filter params every this many frames. */
export const SUB_BLOCK = 16;

export const clamp01 = (v: number): number => (v > 0 ? Math.min(v, 1) : 0); // NaN -> 0

export const filterRes = (dw: number): number => 0.5 * clamp01(dw);
export const filterMix = (dw: number): number => clamp01(dw) * 0.88;

/** Cutoff for a FREQ position: ivan-daw-engine-core's FilterCutoffHz. */
export const cutoffHz = (pos: number): number => 20 * 1000 ** clamp01(pos);

export function formatHz(pos: number): string {
  const hz = cutoffHz(pos);
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz` : `${Math.round(hz)} Hz`;
}

export const formatPercent = (v: number): string => `${Math.round(clamp01(v) * 100)}%`;

export interface ParamEvent {
  frame: number; // AudioContext frame
  id: ParamId;
  value: number;
}

export interface FilterSettings {
  position: number;
  res: number;
  mix: number;
}

/**
 * Knob values on the audio thread: queued events applied at their frame (to SUB_BLOCK accuracy)
 * and the D/W glide. No allocation in `next()`.
 */
export class ParamTrack {
  private readonly queue: ParamEvent[] = [];
  private dwTarget = DW_DEFAULT;
  private dw = DW_DEFAULT;
  private freq = FREQ_DEFAULT;
  private readonly glide: number;
  private readonly out: FilterSettings = { position: FREQ_DEFAULT, res: 0, mix: 0 };

  constructor(sampleRate: number) {
    this.glide = 1 - Math.exp(-SUB_BLOCK / (DW_GLIDE_S * sampleRate));
  }

  post(e: ParamEvent): void {
    // Keep the queue in frame order; same-frame events stay in arrival order.
    let i = this.queue.length;
    while (i > 0 && (this.queue[i - 1] as ParamEvent).frame > e.frame) i--;
    this.queue.splice(i, 0, e);
  }

  /** The settings for the sub-block that starts at `frame`. */
  next(frame: number): FilterSettings {
    while (this.queue.length > 0 && (this.queue[0] as ParamEvent).frame <= frame) {
      const e = this.queue.shift() as ParamEvent;
      if (e.id === 'dw') this.dwTarget = clamp01(e.value);
      else this.freq = clamp01(e.value);
    }
    this.dw += (this.dwTarget - this.dw) * this.glide;
    if (Math.abs(this.dwTarget - this.dw) < 1e-4) this.dw = this.dwTarget; // -80 dB: inaudible
    this.out.position = this.freq;
    this.out.res = filterRes(this.dw);
    this.out.mix = filterMix(this.dw);
    return this.out;
  }
}
