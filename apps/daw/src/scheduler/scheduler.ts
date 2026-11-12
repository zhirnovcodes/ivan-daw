// P4 scheduler: the musical clock. Tech design: "Scheduler and transport".
// It never makes sound itself (except the ?click=1 debug blip): it emits `transport`, `tempo`
// and CC 123 events with exact AudioContext times, and the router fans them out to every node.

import { effect, signal } from '@preact/signals-core';
import {
  type Anchor,
  allNotesOff,
  beatAt,
  beatsIn,
  createTicker,
  lookaheadWindow,
  type PluginEvent,
  TICK_MS,
  type TransportState,
  timeAt,
} from 'ivandaw-core';
import type { Engine } from '../contracts/engine';
import type { Scheduler } from '../contracts/scheduler';
import { BPM_MAX, BPM_MIN, clamp } from '../model/project';
import { project } from '../store/store';
import { type ClickHandle, playClick } from './click';

/** Play starts this far ahead of now, so the first beat is booked on time. */
export const START_DELAY = 0.05;

export interface SchedulerOptions {
  /** The engine's context, unlock and Master. Only `context.currentTime` is needed without `click`. */
  engine: Pick<Engine, 'context' | 'unlock' | 'master'>;
  /** Debug click: a 20 ms, 1 kHz blip into Master on every beat (`?click=1`). */
  click?: boolean;
  /** Wakes the lookahead loop. Default: `createTicker` from ivandaw-core (Web Worker, 25 ms). */
  ticker?: (ms: number, tick: () => void) => { stop(): void };
  /** The clock. Default: `engine.context.currentTime`. Tests pass a fake. */
  now?: () => number;
  /** Plays one click at time `t`. Default: `playClick`. Tests pass a spy. */
  playClick?: (t: number) => ClickHandle | undefined;
}

export interface LiveScheduler extends Scheduler {
  /** Follows `project.transport` (BPM, meter) so a loaded project sets the tempo. Returns stop. */
  attach(): () => void;
  /** Stops the ticker and drops listeners. */
  dispose(): void;
}

export function createScheduler(opts: SchedulerOptions): LiveScheduler {
  const now = opts.now ?? (() => opts.engine.context.currentTime);
  const startTicker = opts.ticker ?? createTicker;
  const click =
    opts.playClick ??
    (opts.click
      ? (t: number): ClickHandle => playClick(opts.engine.context, opts.engine.master, t)
      : undefined);
  /** Booked clicks that may not have started yet; Pause and Stop cancel them. */
  let booked: ClickHandle[] = [];

  const t0 = project.peek().transport;
  const initial: TransportState = {
    playing: false,
    bpm: clamp(t0.bpm, BPM_MIN, BPM_MAX),
    beat: 0,
    numerator: t0.numerator,
    denominator: t0.denominator,
    loop: null,
  };
  const anchor = signal<Anchor>({ state: initial, time: now() });
  const state = signal<TransportState>(initial);
  const listeners = new Set<(e: PluginEvent) => void>();
  let ticker: { stop(): void } | undefined;
  let lastClick = Number.NEGATIVE_INFINITY;
  let starting: Promise<void> | undefined;

  const emit = (e: PluginEvent): void => {
    for (const l of listeners) {
      try {
        l(e);
      } catch (err) {
        console.error('[scheduler] listener failed', err);
      }
    }
  };

  /** Takes a new anchor, publishes it, and emits the matching transport event. */
  const reanchor = (s: TransportState, time: number): void => {
    anchor.value = { state: s, time };
    state.value = s;
    emit({ type: 'transport', time, state: s });
  };

  /** The state with `beat` computed at time `t` (only moves while playing). */
  const stateAt = (t: number): TransportState => {
    const a = anchor.value;
    return a.state.playing ? { ...a.state, beat: Math.max(a.state.beat, beatAt(t, a)) } : a.state;
  };

  const tick = (): void => {
    const t = now();
    const a = anchor.value;
    if (!a.state.playing) return;
    // Refresh the UI beat; before t0 it stays at the start beat.
    state.value = stateAt(t);
    if (click) {
      booked = booked.filter((h) => h.time > t);
      for (const n of beatsIn(lookaheadWindow(t), a)) {
        if (n <= lastClick) continue;
        lastClick = n;
        const h = click(timeAt(n, a));
        if (h) booked.push(h);
      }
    }
  };

  const stopTicker = (): void => {
    ticker?.stop();
    ticker = undefined;
    for (const h of booked) h.cancel();
    booked = [];
  };

  const silence = (t: number): void => emit({ type: 'midi', time: t, bytes: allNotesOff() });

  const scheduler: LiveScheduler = {
    state,
    anchor,
    play() {
      if (anchor.value.state.playing) return Promise.resolve();
      starting ??= opts.engine
        .unlock()
        .then(() => {
          if (anchor.value.state.playing) return;
          const t = now() + START_DELAY;
          reanchor({ ...anchor.value.state, playing: true }, t);
          ticker ??= startTicker(TICK_MS, tick);
          tick();
        })
        .finally(() => {
          starting = undefined;
        });
      return starting;
    },
    pause() {
      if (!anchor.value.state.playing) return;
      const t = now();
      const paused = stateAt(t);
      stopTicker();
      // Clicks booked past the pause were cancelled; resume books them again.
      lastClick = Math.min(lastClick, Math.floor(paused.beat + 1e-9));
      reanchor({ ...paused, playing: false }, t);
      silence(t);
    },
    stop() {
      const t = now();
      stopTicker();
      lastClick = Number.NEGATIVE_INFINITY;
      reanchor({ ...anchor.value.state, playing: false, beat: 0 }, t);
      silence(t);
    },
    setBpm(next) {
      if (!Number.isFinite(next)) return;
      const bpm = clamp(next, BPM_MIN, BPM_MAX);
      if (bpm === anchor.value.state.bpm) return;
      const t = now();
      emit({ type: 'tempo', time: t, bpm });
      // New anchor at now: the beat stays continuous, only the speed changes.
      reanchor({ ...stateAt(t), bpm }, Math.max(t, anchor.value.time));
    },
    onEvent(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    attach() {
      return effect(() => {
        const { bpm, numerator, denominator } = project.value.transport;
        const s = anchor.peek().state;
        if (s.numerator !== numerator || s.denominator !== denominator) {
          const next = { ...s, numerator, denominator };
          anchor.value = { ...anchor.peek(), state: next };
          state.value = { ...state.peek(), numerator, denominator };
        }
        scheduler.setBpm(bpm);
      });
    },
    dispose() {
      stopTicker();
      listeners.clear();
    },
  };
  return scheduler;
}
