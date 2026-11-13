import type { PluginEvent, TransportState } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import { AHEAD, createLfo, PERIOD_BEATS, wave } from './lfo';

const state = (playing: boolean, beat: number, bpm = 120): TransportState => ({
  playing,
  bpm,
  beat,
  numerator: 4,
  denominator: 4,
  loop: null,
});

function setup() {
  let now = 0;
  let tick: (() => void) | null = null;
  let tickers = 0;
  const out: Extract<PluginEvent, { type: 'automation' }>[] = [];
  const lfo = createLfo({
    now: () => now,
    tickMs: 25,
    createTicker(_ms, t) {
      tick = t;
      tickers++;
      return {
        stop: () => {
          tick = null;
        },
      };
    },
    emit: (e) => {
      if (e.type === 'automation') out.push(e);
    },
  });
  return {
    lfo,
    out,
    tickers: () => tickers,
    /** Advances the clock in 25 ms ticks. */
    run(seconds: number) {
      const steps = Math.round(seconds / 0.025);
      for (let i = 0; i < steps; i++) {
        now += 0.025;
        tick?.();
      }
    },
  };
}

describe('wave', () => {
  it('is 0 on the bar line, 1 half way, with a period of 4 beats', () => {
    expect(wave(0)).toBeCloseTo(0, 12);
    expect(wave(2)).toBeCloseTo(1, 12);
    expect(wave(1)).toBeCloseTo(0.5, 12);
    expect(wave(PERIOD_BEATS)).toBeCloseTo(0, 12);
    expect(wave(5)).toBeCloseTo(wave(1), 12);
  });
});

describe('LFO', () => {
  it('sends one value per tick while playing, stamped ahead, times strictly increasing', () => {
    const s = setup();
    s.lfo.schedule([{ type: 'transport', time: 0, state: state(true, 0) }]);
    s.run(1);
    expect(s.out.length).toBe(41);
    for (let i = 1; i < s.out.length; i++) {
      expect((s.out[i]?.time ?? 0) > (s.out[i - 1]?.time ?? 0)).toBe(true);
    }
    // At 120 BPM, 1 s is 2 beats: the value at t follows wave(2t).
    const last = s.out.at(-1);
    expect(last?.time).toBeCloseTo(1 + AHEAD, 9);
    expect(last?.value).toBeCloseTo(wave((1 + AHEAD) * 2), 9);
    expect(last?.port).toBe('out');
  });

  it('follows a BPM change without a jump in phase', () => {
    const s = setup();
    s.lfo.schedule([{ type: 'transport', time: 0, state: state(true, 0, 120) }]);
    s.run(0.5); // now = 0.5 s, beat 1
    const before = s.out.at(-1)?.value ?? 0;
    // New anchor at now: the beat continues, the speed doubles.
    s.lfo.schedule([{ type: 'transport', time: 0.5, state: state(true, 1, 240) }]);
    s.run(0.025);
    // The first value after the change continues from beat 1 at the new speed (4 beats / s).
    expect(before).toBeCloseTo(wave((0.5 + AHEAD) * 2), 9);
    expect(s.out.at(-1)?.value).toBeCloseTo(wave(1 + (0.525 + AHEAD - 0.5) * 4), 9);
    s.run(0.475); // now = 1 s: 0.5 s at 240 BPM is 2 more beats
    expect(s.out.at(-1)?.value).toBeCloseTo(wave(3 + AHEAD * 4), 9);
    expect(s.tickers()).toBe(1);
  });

  it('holds still while stopped: one value at the stop beat, then nothing', () => {
    const s = setup();
    s.lfo.schedule([{ type: 'transport', time: 0, state: state(true, 0) }]);
    s.run(0.5);
    s.lfo.schedule([{ type: 'transport', time: 0.5, state: state(false, 0) }]);
    const n = s.out.length;
    expect(s.out.at(-1)?.value).toBeCloseTo(wave(0), 12);
    s.run(1);
    expect(s.out.length).toBe(n);
  });
});
