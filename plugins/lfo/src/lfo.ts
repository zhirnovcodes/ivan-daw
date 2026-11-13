// The LFO's logic, free of the browser: the clock and the ticker are injected, so Vitest drives it.
// Design: docs/v1.1-tech-design.md, "5. LFO". Synced to the transport: one cycle per bar, 0..1.

import { type Anchor, beatAt, type PluginEvent } from 'ivandaw-core';

/** Beats per cycle: one bar of 4/4. */
export const PERIOD_BEATS = 4;
/** Each value is stamped this far ahead of the tick that makes it, so it lands smoothly. */
export const AHEAD = 0.025;

/** 0 on the bar line, 1 half way, back to 0: a raised cosine. */
export function wave(beat: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * beat) / PERIOD_BEATS);
}

export type Ticker = { stop(): void };

export interface LfoDeps {
  /** AudioContext seconds. */
  now(): number;
  createTicker(ms: number, tick: () => void): Ticker;
  tickMs: number;
  emit(e: PluginEvent): void;
}

export interface Lfo {
  /** Plugin `schedule()` input: transport events. Everything else is ignored. */
  schedule(events: PluginEvent[]): void;
  dispose(): void;
}

export function createLfo(deps: LfoDeps): Lfo {
  let anchor: Anchor | null = null;
  let ticker: Ticker | null = null;
  /** The time of the last value sent; values never go back in time. */
  let lastTime = Number.NEGATIVE_INFINITY;

  const send = (time: number, beat: number) => {
    if (time <= lastTime) return;
    lastTime = time;
    deps.emit({ type: 'automation', time, id: 'out', value: wave(beat), port: 'out' });
  };

  const tick = () => {
    if (!anchor?.state.playing) return;
    const t = deps.now() + AHEAD;
    send(t, beatAt(t, anchor));
  };

  const stopTicker = () => {
    ticker?.stop();
    ticker = null;
  };

  return {
    schedule(events) {
      for (const e of events) {
        if (e.type !== 'transport') continue;
        anchor = { state: e.state, time: e.time };
        if (e.state.playing) {
          if (!ticker) ticker = deps.createTicker(deps.tickMs, tick);
          tick();
        } else {
          stopTicker();
          // Stopped or paused: hold the value at that beat.
          send(Math.max(e.time, lastTime + 1e-6), e.state.beat);
        }
      }
    },
    dispose() {
      stopTicker();
      anchor = null;
    },
  };
}
