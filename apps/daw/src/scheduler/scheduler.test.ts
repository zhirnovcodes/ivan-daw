import type { PluginEvent } from 'ivandaw-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Engine } from '../contracts/engine';
import { emptyProject, parseProject } from '../model/project';
import { loadProject, setBpm } from '../store/actions';
import { defaultDeps, deps, provide } from '../store/store';
import { createScheduler, type LiveScheduler, START_DELAY } from './scheduler';

// A fake clock and a fake ticker driven by hand.
let clock = 0;
let tickFns: (() => void)[] = [];
let unlocks = 0;
const engine = {
  context: {} as AudioContext,
  master: {} as AudioNode,
  unlock: async () => {
    unlocks++;
  },
} satisfies Pick<Engine, 'context' | 'unlock' | 'master'>;

let s: LiveScheduler;
let events: PluginEvent[];
let clicks: number[];

const fakeTicker = (_ms: number, tick: () => void) => {
  tickFns.push(tick);
  return {
    stop: () => {
      tickFns = tickFns.filter((f) => f !== tick);
    },
  };
};

/** Advance the clock in 25 ms ticks up to `t`, running the ticker each step. */
function runTo(t: number): void {
  while (clock + 0.025 <= t + 1e-9) {
    clock += 0.025;
    for (const f of tickFns) f();
  }
  clock = t;
}

function make(click = false): void {
  s = createScheduler({
    engine,
    now: () => clock,
    ticker: fakeTicker,
    playClick: click
      ? (t) => {
          clicks.push(t);
          return undefined;
        }
      : undefined,
  });
  s.onEvent((e) => events.push(e));
}

const summary = (e: PluginEvent) => {
  if (e.type === 'transport')
    return { t: e.time, playing: e.state.playing, beat: e.state.beat, bpm: e.state.bpm };
  if (e.type === 'tempo') return { t: e.time, tempo: e.bpm };
  if (e.type === 'midi') return { t: e.time, midi: e.bytes };
  return e;
};

beforeEach(() => {
  clock = 10;
  tickFns = [];
  unlocks = 0;
  events = [];
  clicks = [];
  deps.value = defaultDeps();
  loadProject(emptyProject());
});

afterEach(() => {
  s?.dispose();
});

describe('Play', () => {
  it('awaits unlock, then emits transport {playing, beat 0} at now + 0.05', async () => {
    make();
    await s.play();
    expect(unlocks).toBe(1);
    expect(events.map(summary)).toEqual([
      { t: 10 + START_DELAY, playing: true, beat: 0, bpm: 120 },
    ]);
    expect(s.anchor.value).toMatchObject({ time: 10.05, state: { playing: true, beat: 0 } });
    expect(tickFns).toHaveLength(1);
  });

  it('ignores Play while playing, or a second Play before the first resolves', async () => {
    make();
    await Promise.all([s.play(), s.play()]);
    await s.play();
    expect(events).toHaveLength(1);
    expect(tickFns).toHaveLength(1);
  });

  it('refreshes state.beat on each tick for the UI', async () => {
    make();
    await s.play();
    runTo(10.05 + 1); // 1 s after t0 at 120 BPM
    expect(s.state.value.beat).toBeCloseTo(2, 9);
    expect(s.state.value.playing).toBe(true);
  });
});

describe('Pause and resume', () => {
  it('pause emits transport {playing: false, beat: beatAt(now)} at now, then CC 123', async () => {
    make();
    await s.play();
    runTo(11.3); // 1.25 s after t0 → beat 2.5
    s.pause();
    expect(events.slice(1).map(summary)).toEqual([
      { t: 11.3, playing: false, beat: 2.5, bpm: 120 },
      { t: 11.3, midi: [0xb0, 123, 0] },
    ]);
    expect(tickFns).toHaveLength(0);
    expect(s.state.value).toMatchObject({ playing: false, beat: 2.5 });
  });

  it('resume continues from the paused beat at now + 0.05', async () => {
    make();
    await s.play();
    runTo(11.3);
    s.pause();
    runTo(20);
    await s.play();
    expect(summary(events.at(-1) as PluginEvent)).toEqual({
      t: 20.05,
      playing: true,
      beat: 2.5,
      bpm: 120,
    });
  });

  it('pause while not playing does nothing', () => {
    make();
    s.pause();
    expect(events).toEqual([]);
  });
});

describe('Stop', () => {
  it('emits transport {playing: false, beat: 0} at now, then CC 123', async () => {
    make();
    await s.play();
    runTo(12);
    s.stop();
    expect(events.slice(1).map(summary)).toEqual([
      { t: 12, playing: false, beat: 0, bpm: 120 },
      { t: 12, midi: [0xb0, 123, 0] },
    ]);
    expect(tickFns).toHaveLength(0);
  });

  it('stop while paused rewinds to 0', async () => {
    make();
    await s.play();
    runTo(11.3);
    s.pause();
    s.stop();
    expect(s.state.value).toMatchObject({ playing: false, beat: 0 });
    await s.play();
    expect(s.anchor.value.state.beat).toBe(0);
  });
});

describe('BPM', () => {
  it('emits tempo + transport at now with a new anchor; the beat stays continuous', async () => {
    make();
    await s.play();
    runTo(11.05); // beat 2
    s.setBpm(180);
    expect(events.slice(1).map(summary)).toEqual([
      { t: 11.05, tempo: 180 },
      { t: 11.05, playing: true, beat: 2, bpm: 180 },
    ]);
    runTo(12.05); // 1 s later at 180 BPM → +3 beats
    expect(s.state.value.beat).toBeCloseTo(5, 9);
  });

  it('clamps to 40..240 and ignores repeats and NaN', () => {
    make();
    s.setBpm(500);
    expect(s.state.value.bpm).toBe(240);
    const n = events.length;
    s.setBpm(240);
    s.setBpm(Number.NaN);
    expect(events).toHaveLength(n);
    s.setBpm(1);
    expect(s.state.value.bpm).toBe(40);
  });

  it('a change during the 50 ms before t0 keeps the start time and beat', async () => {
    make();
    await s.play();
    clock = 10.02;
    s.setBpm(60);
    expect(s.anchor.value).toMatchObject({
      time: 10.05,
      state: { beat: 0, bpm: 60, playing: true },
    });
  });

  it('follows the store: setBpm and a loaded project both change the tempo', () => {
    make();
    provide({ scheduler: s });
    const stop = s.attach();
    setBpm(90);
    expect(s.state.value.bpm).toBe(90);
    loadProject(
      parseProject({ ...emptyProject(), transport: { bpm: 150, numerator: 3, denominator: 4 } }),
    );
    expect(s.state.value).toMatchObject({ bpm: 150, numerator: 3, denominator: 4 });
    stop();
  });
});

describe('debug click', () => {
  for (const bpm of [60, 120, 200]) {
    it(`books one click per beat at exact times at ${bpm} BPM, none twice`, async () => {
      loadProject(parseProject({ ...emptyProject(), transport: { bpm } }));
      make(true);
      await s.play();
      runTo(10.05 + 16 * 4 * (60 / bpm)); // 16 bars
      const expected = Array.from({ length: 64 }, (_, n) => 10.05 + (n * 60) / bpm);
      expect(clicks.length).toBeGreaterThanOrEqual(64);
      expect(new Set(clicks).size).toBe(clicks.length);
      expected.forEach((t, i) => {
        expect(clicks[i]).toBeCloseTo(t, 9);
      });
    });
  }

  it('across a BPM change and a pause / resume: even spacing, nothing in the past or doubled', async () => {
    const booked: { at: number; t: number; cancelled: boolean }[] = [];
    s = createScheduler({
      engine,
      now: () => clock,
      ticker: fakeTicker,
      playClick: (t) => {
        const b = { at: clock, t, cancelled: false };
        booked.push(b);
        return {
          time: t,
          cancel: () => {
            if (clock < t) b.cancelled = true;
          },
        };
      },
    });
    await s.play();
    runTo(12); // 120 BPM: beats at 10.05, 10.55, … ; beat 4 is at 12.05
    s.setBpm(180);
    runTo(14);
    s.pause();
    const pausedBeat = s.state.value.beat;
    runTo(15);
    await s.play(); // resume anchor: pausedBeat at 15.05
    runTo(17);
    s.stop();

    // Clicks booked ahead of the pause are cancelled, so nothing sounds after Pause.
    expect(booked.filter((b) => b.cancelled).every((b) => b.t > 14)).toBe(true);
    expect(booked.some((b) => b.cancelled)).toBe(true);
    const times = booked.filter((b) => !b.cancelled).map((b) => b.t);
    for (const b of booked) expect(b.t).toBeGreaterThanOrEqual(b.at - 1e-9); // never in the past
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1] ?? 0);

    const gaps = times.slice(1).map((t, i) => t - (times[i] ?? 0));
    const before = times.filter((t) => t < 12);
    expect(before).toEqual([10.05, 10.55, 11.05, 11.55].map((t) => expect.closeTo(t, 9)));
    // After the tempo change every gap is 1/3 s, except two: the first, because a beat already
    // booked in the 100 ms lookahead keeps its old time (the design's "at most one slightly early
    // or late note"), and the pause.
    const [first, ...after] = gaps.slice(before.length);
    expect(Math.abs((first ?? 0) - 1 / 3)).toBeLessThan(0.1);
    const pauseGaps = after.filter((g) => g > 0.5);
    expect(pauseGaps).toHaveLength(1);
    for (const g of after.filter((g) => g <= 0.5)) expect(g).toBeCloseTo(1 / 3, 9);
    // Nothing between the pause (14) and the resume start (15.05).
    expect(times.filter((t) => t > 14 && t < 15.05)).toEqual([]);
    // The first click after resume is the next whole beat after the paused beat.
    const firstAfter = times.find((t) => t >= 15.05) ?? 0;
    const nextBeat = Math.ceil(pausedBeat);
    expect(firstAfter).toBeCloseTo(15.05 + ((nextBeat - pausedBeat) * 60) / 180, 9);
  });
});

describe('listeners', () => {
  it('unsubscribe stops delivery; a throwing listener does not stop others', async () => {
    make();
    const seen: string[] = [];
    const off = s.onEvent(() => {
      throw new Error('boom');
    });
    s.onEvent((e) => seen.push(e.type));
    const orig = console.error;
    console.error = () => {};
    await s.play();
    console.error = orig;
    off();
    s.stop();
    expect(seen).toEqual(['transport', 'transport', 'midi']);
  });
});
