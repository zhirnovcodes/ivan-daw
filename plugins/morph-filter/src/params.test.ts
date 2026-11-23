import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cutoffHz,
  DW_DEFAULT,
  FREQ_DEFAULT,
  filterMix,
  filterRes,
  formatHz,
  ParamTrack,
  SUB_BLOCK,
} from './params';
import { pointerOffset } from './ui';

describe('knob mapping (same as AxolotlPad ParamMap.h)', () => {
  it('D/W drives resonance 0..0.5 and mix 0..0.88', () => {
    expect(filterRes(0)).toBe(0);
    expect(filterRes(1)).toBe(0.5);
    expect(filterRes(0.5)).toBe(0.25);
    expect(filterMix(0)).toBe(0);
    expect(filterMix(1)).toBeCloseTo(0.88);
    expect(filterMix(Number.NaN)).toBe(0);
    expect(filterRes(2)).toBe(0.5);
  });

  it('FREQ is 20 Hz .. 20 kHz on a log scale', () => {
    expect(cutoffHz(0)).toBeCloseTo(20);
    expect(cutoffHz(0.5)).toBeCloseTo(632.46, 1);
    expect(cutoffHz(1)).toBeCloseTo(20000);
    expect(formatHz(0)).toBe('20 Hz');
    expect(formatHz(1)).toBe('20.0 kHz');
  });
});

describe('ParamTrack', () => {
  const rate = 48000;

  it('starts at the defaults', () => {
    const s = new ParamTrack(rate).next(0);
    expect(s.position).toBe(FREQ_DEFAULT);
    expect(s.res).toBeCloseTo(filterRes(DW_DEFAULT));
    expect(s.mix).toBeCloseTo(filterMix(DW_DEFAULT));
  });

  it('applies an event at its frame, not before', () => {
    const t = new ParamTrack(rate);
    t.post({ frame: 100, id: 'freq', value: 0.9 });
    expect(t.next(96).position).toBe(FREQ_DEFAULT);
    expect(t.next(112).position).toBe(0.9);
  });

  it('applies out-of-order events in frame order', () => {
    const t = new ParamTrack(rate);
    t.post({ frame: 64, id: 'freq', value: 0.2 });
    t.post({ frame: 32, id: 'freq', value: 0.7 });
    expect(t.next(32).position).toBe(0.7);
    expect(t.next(64).position).toBe(0.2);
  });

  it('glides D/W over about 5 ms instead of jumping', () => {
    const t = new ParamTrack(rate);
    t.post({ frame: 0, id: 'dw', value: 0 });
    const first = t.next(0).mix;
    expect(first).toBeGreaterThan(0); // not there yet
    expect(first).toBeLessThan(filterMix(1));
    let s = t.next(0);
    for (let f = SUB_BLOCK; f < rate * 0.05; f += SUB_BLOCK) s = t.next(f);
    expect(s.mix).toBe(0); // there after 50 ms
    expect(s.res).toBe(0);
  });
});

describe('knob pointer', () => {
  it('matches the design at the minimum and sweeps 270 degrees', () => {
    const min = pointerOffset(0);
    expect(min.x).toBeCloseTo(-6);
    expect(min.y).toBeCloseTo(7);
    const max = pointerOffset(1); // 270 degrees clockwise: bottom-right
    expect(max.x).toBeCloseTo(7);
    expect(max.y).toBeCloseTo(6);
    const mid = pointerOffset(0.5); // about the top
    expect(mid.y).toBeLessThan(-9);
    expect(Math.abs(mid.x)).toBeLessThan(1);
  });
});

// The committed wasm itself: ivan-daw-engine-core's Filter behind cpp/abi.cpp.
describe('prebuilt morph-filter.wasm', async () => {
  const bytes = readFileSync(resolve(import.meta.dirname, '../prebuilt/morph-filter.wasm'));
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: { emscripten_notify_memory_growth: () => {} },
  });
  const abi = instance.exports as unknown as {
    memory: WebAssembly.Memory;
    _initialize(): void;
    mf_create(rate: number): number;
    mf_destroy(i: number): void;
    mf_set(i: number, position: number, res: number, mix: number): void;
    mf_left(i: number): number;
    mf_right(i: number): number;
    mf_process(i: number, offset: number, frames: number): void;
  };
  abi._initialize();
  const rate = 48000;

  /** RMS of a sine at `hz` after 0.5 s through the filter, over the last 0.1 s. */
  function rmsThrough(hz: number, dw: number, freq: number): number {
    const inst = abi.mf_create(rate);
    const left = new Float32Array(abi.memory.buffer, abi.mf_left(inst), 128);
    const right = new Float32Array(abi.memory.buffer, abi.mf_right(inst), 128);
    const blocks = Math.round((rate * 0.5) / 128);
    let sum = 0;
    let count = 0;
    for (let b = 0; b < blocks; b++) {
      for (let f = 0; f < 128; f++) {
        const v = Math.sin((2 * Math.PI * hz * (b * 128 + f)) / rate);
        left[f] = v;
        right[f] = v;
      }
      abi.mf_set(inst, freq, filterRes(dw), filterMix(dw));
      abi.mf_process(inst, 0, 128);
      if (b >= blocks - Math.round((rate * 0.1) / 128)) {
        for (let f = 0; f < 128; f++) {
          sum += (left[f] as number) ** 2;
          count++;
        }
      }
    }
    abi.mf_destroy(inst);
    return Math.sqrt(sum / count);
  }

  const sineRms = Math.SQRT1_2;

  it('D/W 0 passes the input through', () => {
    expect(rmsThrough(1000, 0, 0)).toBeCloseTo(sineRms, 3);
  });

  it('FREQ 0 is a low-pass: 5 kHz drops to the dry 12%', () => {
    expect(rmsThrough(5000, 1, 0)).toBeCloseTo(sineRms * 0.12, 2);
  });

  it('FREQ 1 is a high-pass: 100 Hz drops to the dry 12%', () => {
    expect(rmsThrough(100, 1, 1)).toBeCloseTo(sineRms * 0.12, 2);
  });

  it('FREQ 0.5 is a band-pass around 632 Hz', () => {
    const centre = rmsThrough(632, 1, 0.5);
    expect(centre).toBeGreaterThan(sineRms * 0.9);
    expect(rmsThrough(50, 1, 0.5)).toBeLessThan(centre * 0.4);
    expect(rmsThrough(10000, 1, 0.5)).toBeLessThan(centre * 0.4);
  });
});
