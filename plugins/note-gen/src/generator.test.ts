import { type PluginEvent, TICK_MS, type TransportState } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import { createGenerator } from './generator';

type Midi = Extract<PluginEvent, { type: 'midi' }>;

const state = (over: Partial<TransportState>): TransportState => ({
  playing: true,
  bpm: 120,
  beat: 0,
  numerator: 4,
  denominator: 4,
  loop: null,
  ...over,
});

/** A fake audio clock plus a fake ticker that fires every TICK_MS of fake time. */
function rig() {
  let now = 0;
  let tickFn: (() => void) | null = null;
  let tickers = 0;
  const out: Midi[] = [];
  const gen = createGenerator({
    now: () => now,
    tickMs: TICK_MS,
    createTicker(_ms, tick) {
      tickers++;
      tickFn = tick;
      return {
        stop() {
          if (tickFn === tick) tickFn = null;
        },
      };
    },
    emit: (e) => out.push(e as Midi),
  });
  return {
    out,
    gen,
    get now() {
      return now;
    },
    get running() {
      return tickFn !== null;
    },
    get tickersStarted() {
      return tickers;
    },
    /** Run the clock forward `seconds`, ticking every TICK_MS. */
    run(seconds: number) {
      const steps = Math.round((seconds * 1000) / TICK_MS);
      for (let i = 0; i < steps; i++) {
        now += TICK_MS / 1000;
        tickFn?.();
      }
    },
    /** The clock jumps without any tick: a frozen page. */
    freeze(seconds: number) {
      now += seconds;
    },
    tick: () => tickFn?.(),
    transport(s: TransportState, time = now) {
      gen.schedule([{ type: 'transport', time, state: s }]);
    },
  };
}

const ons = (out: Midi[]) => out.filter((e) => e.bytes[0] === 0x90);
const offs = (out: Midi[]) => out.filter((e) => e.bytes[0] === 0x80);

describe('note generator', () => {
  for (const bpm of [60, 120, 200]) {
    it(`emits one note on and one note off per beat over 16 bars at ${bpm} BPM`, () => {
      const r = rig();
      const t0 = 0.05;
      r.transport(state({ bpm }), t0);
      const beats = 16 * 4;
      const spb = 60 / bpm;
      r.run(t0 + beats * spb + 0.5);
      const on = ons(r.out).filter((e) => e.time < t0 + beats * spb - 1e-6);
      const off = offs(r.out).filter((e) => e.time < t0 + (beats - 0.5) * spb + 1e-6);
      expect(on).toHaveLength(beats);
      expect(off).toHaveLength(beats);
      on.forEach((e, n) => {
        expect(e.bytes).toEqual([0x90, 60, 100]);
        expect(e.time).toBeCloseTo(t0 + n * spb, 9);
      });
      off.forEach((e, n) => {
        expect(e.bytes).toEqual([0x80, 60, 0]);
        expect(e.time).toBeCloseTo(t0 + (n + 0.5) * spb, 9);
      });
      // Nothing is emitted twice: every note-on time is unique.
      expect(new Set(ons(r.out).map((e) => e.time.toFixed(9))).size).toBe(ons(r.out).length);
    });
  }

  it('keeps one note per beat across a BPM change mid-bar', () => {
    const r = rig();
    r.transport(state({ bpm: 120 }), 0.05);
    r.run(0.05 + 1.25); // beat 2.4 at 120 BPM
    const at = r.now;
    const beatNow = ((at - 0.05) * 120) / 60;
    r.transport(state({ bpm: 200, beat: beatNow }), at);
    r.run(3);
    const on = ons(r.out);
    const beats = on.map((e) => e.time);
    // Strictly increasing times, never closer than a beat at 200 BPM minus rounding.
    for (let i = 1; i < beats.length; i++) {
      const prev = beats[i - 1] as number;
      const cur = beats[i] as number;
      expect(cur).toBeGreaterThan(prev);
      expect(cur - prev).toBeGreaterThan(0.3 - 0.11); // allows the single note queued at the old spacing
    }
    // One off per on, and exactly as many notes as whole beats passed.
    const lastTime = beats[beats.length - 1] as number;
    expect(offs(r.out)).toHaveLength(on.length);
    const beatOfLast = beatNow + (lastTime - at) * (200 / 60);
    expect(on.length).toBeGreaterThanOrEqual(
      Math.floor(beatNow) + 1 + Math.floor(beatOfLast - beatNow) - 1,
    );
    // Beat numbers are consecutive: no beat is doubled or skipped.
    const first = on.length;
    expect(first).toBe(Math.round(beatOfLast) + 1);
  });

  it('resumes from pause at the next whole beat', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    r.run(0.05 + 1.75); // 3.5 beats in
    const pausedBeat = ((r.now - 0.05) * 120) / 60;
    r.transport(state({ playing: false, beat: pausedBeat }), r.now);
    expect(r.running).toBe(false);
    const count = ons(r.out).length;
    expect(count).toBeGreaterThanOrEqual(3);
    r.run(2);
    expect(ons(r.out)).toHaveLength(count); // silent while paused
    const resumeAt = r.now + 0.05;
    r.transport(state({ playing: true, beat: pausedBeat }), resumeAt);
    r.run(2);
    const first = ons(r.out)[count] as Midi;
    const lastBeforePause = count - 1;
    const nextBeat = Math.floor(pausedBeat) + 1;
    expect(nextBeat).toBeGreaterThan(lastBeforePause);
    expect(first.time).toBeCloseTo(resumeAt + (nextBeat - pausedBeat) * 0.5, 9);
  });

  it('starts on beat 0 again after Stop and Play', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    r.run(0.5);
    r.transport(state({ playing: false, beat: 0 }), r.now);
    const at = r.now + 0.05;
    r.transport(state({ beat: 0 }), at);
    r.run(0.2);
    expect(ons(r.out).at(-1)?.time).toBeCloseTo(at, 9);
  });

  it('closes an open note at the stop time on Stop', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    r.run(0.05 + 0.1); // beat 0 sounding (off at 0.3)
    const stopAt = r.now;
    expect(stopAt).toBeLessThan(0.3);
    r.out.length = 0;
    r.transport(state({ playing: false, beat: 0 }), stopAt);
    expect(r.running).toBe(false);
    expect(r.out).toHaveLength(1);
    expect(r.out[0]?.bytes).toEqual([0x80, 60, 0]);
    expect(r.out[0]?.time).toBe(stopAt);
    r.run(2);
    expect(r.out).toHaveLength(1);
  });

  it('closes an open note at the stop time on CC 123, and only once', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    r.run(0.15);
    const stopAt = r.now;
    r.out.length = 0;
    r.gen.schedule([{ type: 'midi', time: stopAt, bytes: [0xb0, 123, 0] }]);
    expect(r.running).toBe(false);
    expect(r.out.map((e) => [e.bytes, e.time])).toEqual([[[0x80, 60, 0], stopAt]]);
    // The Stop transport that follows the CC adds nothing: no note is open any more.
    r.transport(state({ playing: false, beat: 0 }), stopAt);
    expect(r.out).toHaveLength(1);
  });

  it('emits no note off on Stop when no note is open', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    r.run(0.05 + 0.4); // off of beat 0 was at 0.3, beat 1 at 0.55 is not booked yet
    r.out.length = 0;
    r.transport(state({ playing: false, beat: 0 }), r.now);
    expect(r.out).toHaveLength(0);
  });

  it('skips missed beats after a 500 ms freeze instead of playing them together', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    r.run(0.4);
    const before = ons(r.out).length;
    r.freeze(0.5); // 1 beat at 120 BPM would fit twice over
    r.tick();
    r.run(1);
    const after = ons(r.out).slice(before);
    expect(after.length).toBeGreaterThan(0);
    // Nothing booked in the past, nothing booked together.
    expect(after[0]?.time as number).toBeGreaterThanOrEqual(0.4 + 0.5);
    for (let i = 1; i < after.length; i++) {
      expect((after[i]?.time as number) - (after[i - 1]?.time as number)).toBeCloseTo(0.5, 9);
    }
    // And the missed beats are gone: the beats played are not consecutive across the freeze.
    const all = ons(r.out).map((e) => Math.round((e.time - 0.05) * 2));
    expect(all.length - new Set(all).size).toBe(0);
    expect(all.some((b, i) => i > 0 && b - (all[i - 1] as number) > 1)).toBe(true);
  });

  it('does not double a note when ticks overlap', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    // Many ticks at the same moment and at tiny steps inside one lookahead window.
    for (let i = 0; i < 5; i++) r.tick();
    r.run(0.05);
    for (let i = 0; i < 5; i++) r.tick();
    expect(ons(r.out)).toHaveLength(1);
    expect(offs(r.out)).toHaveLength(1);
  });

  it('starts a single ticker for repeated transport events and stops it on dispose', () => {
    const r = rig();
    r.transport(state({}), 0.05);
    r.transport(state({ bpm: 90, beat: 0 }), 0.05);
    expect(r.tickersStarted).toBe(1);
    r.gen.dispose();
    expect(r.running).toBe(false);
    r.out.length = 0;
    r.run(1);
    expect(r.out).toHaveLength(0);
  });
});
