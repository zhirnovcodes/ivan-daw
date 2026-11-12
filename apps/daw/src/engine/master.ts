// Master: in (summing GainNode) → master gain → AnalyserNode (meter) → speakers.

import { glideTo } from './ramp';

/** Master's fixed gain. The Master node's own `gain` (0..1.5, default 1) multiplies it. */
export const MASTER_GAIN = 0.8;
const FFT_SIZE = 2048;

export interface Master {
  /** The summing point every cable to Master connects into. */
  readonly input: GainNode;
  /** Sets the Master node's volume (0..1.5); the output gain is 0.8 × v. */
  setVolume(v: number): void;
  /** RMS of the last ~43 ms at Master's output. */
  rms(): number;
}

export function createMaster(ctx: AudioContext): Master {
  const input = ctx.createGain();
  const out = ctx.createGain();
  out.gain.value = MASTER_GAIN;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  input.connect(out);
  out.connect(analyser);
  analyser.connect(ctx.destination);
  const buf = new Float32Array(FFT_SIZE);

  return {
    input,
    setVolume(v) {
      glideTo(out.gain, MASTER_GAIN * v, ctx.currentTime);
    },
    rms() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const s of buf) sum += s * s;
      return Math.sqrt(sum / buf.length);
    },
  };
}
