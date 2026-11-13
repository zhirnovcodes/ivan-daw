// Contract C5 (engine part). Owner: P3, apps/daw/src/engine.
// Tech design: "Engine". The engine is the only code that creates audio objects
// and the only place that may call `new AudioContext()`.

import type { PluginInstance, PluginManifest } from 'ivandaw-core';

/** The volume / pan stage after a node's main audio out. */
export interface Strip {
  input: GainNode;
  output: StereoPannerNode;
}

/** One live project node. Master has no instance: its input is `Engine.master`. */
export interface LoadedNode {
  instance: PluginInstance;
  manifest: PluginManifest;
  strip?: Strip;
}

export interface Engine {
  /** The one shared AudioContext, created at boot (suspended until `unlock()`). */
  readonly context: AudioContext;
  /** Master `in`: the summing GainNode every cable to Master connects into. */
  readonly master: AudioNode;
  /** Resumes the context. Runs on the first pointerdown / keydown, and Play awaits it (Safari). */
  unlock(): Promise<void>;
  /** The loaded node with this id, or undefined while loading, after an error, or for Master. */
  get(id: string): LoadedNode | undefined;
  /** RMS of Master's output from its AnalyserNode, for the test hook. */
  rms(): number;
  /**
   * v1.1, for control cables: the AudioParam behind a node's volume or pan (Master's included).
   * A volume value goes in as `value × scale` (Master's gain carries its fixed 0.8).
   * Undefined for a node without a strip or not loaded.
   */
  controlParam(id: string, which: 'gain' | 'pan'): { param: AudioParam; scale: number } | undefined;
}
