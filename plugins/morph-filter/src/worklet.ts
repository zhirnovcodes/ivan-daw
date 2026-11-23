// AudioWorkletProcessor for the morph filter. The DSP is ivan-daw-engine-core's Filter, compiled to
// morph-filter.wasm (cpp/abi.cpp). This file moves samples in and out and feeds it the knob values.
// vite.config.ts bundles it to dist/worklet.js.

import { PROCESSOR_NAME } from './manifest';
import { type ParamEvent, ParamTrack, SUB_BLOCK } from './params';

declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

type Message =
  | { type: 'init'; wasm: ArrayBuffer }
  | { type: 'params'; events: ParamEvent[] }
  | { type: 'reset' }
  | { type: 'dispose' };

interface Abi {
  memory: WebAssembly.Memory;
  _initialize(): void;
  mf_create(rate: number): number;
  mf_destroy(inst: number): void;
  mf_set(inst: number, position: number, res: number, mix: number): void;
  mf_reset(inst: number): void;
  mf_left(inst: number): number;
  mf_right(inst: number): number;
  mf_process(inst: number, offset: number, frames: number): void;
}

const MAX_FRAMES = 128;

class MorphFilterProcessor extends AudioWorkletProcessor {
  private readonly params = new ParamTrack(sampleRate);
  private abi: Abi | null = null;
  private inst = 0;
  private heap: ArrayBuffer | null = null;
  private left = new Float32Array(0);
  private right = new Float32Array(0);
  private disposed = false;

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent<Message>) => {
      const m = ev.data;
      if (m.type === 'init') void this.init(m.wasm);
      else if (m.type === 'params') for (const e of m.events) this.params.post(e);
      else if (m.type === 'reset') {
        if (this.abi) this.abi.mf_reset(this.inst);
      } else if (m.type === 'dispose') this.dispose();
    };
  }

  private async init(bytes: ArrayBuffer): Promise<void> {
    try {
      const { instance } = await WebAssembly.instantiate(bytes, {
        env: { emscripten_notify_memory_growth: () => {} },
      });
      const abi = instance.exports as unknown as Abi;
      abi._initialize();
      const inst = abi.mf_create(sampleRate);
      if (!inst) throw new Error('mf_create failed');
      if (this.disposed) {
        abi.mf_destroy(inst);
        return;
      }
      this.abi = abi;
      this.inst = inst;
      this.port.postMessage({ type: 'ready' });
    } catch (e) {
      this.port.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  /** The wasm block buffers. Rebuilt when memory grows (the old views detach). */
  private views(abi: Abi): void {
    if (this.heap === abi.memory.buffer) return;
    this.heap = abi.memory.buffer;
    this.left = new Float32Array(this.heap, abi.mf_left(this.inst), MAX_FRAMES);
    this.right = new Float32Array(this.heap, abi.mf_right(this.inst), MAX_FRAMES);
  }

  private dispose(): void {
    this.disposed = true;
    if (this.abi && this.inst) this.abi.mf_destroy(this.inst);
    this.abi = null;
    this.inst = 0;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.disposed) return false;
    const out = outputs[0];
    const outL = out?.[0];
    if (!out || !outL) return true;
    const abi = this.abi;
    if (!abi) return true; // not loaded yet: outputs stay silent
    const n = Math.min(outL.length, MAX_FRAMES);
    this.views(abi);

    // No cable in: zeros, so the filter rings out on its own.
    const input = inputs[0];
    const inL = input?.[0];
    const inR = input?.[1] ?? inL; // mono in -> both sides
    if (inL && inR) {
      this.left.set(inL.subarray(0, n));
      this.right.set(inR.subarray(0, n));
    } else {
      this.left.fill(0, 0, n);
      this.right.fill(0, 0, n);
    }

    for (let off = 0; off < n; off += SUB_BLOCK) {
      const s = this.params.next(currentFrame + off);
      abi.mf_set(this.inst, s.position, s.res, s.mix);
      abi.mf_process(this.inst, off, Math.min(SUB_BLOCK, n - off));
    }

    outL.set(this.left.subarray(0, n));
    const outR = out[1];
    if (outR) outR.set(this.right.subarray(0, n));
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, MorphFilterProcessor);
