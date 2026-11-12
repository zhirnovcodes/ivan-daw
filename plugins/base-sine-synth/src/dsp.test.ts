import { describe, expect, it } from 'vitest';
import {
  ATTACK_S,
  EventQueue,
  HEADROOM,
  levelToDb,
  noteHz,
  RELEASE_S,
  SineSynth,
  type SynthEvent,
  VOICES,
} from './dsp';

const SR = 48000;
const ATTACK = Math.round(ATTACK_S * SR); // 240
const RELEASE = Math.round(RELEASE_S * SR); // 1440

const on = (frame: number, note: number): SynthEvent => ({ frame, kind: 'on', note });
const off = (frame: number, note: number): SynthEvent => ({ frame, kind: 'off', note });
const allOff = (frame: number): SynthEvent => ({ frame, kind: 'allOff' });

/** Render `n` frames starting at frame 0 in 128-frame blocks, like the worklet does. */
function renderAll(synth: SineSynth, n: number, startFrame = 0): Float32Array {
  const out = new Float32Array(n);
  const block = new Float32Array(128);
  for (let pos = 0; pos < n; pos += 128) {
    const len = Math.min(128, n - pos);
    synth.render(block, len, startFrame + pos);
    out.set(block.subarray(0, len), pos);
  }
  return out;
}

const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('EventQueue', () => {
  it('keeps events sorted by frame and equal frames in arrival order', () => {
    const q = new EventQueue();
    q.push(on(30, 1));
    q.push(on(10, 2));
    q.push(on(30, 3));
    q.push(on(20, 4));
    expect(q.nextFrame).toBe(10);
    const notes: number[] = [];
    for (let e = q.shiftUntil(1000); e; e = q.shiftUntil(1000)) {
      if (e.kind === 'on') notes.push(e.note);
    }
    expect(notes).toEqual([2, 4, 1, 3]);
  });

  it('shiftUntil only returns events due by that frame', () => {
    const q = new EventQueue();
    q.push(on(100, 60));
    expect(q.shiftUntil(99)).toBeUndefined();
    expect(q.shiftUntil(100)).toBeDefined();
    expect(q.nextFrame).toBe(Number.POSITIVE_INFINITY);
  });

  it('dropNotesFrom removes notes at or after the frame and keeps level changes', () => {
    const q = new EventQueue();
    q.push(on(9, 60));
    q.push(on(10, 61));
    q.push({ frame: 11, kind: 'level', value: 0.2 });
    q.push(off(12, 61));
    q.dropNotesFrom(10);
    expect(q.length).toBe(2);
    expect(q.shiftUntil(100)).toMatchObject({ kind: 'on', note: 60 });
    expect(q.shiftUntil(100)).toMatchObject({ kind: 'level' });
  });
});

describe('block splitting', () => {
  it('starts a note exactly at its frame inside a block', () => {
    const s = new SineSynth(SR);
    s.post(on(40, 69));
    const out = new Float32Array(128);
    s.render(out, 128, 0);
    for (let i = 0; i <= 40; i++) expect(out[i]).toBe(0); // frame 40 is sin(0) × first step
    expect(out[41]).not.toBe(0);
  });

  it('applies an event from a later block at the right offset', () => {
    const s = new SineSynth(SR);
    s.post(on(200, 69)); // block 2 starts at 128: offset 72
    const out = renderAll(s, 256);
    for (let i = 0; i <= 200; i++) expect(out[i]).toBe(0);
    expect(out[201]).not.toBe(0);
  });

  it('splits a block at several events, applying each at its own frame', () => {
    const s = new SineSynth(SR);
    s.post(on(10, 69));
    s.post(off(60, 69));
    const out = new Float32Array(128);
    s.render(out, 128, 0);
    expect(out[5]).toBe(0);
    expect(s.voices[0]?.env.releasing).toBe(true);
    expect(out[11]).not.toBe(0);
  });

  it('applies late events (frame already past) at once', () => {
    const s = new SineSynth(SR);
    s.post(on(5, 69));
    const out = new Float32Array(128);
    s.render(out, 128, 1000);
    expect(out[1]).not.toBe(0);
  });

  it('matches one big render when blocks are split anywhere', () => {
    const events = [on(3, 60), on(150, 64), off(300, 60), on(310, 67)];
    const a = new SineSynth(SR);
    const b = new SineSynth(SR);
    for (const e of events) {
      a.post({ ...e });
      b.post({ ...e });
    }
    const one = new Float32Array(512);
    a.render(one, 512, 0);
    expect(renderAll(b, 512)).toEqual(one);
  });
});

describe('voices', () => {
  it('plays C3 (MIDI 60) at about 261.6 Hz', () => {
    expect(noteHz(60)).toBeCloseTo(261.63, 1);
    const s = new SineSynth(SR);
    s.post({ frame: 0, kind: 'level', value: 1 });
    s.post(on(0, 60));
    const out = renderAll(s, SR + 128).subarray(SR / 4); // skip the attack and the level ramp
    // Count rising zero crossings over a whole number of samples and convert to Hz.
    let crossings = 0;
    let first = -1;
    let last = -1;
    for (let i = 1; i < out.length; i++) {
      if ((out[i - 1] as number) < 0 && (out[i] as number) >= 0) {
        const frac = -(out[i - 1] as number) / ((out[i] as number) - (out[i - 1] as number));
        const t = i - 1 + frac;
        if (first < 0) first = t;
        last = t;
        crossings += 1;
      }
    }
    const hz = ((crossings - 1) * SR) / (last - first);
    expect(hz).toBeCloseTo(261.63, 0);
  });

  it('attack takes 5 ms and release takes 30 ms', () => {
    const s = new SineSynth(SR);
    s.post(on(0, 69));
    s.post(off(2000, 69));
    const env = s.voices[0]?.env;
    if (!env) throw new Error('no voice');
    const out = new Float32Array(128);
    let atFull = -1;
    let doneAt = -1;
    for (let pos = 0; pos < 6000; pos += 128) {
      // Sample the envelope frame by frame through 1-frame renders.
      for (let i = 0; i < 128; i++) {
        s.render(out, 1, pos + i);
        if (atFull < 0 && env.value >= 1) atFull = pos + i;
        if (doneAt < 0 && pos + i > 2000 && env.done) doneAt = pos + i;
      }
    }
    expect(atFull).toBe(ATTACK - 1 + 0); // note on at frame 0 → full gain after ATTACK frames
    expect(doneAt - 2000).toBe(RELEASE - 1);
  });

  it('a release from mid-attack starts from the gain reached', () => {
    const s = new SineSynth(SR);
    s.post(on(0, 69));
    s.post(off(120, 69));
    const out = renderAll(s, 121);
    const g = s.voices[0]?.env.value ?? 0;
    expect(g).toBeGreaterThan(0.45);
    expect(g).toBeLessThan(0.55);
    expect(peak(out)).toBeLessThan(0.25 * 0.5 + 1e-9);
  });

  it('the 9th note steals the oldest voice with no jump bigger than one attack step', () => {
    const s = new SineSynth(SR);
    const notes = [48, 50, 52, 53, 55, 57, 59, 60];
    notes.forEach((n, i) => {
      s.post(on(i, n));
    });
    s.post(on(4000, 62)); // 9th, all 8 held
    const out = renderAll(s, 8000);
    // Per voice, |Δ| ≤ one sine step + one envelope step (the 5 ms steal fade is no steeper than the attack).
    const level = 0.5;
    let bound = 0;
    for (const n of [...notes, 62]) bound += (2 * Math.PI * noteHz(n)) / SR + 1 / ATTACK;
    bound *= HEADROOM * level;
    let worst = 0;
    for (let i = 1; i < out.length; i++) {
      worst = Math.max(worst, Math.abs((out[i] as number) - (out[i - 1] as number)));
    }
    expect(worst).toBeLessThanOrEqual(bound);
    // The oldest (48) was the one stolen: the new note took its slot.
    expect(
      s.voices
        .filter((v) => v.held)
        .map((v) => v.note)
        .sort(),
    ).toEqual([50, 52, 53, 55, 57, 59, 60, 62].sort());
    expect(s.outgoing.some((v) => v.note === 48 && v.active)).toBe(false); // 5 ms are long over
    expect(s.voices.length).toBe(VOICES);
  });

  it('the stolen voice keeps sounding for 5 ms while the new note starts at once', () => {
    const s = new SineSynth(SR);
    for (let i = 0; i < 8; i++) s.post(on(0, 60 + i));
    renderAll(s, 2000);
    s.post(on(2000, 80));
    const out = new Float32Array(10);
    s.render(out, 10, 2000);
    expect(s.outgoing.filter((v) => v.active)).toHaveLength(1);
    expect(s.voices.filter((v) => v.active)).toHaveLength(8);
    expect(s.voices.some((v) => v.note === 80 && v.held)).toBe(true);
  });

  it('never exceeds 1.0, even with 9 notes at full level', () => {
    const s = new SineSynth(SR);
    s.post({ frame: 0, kind: 'level', value: 1 });
    for (let i = 0; i < 9; i++) s.post(on(i * 300, 60 + i));
    const out = renderAll(s, 8000);
    expect(peak(out)).toBeLessThanOrEqual(1);
    expect(peak(out)).toBeGreaterThan(0.1);
  });

  it('level changes move through a 5 ms ramp, not a jump', () => {
    const s = new SineSynth(SR);
    s.post(on(0, 69));
    renderAll(s, 2000);
    s.post({ frame: 2000, kind: 'level', value: 1 });
    const out = renderAll(s, 600, 2000);
    let worst = 0;
    for (let i = 1; i < out.length; i++) {
      worst = Math.max(worst, Math.abs((out[i] as number) - (out[i - 1] as number)));
    }
    expect(worst).toBeLessThan((0.25 * (2 * Math.PI * 440)) / SR + 0.001);
  });
});

describe('CC 120 / 123', () => {
  it('releases every voice from its current gain over 30 ms', () => {
    const s = new SineSynth(SR);
    s.post(on(0, 60));
    s.post(on(0, 64));
    s.post(allOff(1000));
    const out = renderAll(s, 1000 + RELEASE + 200);
    expect(s.voices.some((v) => v.active)).toBe(false);
    expect(peak(out.subarray(1000 + RELEASE + 1))).toBe(0);
    expect(peak(out.subarray(1000, 1000 + RELEASE))).toBeGreaterThan(0);
  });

  it('drops queued notes at or after its frame', () => {
    const s = new SineSynth(SR);
    s.post(on(0, 60));
    s.post(on(5000, 64)); // queued far ahead
    s.post(off(6000, 60));
    s.post(allOff(2000));
    s.post(on(1500, 67)); // before the CC: stays
    const out = renderAll(s, 9000);
    expect(s.voices.some((v) => v.active)).toBe(false);
    // Silence after the release: the notes at 5000 and later never sounded.
    expect(peak(out.subarray(2000 + RELEASE + 1))).toBe(0);
    expect(s.queue.length).toBe(0);
  });

  it('a note after the CC still plays', () => {
    const s = new SineSynth(SR);
    s.post(on(0, 60));
    s.post(allOff(1000));
    s.post(on(1000 + RELEASE, 64)); // new Play right after the release
    const out = renderAll(s, 5000);
    expect(peak(out.subarray(4000))).toBeGreaterThan(0.05);
  });
});

describe('levelToDb', () => {
  it('formats the level in dB', () => {
    expect(levelToDb(1)).toBe('0.0 dB');
    expect(levelToDb(0.5)).toBe('-6.0 dB');
    expect(levelToDb(0)).toBe('-∞ dB');
  });
});
