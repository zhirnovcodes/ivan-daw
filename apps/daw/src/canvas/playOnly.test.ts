import { describe, expect, it } from 'vitest';
import { permits, playTarget } from './playOnly';

const header = { kind: 'header' as const, node: 'n1', nodePos: { x: 0, y: 0 } };
const out = { kind: 'outPort' as const, ref: { node: 'n1', port: 'out' } };

describe('play-only canvas rules', () => {
  it('changes nothing in edit mode', () => {
    expect(playTarget('edit', header)).toBe(header);
    expect(playTarget('edit', out, 'audio')).toBe(out);
    expect(permits('edit', { type: 'removeNode', id: 'n1' }, () => false)).toBe(true);
  });

  it('turns a header grab into a plain select', () => {
    expect(playTarget('play', header)).toEqual({ kind: 'body', node: 'n1' });
  });

  it('lets only modulation outputs start a cable', () => {
    expect(playTarget('play', out, 'modulation')).toBe(out);
    expect(playTarget('play', out, 'audio')).toBeUndefined();
    expect(playTarget('play', out, 'events')).toBeUndefined();
  });

  it('blocks moving and removing nodes, and deleting anything but control cables', () => {
    const control = (id: string) => id === 'c9';
    expect(permits('play', { type: 'moveNode', id: 'n1', x: 1, y: 1 }, control)).toBe(false);
    expect(permits('play', { type: 'removeNode', id: 'n1' }, control)).toBe(false);
    expect(permits('play', { type: 'disconnect', id: 'c1' }, control)).toBe(false);
    expect(permits('play', { type: 'disconnect', id: 'c9' }, control)).toBe(true);
    expect(permits('play', { type: 'select', sel: { node: 'n1' } }, control)).toBe(true);
    expect(
      permits(
        'play',
        { type: 'connect', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'ctl' } },
        control,
      ),
    ).toBe(true);
  });
});
