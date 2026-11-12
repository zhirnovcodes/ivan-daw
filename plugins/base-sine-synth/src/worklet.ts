// AudioWorkletProcessor for the base sine synth. All sound comes from dsp.ts; this file only
// moves messages in and samples out. vite.config.ts bundles it, with ivandaw-core, to dist/worklet.js.

import { SineSynth, type SynthEvent } from './dsp';
import { PROCESSOR_NAME } from './manifest';

// The worklet global scope is not in the DOM typings.
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

type Message = { type: 'events'; events: SynthEvent[] };

class SineSynthProcessor extends AudioWorkletProcessor {
  private readonly synth = new SineSynth(sampleRate);
  private mono = new Float32Array(128);

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent<Message>) => {
      if (ev.data.type === 'events') for (const e of ev.data.events) this.synth.post(e);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const left = out?.[0];
    if (!out || !left) return true;
    const n = left.length;
    if (this.mono.length < n) this.mono = new Float32Array(n);
    this.synth.render(this.mono, n, currentFrame);
    left.set(this.mono.subarray(0, n));
    for (let c = 1; c < out.length; c++) (out[c] as Float32Array).set(this.mono.subarray(0, n));
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, SineSynthProcessor);
