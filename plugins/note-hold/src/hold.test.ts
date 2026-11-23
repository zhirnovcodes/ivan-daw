import { NOTE, noteOff, noteOn, type PluginEvent, type TransportState } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import { createHold, noteName, toNote, VELOCITY } from './hold';

const state = (playing: boolean, beat = 0): TransportState => ({
  playing,
  bpm: 120,
  beat,
  numerator: 4,
  denominator: 4,
  loop: null,
});
const transport = (time: number, playing: boolean, beat = 0): PluginEvent => ({
  type: 'transport',
  time,
  state: state(playing, beat),
});
const midi = (e: PluginEvent) => (e.type === 'midi' ? [e.time, ...e.bytes] : e.type);

function setup() {
  const out: PluginEvent[] = [];
  const runs: boolean[] = [];
  let now = 0;
  let tick: (() => void) | null = null;
  const hold = createHold({
    emit: (e) => out.push(e),
    now: () => now,
    createTicker: (_ms, t) => {
      tick = t;
      return {
        stop: () => {
          tick = null;
        },
      };
    },
    onRun: (on) => runs.push(on),
  });
  /** Moves the clock to `t` and fires the ticker, if it runs. */
  const at = (t: number) => {
    now = t;
    tick?.();
  };
  return { out, hold, runs, at, ticking: () => tick !== null, log: () => out.map(midi) };
}

const auto = (time: number, id: string, value: number): PluginEvent => ({
  type: 'automation',
  time,
  id,
  value,
});

describe('note hold', () => {
  it('holds C1 from Play to Stop, one note on and one note off', () => {
    const { hold, log } = setup();
    hold.schedule([transport(1, true)]);
    hold.schedule([transport(5, false)]);
    expect(log()).toEqual([
      [1, ...noteOn(NOTE.C1, VELOCITY)],
      [5, ...noteOff(NOTE.C1)],
    ]);
  });

  it('ignores a BPM change while playing, and a stop while stopped', () => {
    const { hold, log } = setup();
    hold.schedule([transport(1, true), transport(2, true, 2), transport(3, false)]);
    hold.schedule([transport(4, false)]);
    expect(log()).toHaveLength(2);
  });

  it('closes the note on pause, CC 123 and dispose', () => {
    for (const end of [
      (h: ReturnType<typeof setup>['hold']) => h.schedule([transport(2, false, 3)]),
      (h: ReturnType<typeof setup>['hold']) =>
        h.schedule([{ type: 'midi', time: 2, bytes: [0xb0, 123, 0] }]),
      (h: ReturnType<typeof setup>['hold']) => h.dispose(2),
    ]) {
      const { hold, log } = setup();
      hold.schedule([transport(1, true)]);
      end(hold);
      expect(log()).toEqual([
        [1, ...noteOn(NOTE.C1, VELOCITY)],
        [2, ...noteOff(NOTE.C1)],
      ]);
    }
  });

  it('a note change while held swaps the pitch at the event time', () => {
    const { hold, log } = setup();
    hold.schedule([transport(1, true)]);
    hold.schedule([{ type: 'automation', time: 3, id: 'note', value: 60 / 127 }]);
    hold.schedule([transport(4, false)]);
    expect(log()).toEqual([
      [1, ...noteOn(36, VELOCITY)],
      [3, ...noteOff(36)],
      [3, ...noteOn(60, VELOCITY)],
      [4, ...noteOff(60)],
    ]);
  });

  it('a note change while stopped only sets the next pitch', () => {
    const { hold, log } = setup();
    hold.schedule([{ type: 'automation', time: 0, id: 'note', value: 48 / 127 }]);
    expect(log()).toEqual([]);
    expect(hold.note()).toBe(48);
    hold.schedule([transport(1, true)]);
    expect(log()).toEqual([[1, ...noteOn(48, VELOCITY)]]);
  });

  // 120 BPM, 4/4: a beat is 0.5 s, a bar 2 s. Play at t = 1 → bar lines at 1, 3, 5…
  it('Stop releases the note while the transport plays on', () => {
    const { hold, log } = setup();
    hold.schedule([transport(1, true)]);
    hold.schedule([auto(1.7, 'stop', 1), auto(1.75, 'stop', 0)]);
    hold.schedule([transport(4, false, 6)]);
    expect(log()).toEqual([
      [1, ...noteOn(NOTE.C1, VELOCITY)],
      [1.7, ...noteOff(NOTE.C1)],
    ]);
  });

  it('Run next bar starts the note on the next bar line, then switches itself off', () => {
    const { hold, log, runs, at, ticking } = setup();
    hold.schedule([transport(1, true)]);
    hold.schedule([auto(1.2, 'stop', 1)]);
    hold.schedule([auto(1.4, 'run', 1)]);
    expect(hold.armed()).toBe(true);
    at(1.5);
    at(2.85); // beat 3.7: bar line (beat 4, t = 3) not yet in the 0.1 s window
    expect(log()).toHaveLength(2);
    at(2.95);
    expect(log()).toEqual([
      [1, ...noteOn(NOTE.C1, VELOCITY)],
      [1.2, ...noteOff(NOTE.C1)],
      [3, ...noteOn(NOTE.C1, VELOCITY)],
    ]);
    expect(hold.armed()).toBe(false);
    expect(runs).toEqual([true, false]);
    expect(ticking()).toBe(false);
  });

  it('Run next bar on a held note restarts it on the bar line', () => {
    const { hold, log, at } = setup();
    hold.schedule([transport(1, true)]);
    hold.schedule([auto(1.4, 'run', 1)]);
    at(2.95);
    expect(log()).toEqual([
      [1, ...noteOn(NOTE.C1, VELOCITY)],
      [3, ...noteOff(NOTE.C1)],
      [3, ...noteOn(NOTE.C1, VELOCITY)],
    ]);
  });

  it('switching Run next bar off, or Stop, cancels the wait', () => {
    for (const cancel of [auto(1.6, 'run', 0), auto(1.6, 'stop', 1)]) {
      const { hold, log, runs, at, ticking } = setup();
      hold.schedule([transport(1, true), auto(1.2, 'stop', 1), auto(1.4, 'run', 1)]);
      hold.schedule([cancel]);
      at(2.95);
      expect(log()).toHaveLength(2);
      expect(runs).toEqual([true, false]);
      expect(ticking()).toBe(false);
    }
  });

  it('armed while stopped: Play from bar 1 starts the note and switches it off', () => {
    const { hold, log, runs, ticking } = setup();
    hold.schedule([auto(0, 'run', 1)]);
    expect(ticking()).toBe(false);
    hold.schedule([transport(1, true)]);
    expect(log()).toEqual([[1, ...noteOn(NOTE.C1, VELOCITY)]]);
    expect(runs).toEqual([true, false]);
    expect(ticking()).toBe(false);
  });

  it('a transport stop keeps the wait for the next Play', () => {
    const { hold, at, ticking } = setup();
    hold.schedule([transport(1, true), auto(1.2, 'stop', 1), auto(1.4, 'run', 1)]);
    hold.schedule([transport(2, false, 2)]);
    expect(ticking()).toBe(false);
    expect(hold.armed()).toBe(true);
    hold.schedule([transport(5, true, 2)]); // resumes mid-bar: waits for beat 4 at t = 6
    at(5.95);
    expect(hold.armed()).toBe(false);
  });

  it('names notes the Ableton way and maps 0..1 to 0..127', () => {
    expect(noteName(36)).toBe('C1');
    expect(noteName(60)).toBe('C3');
    expect(noteName(61)).toBe('C#3');
    expect(noteName(0)).toBe('C-2');
    expect(toNote(0)).toBe(0);
    expect(toNote(1)).toBe(127);
    expect(toNote(36 / 127)).toBe(36);
  });
});
