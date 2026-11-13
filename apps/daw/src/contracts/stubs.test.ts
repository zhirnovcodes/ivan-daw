import type { PluginEvent } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import { emptyProject } from '../model/project';
import { createStubEngine, createStubRouter, createStubScheduler } from './stubs';

describe('stub engine', () => {
  it('is silent and has no audio objects', async () => {
    const e = createStubEngine();
    await expect(e.unlock()).resolves.toBeUndefined();
    expect(e.rms()).toBe(0);
    expect(e.get('n1')).toBeUndefined();
    expect(() => e.context).toThrow(/P3/);
    expect(() => e.master).toThrow(/P3/);
  });
});

describe('stub scheduler', () => {
  it('emits transport events at the clock time and keeps the beat across pause and resume', async () => {
    let now = 10;
    const s = createStubScheduler(() => now);
    const events: PluginEvent[] = [];
    const off = s.onEvent((e) => events.push(e));
    await s.play();
    now = 11; // 2 beats later at 120 BPM
    s.pause();
    expect(s.state.value).toMatchObject({ playing: false, beat: 2 });
    now = 12;
    await s.play();
    expect(s.anchor.value).toMatchObject({ time: 12, state: { playing: true, beat: 2 } });
    now = 12.5;
    s.setBpm(60);
    expect(s.anchor.value).toMatchObject({ time: 12.5, state: { bpm: 60, beat: 3 } });
    s.stop();
    expect(s.state.value).toMatchObject({ playing: false, beat: 0 });
    off();
    s.stop();
    expect(
      events.map((e) => (e.type === 'transport' ? [e.time, e.state.playing] : e.type)),
    ).toEqual([
      [10, true],
      [11, false],
      [12, true],
      [12.5, true],
      [12.5, false],
    ]);
  });

  it('clamps BPM and ignores a repeat', () => {
    const s = createStubScheduler();
    s.setBpm(1000);
    expect(s.state.value.bpm).toBe(240);
    const a = s.anchor.value;
    s.setBpm(240);
    expect(s.anchor.value).toBe(a);
  });
});

describe('stub router', () => {
  it('refuses only self cables and plans nothing', () => {
    const r = createStubRouter();
    const p = emptyProject();
    const m = new Map();
    expect(r.validate(p, m, { node: 'n1', port: 'out' }, { node: 'n1', port: 'in' })).toEqual({
      ok: false,
      reason: 'self',
    });
    expect(r.validate(p, m, { node: 'n1', port: 'out' }, { node: 'n2', port: 'in' })).toEqual({
      ok: true,
    });
    expect(r.plan(p, m, {})).toEqual({ audio: [], events: [], control: [] });
  });
});
