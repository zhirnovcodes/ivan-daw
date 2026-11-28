// Recording Master to MP3 (2026-11-28): the pure parts, shared by the recorder and its encoder worker.
//   AudioWorklet on Master's output → chunks of stereo floats → Web Worker (LAME, wasm-media-encoders) → MP3.
// Nothing leaves the browser: the MP3 is a Blob the user downloads.

/** Longest recording. The worklet counts frames, so the cut is sample-exact. */
export const RECORD_MAX_SECONDS = 300;
/** MP3 constant bitrate, kbps: about 7.2 MB for 5 minutes. */
export const MP3_BITRATE = 192;
/** Fade at the very start and end of the file, so it never begins or ends on a click. */
export const RECORD_FADE_SECONDS = 0.01;

/** Main thread → encoder worker. */
export type EncoderIn =
  | { type: 'init'; sampleRate: number }
  | { type: 'chunk'; l: Float32Array; r: Float32Array }
  | { type: 'finish' };
/** Encoder worker → main thread. */
export type EncoderOut = { type: 'mp3'; blob: Blob } | { type: 'error'; message: string };

/** Worklet → main thread. `done` comes after the last chunk. */
export type WorkletOut =
  | { type: 'chunk'; l: Float32Array; r: Float32Array }
  | { type: 'done'; reason: 'stop' | 'limit'; frames: number };

const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000] as const;
export type Mp3Rate = (typeof MP3_RATES)[number];

/** The MP3 sample rate for a context rate. MP3 tops out at 48 kHz; LAME resamples 88.2 / 96 kHz and the like. */
export function mp3OutputRate(contextRate: number): Mp3Rate {
  const same = MP3_RATES.find((r) => r === contextRate);
  if (same !== undefined) return same;
  return contextRate % 44100 === 0 ? 44100 : 48000;
}

const concat = (a: Float32Array, b: Float32Array): Float32Array => {
  if (a.length === 0) return b;
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

export interface Fader {
  /** Takes the next chunk (it may be changed in place). Returns what can be encoded now. */
  push(l: Float32Array, r: Float32Array): [Float32Array, Float32Array];
  /** The held-back tail, faded to silence. */
  finish(): [Float32Array, Float32Array];
}

/**
 * Fades the first `frames` frames in and the last `frames` out. The end isn't known until
 * `finish()`, so the last `frames` frames are always held back.
 */
export function createFader(frames: number): Fader {
  let seen = 0;
  let tailL = new Float32Array(0);
  let tailR = new Float32Array(0);
  return {
    push(l, r) {
      for (let i = 0; i < l.length && seen + i < frames; i++) {
        const g = (seen + i) / frames;
        l[i] = (l[i] ?? 0) * g;
        r[i] = (r[i] ?? 0) * g;
      }
      seen += l.length;
      const L = concat(tailL, l);
      const R = concat(tailR, r);
      const cut = Math.max(0, L.length - frames);
      tailL = L.slice(cut);
      tailR = R.slice(cut);
      return [L.subarray(0, cut), R.subarray(0, cut)];
    },
    finish() {
      const n = tailL.length;
      for (let i = 0; i < n; i++) {
        const g = (n - 1 - i) / n;
        tailL[i] = (tailL[i] ?? 0) * g;
        tailR[i] = (tailR[i] ?? 0) * g;
      }
      const out: [Float32Array, Float32Array] = [tailL, tailR];
      tailL = new Float32Array(0);
      tailR = new Float32Array(0);
      return out;
    },
  };
}
