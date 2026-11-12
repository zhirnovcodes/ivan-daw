// Pure text helpers for the panels. No DOM.

/** Gain at or below this reads as silence. -80 dB. */
const SILENT = 0.0001;

/** 20·log10(gain), or -Infinity for silence. */
export function gainToDb(gain: number): number {
  return gain <= SILENT ? Number.NEGATIVE_INFINITY : 20 * Math.log10(gain);
}

/** "-6.0 dB", "0.0 dB", "+3.5 dB", "-∞ dB". Used for the volume slider and for level-type values. */
export function formatDb(gain: number): string {
  const db = gainToDb(gain);
  if (!Number.isFinite(db)) return '-∞ dB';
  const r = Math.round(db * 10) / 10;
  const text = Math.abs(r).toFixed(1);
  if (r > 0) return `+${text} dB`;
  return r < 0 ? `-${text} dB` : `${text} dB`;
}

/** Pan: "C", "L40", "R25". */
export function formatPan(pan: number): string {
  const pct = Math.round(Math.abs(pan) * 100);
  if (pct === 0) return 'C';
  return `${pan < 0 ? 'L' : 'R'}${pct}`;
}

/** The `bar.beat` readout, both 1-based: beat 0 of a 4/4 project is "1.1", beat 6.5 is "2.3". */
export function formatBeat(beat: number, numerator: number): string {
  const n = Math.max(1, Math.floor(numerator) || 4);
  const b = Number.isFinite(beat) ? Math.max(0, beat) : 0;
  const whole = Math.floor(b);
  return `${Math.floor(whole / n) + 1}.${(whole % n) + 1}`;
}
