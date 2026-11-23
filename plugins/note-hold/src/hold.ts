// Note hold's logic, free of the browser: one note held for as long as the transport plays.
// Design: docs/v1.1-tech-design.md, "3. Note hold".
// v1.2: a Stop button releases the note while the transport plays on, and a "Run next bar" toggle
// starts it again (or restarts it) on the next bar line, then lets go of itself.

import {
  type Anchor,
  beatsIn,
  isAllOff,
  LOOKAHEAD,
  lookaheadWindow,
  NOTE,
  noteOff,
  noteOn,
  type PluginEvent,
  TICK_MS,
  timeAt,
} from 'ivandaw-core';

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

export type Ticker = { stop(): void };

export interface HoldDeps {
  emit(e: PluginEvent): void;
  /** The AudioContext clock. */
  now(): number;
  /** `createTicker` from ivandaw-core in the plugin; a fake in tests. */
  createTicker(ms: number, tick: () => void): Ticker;
  /** The pitch changed (automation or state). */
  onNote?(n: number): void;
  /** "Run next bar" switched on or off, by the user or by itself on the bar line. */
  onRun?(on: boolean): void;
}

export interface Hold {
  /** Plugin `schedule()` input: transport, CC 123 / 120, `note`, `run` and `stop` automation. */
  schedule(events: PluginEvent[]): void;
  /** The pitch it holds (or will hold on Play). */
  note(): number;
  /** "Run next bar" is waiting for the next bar line. */
  armed(): boolean;
  /** Closes a held note at `time`. */
  dispose(time: number): void;
}

/** Bar lines are every `numerator` beats, as in the transport display. */
const isBarLine = (beat: number, numerator: number): boolean =>
  Math.abs(beat / numerator - Math.round(beat / numerator)) < 1e-9;

export function createHold(deps: HoldDeps): Hold {
  let note: number = DEFAULT_NOTE;
  /** The pitch sounding now, or null. */
  let held: number | null = null;
  let anchor: Anchor | null = null;
  let armed = false;
  let ticker: Ticker | null = null;

  const on = (time: number) => {
    held = note;
    deps.emit({ type: 'midi', time, bytes: noteOn(note, VELOCITY) });
  };
  const off = (time: number) => {
    if (held === null) return;
    deps.emit({ type: 'midi', time, bytes: noteOff(held) });
    held = null;
  };

  const stopTicker = () => {
    ticker?.stop();
    ticker = null;
  };
  const setArmed = (v: boolean) => {
    if (armed === v) return;
    armed = v;
    if (!v) stopTicker();
    else if (anchor?.state.playing && ticker === null) ticker = deps.createTicker(TICK_MS, tick);
    deps.onRun?.(v);
  };

  /** Books the next bar line once it comes into the lookahead window. */
  function tick() {
    if (!armed || !anchor?.state.playing) return;
    const a = anchor;
    const bar = beatsIn(lookaheadWindow(deps.now(), LOOKAHEAD), a).find((b) =>
      isBarLine(b, a.state.numerator),
    );
    if (bar === undefined) return;
    const time = timeAt(bar, a);
    off(time);
    on(time);
    setArmed(false);
  }

  const setNote = (n: number, time: number) => {
    if (n === note) return;
    note = n;
    deps.onNote?.(n);
    if (held !== null) {
      off(time);
      on(time);
    }
  };

  const onTransport = (e: Extract<PluginEvent, { type: 'transport' }>) => {
    anchor = { state: e.state, time: e.time };
    if (e.state.playing) {
      if (held === null) on(e.time);
      if (armed) {
        // Play from a bar line already starts the note there: nothing left to wait for.
        if (isBarLine(e.state.beat, e.state.numerator)) setArmed(false);
        else if (ticker === null) ticker = deps.createTicker(TICK_MS, tick);
      }
    } else {
      off(e.time);
      stopTicker();
    }
  };

  return {
    schedule(events) {
      for (const e of events) {
        if (e.type === 'transport') {
          onTransport(e);
        } else if (e.type === 'midi' && isAllOff(e.bytes)) {
          off(e.time);
        } else if (e.type === 'automation') {
          if (e.id === 'note') setNote(toNote(e.value), e.time);
          else if (e.id === 'run') setArmed(e.value >= 0.5);
          else if (e.id === 'stop' && e.value >= 0.5) {
            off(e.time);
            setArmed(false);
          }
        }
      }
    },
    note: () => note,
    armed: () => armed,
    dispose(time) {
      stopTicker();
      off(time);
    },
  };
}
