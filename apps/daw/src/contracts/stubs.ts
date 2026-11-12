// Stand-ins for the engine, scheduler and router until P3, P4 and P8 land.
// They make no sound and touch no audio objects, so the app boots and the store works without them.
// Tests may also use them as fakes.

import { signal } from '@preact/signals-core';
import { type Anchor, beatAt, type PluginEvent, type TransportState } from 'ivandaw-core';
import { BPM_MAX, BPM_MIN, clamp } from '../model/project';
import type { Engine } from './engine';
import type { Router } from './router';
import type { Scheduler } from './scheduler';

const notBuilt = (what: string): never => {
  throw new Error(`${what} is not available in the stub engine (built in P3)`);
};

/** No AudioContext, no sound. `rms()` is always 0. */
export function createStubEngine(): Engine {
  return {
    get context(): AudioContext {
      return notBuilt('engine.context');
    },
    get master(): AudioNode {
      return notBuilt('engine.master');
    },
    unlock: () => Promise.resolve(),
    get: () => undefined,
    rms: () => 0,
  };
}

const initialState = (bpm: number): TransportState => ({
  playing: false,
  bpm,
  beat: 0,
  numerator: 4,
  denominator: 4,
  loop: null,
});

/**
 * Tracks play state with a caller-supplied clock (seconds), emits the same transport events
 * the real scheduler would at the moment of the call, but runs no ticker and sends no CC 123.
 */
export function createStubScheduler(now: () => number = () => 0, bpm = 120): Scheduler {
  const anchor = signal<Anchor>({ state: initialState(bpm), time: now() });
  const state = signal<TransportState>(anchor.value.state);
  const listeners = new Set<(e: PluginEvent) => void>();

  const reanchor = (s: TransportState, time: number): void => {
    anchor.value = { state: s, time };
    state.value = s;
    for (const l of listeners) l({ type: 'transport', time, state: s });
  };
  const current = (): TransportState => {
    const a = anchor.value;
    return a.state.playing ? { ...a.state, beat: beatAt(now(), a) } : a.state;
  };

  return {
    state,
    anchor,
    play: async () => {
      if (state.value.playing) return;
      reanchor({ ...state.value, playing: true }, now());
    },
    pause: () => {
      if (!state.value.playing) return;
      reanchor({ ...current(), playing: false }, now());
    },
    stop: () => {
      reanchor({ ...state.value, playing: false, beat: 0 }, now());
    },
    setBpm: (next) => {
      const b = clamp(next, BPM_MIN, BPM_MAX);
      if (b === state.value.bpm) return;
      reanchor({ ...current(), bpm: b }, now());
    },
    onEvent: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/**
 * Accepts every cable except one from a node to itself, plans nothing and applies nothing.
 * The real rules arrive with P8.
 */
export function createStubRouter(): Router {
  return {
    validate: (_p, _m, from, to) =>
      from.node === to.node ? { ok: false, reason: 'self' } : { ok: true },
    plan: () => ({ audio: [], events: [] }),
    apply: () => {},
  };
}
