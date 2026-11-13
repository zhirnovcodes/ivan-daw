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
  const hold = createHold((e) => out.push(e));
  return { out, hold, log: () => out.map(midi) };
}

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
