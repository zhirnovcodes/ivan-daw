// Note hold's logic, free of the browser: one note held for as long as the transport plays.
// Design: docs/v1.1-tech-design.md, "3. Note hold".

import { isAllOff, NOTE, noteOff, noteOn, type PluginEvent } from 'ivandaw-core';

export const VELOCITY = 100;
export const DEFAULT_NOTE = NOTE.C1;
export const NOTE_MAX = 127;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Ableton naming, as in ivandaw-core: 36 → C1, 60 → C3. */
export function noteName(n: number): string {
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 2}`;
}

/** Normalized 0..1 → MIDI note 0..127. */
export const toNote = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * NOTE_MAX);

export interface Hold {
  /** Plugin `schedule()` input: transport, CC 123 / 120 and `note` automation. */
  schedule(events: PluginEvent[]): void;
  /** The pitch it holds (or will hold on Play). */
  note(): number;
  /** Closes a held note at `time`. */
  dispose(time: number): void;
}

export function createHold(emit: (e: PluginEvent) => void, onNote?: (n: number) => void): Hold {
  let note: number = DEFAULT_NOTE;
  /** The pitch sounding now, or null. */
  let held: number | null = null;

  const on = (time: number) => {
    held = note;
    emit({ type: 'midi', time, bytes: noteOn(note, VELOCITY) });
  };
  const off = (time: number) => {
    if (held === null) return;
    emit({ type: 'midi', time, bytes: noteOff(held) });
    held = null;
  };

  const setNote = (n: number, time: number) => {
    if (n === note) return;
    note = n;
    onNote?.(n);
    if (held !== null) {
      off(time);
      on(time);
    }
  };

  return {
    schedule(events) {
      for (const e of events) {
        if (e.type === 'transport') {
          if (e.state.playing) {
            if (held === null) on(e.time);
          } else {
            off(e.time);
          }
        } else if (e.type === 'midi' && isAllOff(e.bytes)) {
          off(e.time);
        } else if (e.type === 'automation' && e.id === 'note') {
          setNote(toNote(e.value), e.time);
        }
      }
    },
    note: () => note,
    dispose(time) {
      off(time);
    },
  };
}
