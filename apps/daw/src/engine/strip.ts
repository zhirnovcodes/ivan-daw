// Strip: a node's main audio out → GainNode (volume) → StereoPannerNode (pan) → wherever the router connects it.

import type { Strip } from '../contracts/engine';
import { glideTo, REMOVE_FADE, rampTo } from './ramp';

export interface LiveStrip extends Strip {
  setGain(v: number): void;
  setPan(v: number): void;
  /** Ramps the volume to 0 over 10 ms. */
  fadeOut(): void;
  /** Disconnects both nodes from everything. */
  disconnect(): void;
}

export function createStrip(ctx: AudioContext, gain: number, pan: number): LiveStrip {
  const input = ctx.createGain();
  const output = ctx.createStereoPanner();
  input.gain.value = gain;
  output.pan.value = pan;
  input.connect(output);
  return {
    input,
    output,
    setGain(v) {
      glideTo(input.gain, v, ctx.currentTime);
    },
    setPan(v) {
      glideTo(output.pan, v, ctx.currentTime);
    },
    fadeOut() {
      rampTo(input.gain, 0, ctx.currentTime, REMOVE_FADE);
    },
    disconnect() {
      input.disconnect();
      output.disconnect();
    },
  };
}
