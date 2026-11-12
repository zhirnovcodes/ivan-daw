// Pure DSP for the base sine synth: event queue, 8-voice allocator, sine voices.
// No browser types, so Vitest runs it directly and the worklet only moves buffers in and out.
// Nothing here allocates while rendering: voices, queue storage and envelopes are made up front.

import { Envelope, Smoother } from 'ivandaw-core';

export const VOICES = 8;
/** Outgoing (stolen) voices fading out. Far more than a 5 ms window can ever use. */
const OUTGOING = 16;
export const ATTACK_S = 0.005;
export const RELEASE_S = 0.03;
export const STEAL_S = 0.005;
export const SMOOTH_S = 0.005;
export const HEADROOM = 0.25;
export const DEFAULT_LEVEL = 0.5;

/** One event for the synth, already converted to a frame on the audio clock. */
export type SynthEvent =
  | { frame: number; kind: 'on'; note: number }
  | { frame: number; kind: 'off'; note: number }
  | { frame: number; kind: 'allOff' } // CC 120 / 123
  | { frame: number; kind: 'level'; value: number }; // 0..1

export const noteHz = (n: number): number => 440 * 2 ** ((n - 69) / 12);

/** `level` (0..1) shown in dB. */
export function levelToDb(v: number): string {
  if (v <= 0) return '-∞ dB';
  return `${(20 * Math.log10(v)).toFixed(1)} dB`;
}

/** Events sorted by frame. Equal frames keep arrival order. */
export class EventQueue {
  private items: SynthEvent[] = [];

  get length(): number {
    return this.items.length;
  }

  /** Frame of the first event, or Infinity when empty. */
  get nextFrame(): number {
    const first = this.items[0];
    return first ? first.frame : Number.POSITIVE_INFINITY;
  }

  push(e: SynthEvent): void {
    // Walk back from the end: events normally arrive nearly in order.
    let i = this.items.length;
    while (i > 0 && (this.items[i - 1] as SynthEvent).frame > e.frame) i -= 1;
    this.items.splice(i, 0, e);
  }

  /** Remove and return the first event if its frame is <= `frame`. */
  shiftUntil(frame: number): SynthEvent | undefined {
    const first = this.items[0];
    if (first && first.frame <= frame) return this.items.shift();
    return undefined;
  }

  /** Drop queued note events at or after `frame`. Level changes are state, so they stay. */
  dropNotesFrom(frame: number): void {
    this.items = this.items.filter((e) => e.frame < frame || e.kind === 'level');
  }

  clear(): void {
    this.items.length = 0;
  }
}

export class Voice {
  readonly env: Envelope;
  note = -1;
  phase = 0; // 0..1
  inc = 0; // phase step per frame
  /** Start order, for "oldest voice". */
  age = 0;
  /** True from note on until its note off (or a steal / all-off). */
  held = false;

  constructor(attackFrames: number, releaseFrames: number) {
    this.env = new Envelope(attackFrames, releaseFrames);
  }

  get active(): boolean {
    return !this.env.done;
  }
}

export class SineSynth {
  readonly voices: Voice[] = [];
  readonly outgoing: Voice[] = [];
  readonly queue = new EventQueue();
  private readonly level: Smoother;
  private readonly stealFrames: number;
  private counter = 0;

  constructor(readonly sampleRate: number) {
    const attack = Math.round(ATTACK_S * sampleRate);
    const release = Math.round(RELEASE_S * sampleRate);
    for (let i = 0; i < VOICES; i++) this.voices.push(new Voice(attack, release));
    for (let i = 0; i < OUTGOING; i++) this.outgoing.push(new Voice(attack, release));
    this.level = new Smoother(DEFAULT_LEVEL, Math.round(SMOOTH_S * sampleRate));
    this.stealFrames = Math.round(STEAL_S * sampleRate);
  }

  /** Queue an event. A CC 120 / 123 first drops queued notes at or after its frame. */
  post(e: SynthEvent): void {
    if (e.kind === 'allOff') this.queue.dropNotesFrom(e.frame);
    this.queue.push(e);
  }

  /**
   * Render `n` mono frames into `out`, where `out[0]` is audio frame `startFrame`.
   * Events at or before a frame take effect exactly at that frame; late events apply at once.
   */
  render(out: Float32Array, n: number, startFrame: number): void {
    let pos = 0;
    while (pos < n) {
      let e = this.queue.shiftUntil(startFrame + pos);
      while (e) {
        this.apply(e);
        e = this.queue.shiftUntil(startFrame + pos);
      }
      const end = Math.min(n, this.queue.nextFrame - startFrame);
      this.renderSegment(out, pos, end);
      pos = end;
    }
  }

  private apply(e: SynthEvent): void {
    switch (e.kind) {
      case 'on':
        this.noteOn(e.note);
        break;
      case 'off':
        this.noteOff(e.note);
        break;
      case 'allOff':
        for (const v of this.voices) this.releaseVoice(v);
        break;
      case 'level':
        this.level.set(Math.min(1, Math.max(0, e.value)));
        break;
    }
  }

  private releaseVoice(v: Voice): void {
    v.held = false;
    v.env.release();
  }

  private noteOn(note: number): void {
    let slot = -1;
    for (let i = 0; i < this.voices.length; i++) {
      if (!(this.voices[i] as Voice).active) {
        slot = i;
        break;
      }
    }
    if (slot < 0) slot = this.steal();
    const v = this.voices[slot] as Voice;
    v.note = note;
    v.phase = 0;
    v.inc = noteHz(note) / this.sampleRate;
    v.age = this.counter++;
    v.held = true;
    v.env.start();
  }

  /** All 8 busy: the oldest voice goes to the outgoing list and fades over 5 ms. */
  private steal(): number {
    let oldest = 0;
    for (let i = 1; i < this.voices.length; i++) {
      if ((this.voices[i] as Voice).age < (this.voices[oldest] as Voice).age) oldest = i;
    }
    const victim = this.voices[oldest] as Voice;
    const out = this.outgoing.findIndex((o) => !o.active);
    if (out >= 0) {
      // Swap objects: the faded voice keeps running in `outgoing`, a silent one takes the slot.
      this.voices[oldest] = this.outgoing[out] as Voice;
      this.outgoing[out] = victim;
      victim.held = false;
      victim.env.release(this.stealFrames);
    }
    return oldest;
  }

  private noteOff(note: number): void {
    let target: Voice | undefined;
    for (const v of this.voices) {
      if (v.held && v.note === note && (!target || v.age < target.age)) target = v;
    }
    if (target) this.releaseVoice(target);
  }

  private renderSegment(out: Float32Array, from: number, to: number): void {
    for (let i = from; i < to; i++) {
      let sum = 0;
      for (let k = 0; k < this.voices.length; k++) sum += this.voiceSample(this.voices[k] as Voice);
      for (let k = 0; k < this.outgoing.length; k++) {
        const o = this.outgoing[k] as Voice;
        if (o.active) sum += this.voiceSample(o);
      }
      const y = sum * this.level.next() * HEADROOM;
      out[i] = Math.min(1, Math.max(-1, y)); // hard safety net; normal levels never reach it
    }
  }

  private voiceSample(v: Voice): number {
    if (v.env.done) return 0;
    const g = v.env.next();
    const s = Math.sin(v.phase * 2 * Math.PI) * g;
    v.phase += v.inc;
    if (v.phase >= 1) v.phase -= 1;
    return s;
  }
}
