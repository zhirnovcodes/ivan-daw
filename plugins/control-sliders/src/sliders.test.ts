import type { PluginEvent } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import { createSliders } from './sliders';

describe('control sliders', () => {
  it('re-emits a move on the port of the same name, at the same time', () => {
    const out: PluginEvent[] = [];
    const s = createSliders((e) => out.push(e));
    s.schedule([{ type: 'automation', time: 1.25, id: 'a', value: 0.8 }]);
    expect(out).toEqual([{ type: 'automation', time: 1.25, id: 'a', value: 0.8, port: 'a' }]);
    expect(s.value('a')).toBe(0.8);
    expect(s.value('b')).toBe(0.5);
  });

  it('clamps to 0..1 and ignores unknown ids and other events', () => {
    const out: PluginEvent[] = [];
    const changes: string[] = [];
    const s = createSliders(
      (e) => out.push(e),
      (id, v) => changes.push(`${id}=${v}`),
    );
    s.schedule([
      { type: 'automation', time: 0, id: 'b', value: 3 },
      { type: 'automation', time: 0, id: 'zzz', value: 0.1 },
      { type: 'midi', time: 0, bytes: [0x90, 60, 100] },
    ]);
    expect(out).toEqual([{ type: 'automation', time: 0, id: 'b', value: 1, port: 'b' }]);
    expect(changes).toEqual(['b=1']);
  });
});
