// Contract C5 (scheduler part). Owner: P4, apps/daw/src/scheduler.
// Tech design: "Scheduler and transport". All times are AudioContext seconds;
// all timing math comes from ivandaw-core (beatAt, timeAt, lookaheadWindow, createTicker).

import type { ReadonlySignal } from '@preact/signals-core';
import type { Anchor, PluginEvent, TransportState } from 'ivandaw-core';

export interface Scheduler {
  /** Play state for the UI. `beat` is refreshed on each tick. */
  readonly state: ReadonlySignal<TransportState>;
  /** "Beat `state.beat` happens at `time`". A new anchor is taken on Play, Pause, Stop and every BPM change. */
  readonly anchor: ReadonlySignal<Anchor>;
  /** Awaits `engine.unlock()`, then emits `transport {playing: true}` at now + 0.05 s. */
  play(): Promise<void>;
  /** Emits `transport {playing: false, beat: beatAt(now)}` at now, then CC 123 to every node. */
  pause(): void;
  /** Emits `transport {playing: false, beat: 0}` at now, then CC 123 to every node. */
  stop(): void;
  /** Emits `tempo` + `transport` at now with a new anchor. `bpm` is already clamped to 40..240. */
  setBpm(bpm: number): void;
  /** The router subscribes and fans each event out to every ready node. Returns unsubscribe. */
  onEvent(l: (e: PluginEvent) => void): () => void;
}
