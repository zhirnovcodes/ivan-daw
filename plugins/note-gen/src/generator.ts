// The note generator's logic, free of the browser: the clock and the ticker are injected,
// so Vitest drives it with a fake clock and a fake ticker.

import {
  type Anchor,
  beatsIn,
  isAllOff,
  lookaheadWindow,
  noteOff,
  noteOn,
  type PluginEvent,
  timeAt,
} from 'ivandaw-core';

export const NOTE = 60; // C3
export const VELOCITY = 100;
/** How long a note lasts, in beats. */
export const GATE_BEATS = 0.5;

export type Ticker = { stop(): void };

export interface GeneratorDeps {
  /** AudioContext seconds. */
  now(): number;
  /** `createTicker` from ivandaw-core in the plugin; a fake in tests. */
  createTicker(ms: number, tick: () => void): Ticker;
  tickMs: number;
  emit(e: PluginEvent): void;
}

export interface Generator {
  /** Plugin `schedule()` input: transport events and CC 123 / 120. */
  schedule(events: PluginEvent[]): void;
  dispose(): void;
}

export function createGenerator(deps: GeneratorDeps): Generator {
  let anchor: Anchor | null = null;
  let ticker: Ticker | null = null;
  /** The last whole beat emitted. Beats at or before it are never emitted again. */
  let lastBeat: number | null = null;
  /** Times at which notes that were emitted get their note off. */
  let offTimes: number[] = [];

  const stopTicker = () => {
    ticker?.stop();
    ticker = null;
  };

  const tick = () => {
    if (!anchor?.state.playing) return;
    const now = deps.now();
    offTimes = offTimes.filter((t) => t > now);
    for (const n of beatsIn(lookaheadWindow(now), anchor)) {
      if (lastBeat !== null && n <= lastBeat) continue;
      const off = timeAt(n + GATE_BEATS, anchor);
      deps.emit({ type: 'midi', time: timeAt(n, anchor), bytes: noteOn(NOTE, VELOCITY) });
      deps.emit({ type: 'midi', time: off, bytes: noteOff(NOTE) });
      offTimes.push(off);
      lastBeat = n;
    }
  };

  /** Stop the ticker; close a note that is still open at `time`. */
  const stop = (time: number) => {
    stopTicker();
    if (offTimes.some((t) => t > time)) {
      deps.emit({ type: 'midi', time, bytes: noteOff(NOTE) });
    }
    offTimes = [];
  };

  const onTransport = (e: Extract<PluginEvent, { type: 'transport' }>) => {
    const { state } = e;
    anchor = { state, time: e.time };
    if (state.playing) {
      if (ticker === null) {
        ticker = deps.createTicker(deps.tickMs, tick);
        tick();
      }
      return;
    }
    stop(e.time);
    // Stop rewinds to beat 0: the next Play starts with a note on beat 0. A pause keeps lastBeat,
    // so a resume starts at the next whole beat.
    if (state.beat === 0) lastBeat = null;
  };

  return {
    schedule(events) {
      for (const e of events) {
        if (e.type === 'transport') onTransport(e);
        else if (e.type === 'midi' && isAllOff(e.bytes)) stop(e.time);
      }
    },
    dispose() {
      stopTicker();
      anchor = null;
      offTimes = [];
    },
  };
}
