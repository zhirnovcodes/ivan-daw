import { describe, expect, it } from 'vitest';
import { permits, playTarget, wiringLocked } from './playOnly';

const header = { kind: 'header' as const, node: 'n1', nodePos: { x: 0, y: 0 } };
const out = { kind: 'outPort' as const, ref: { node: 'n1', port: 'out' } };
const armOut = { kind: 'armOut' as const, end: { node: 'n1', index: 1 } };

describe('play-only canvas rules', () => {
  it('changes nothing in edit mode', () => {
    expect(playTarget('edit', header)).toBe(header);
    expect(playTarget('edit', out)).toBe(out);
    expect(permits('edit', { type: 'removeNode', id: 'n1' })).toBe(true);
  });

  it('keeps header grabs (plugins can be moved)', () => {
    expect(playTarget('play', header)).toBe(header);
    expect(permits('play', { type: 'moveNode', id: 'n1', x: 1, y: 1 })).toBe(true);
  });

  it('no connector starts a cable and no cable can be picked', () => {
    expect(playTarget('play', out)).toBeUndefined();
    expect(playTarget('play', armOut)).toBeUndefined();
    expect(playTarget('play', { kind: 'cable', id: 'c1' })).toBeUndefined();
    expect(playTarget('play', { kind: 'cableX', id: 'c1' })).toBeUndefined();
    expect(playTarget('play', { kind: 'armCable', id: 'a1' })).toBeUndefined();
    expect(playTarget('play', { kind: 'empty' })).toEqual({ kind: 'empty' });
  });

  it('blocks removing plugins and every cable or ARM link edit', () => {
    expect(permits('play', { type: 'removeNode', id: 'n1' })).toBe(false);
    expect(permits('play', { type: 'disconnect', id: 'c1' })).toBe(false);
    const ends = { from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' } };
    expect(permits('play', { type: 'connect', ...ends })).toBe(false);
    const arm = { from: { node: 'a', index: 1 }, to: { node: 'b', index: 2 } };
    expect(permits('play', { type: 'connectArm', ...arm })).toBe(false);
    expect(permits('play', { type: 'removeArm', id: 'a1' })).toBe(false);
    expect(permits('play', { type: 'select', sel: { node: 'n1' } })).toBe(true);
  });

  it('mobile: no window moves, no connector or cable; only selecting runs', () => {
    expect(playTarget('mobile', header)).toBeUndefined();
    expect(playTarget('mobile', out)).toBeUndefined();
    expect(playTarget('mobile', { kind: 'cable', id: 'c1' })).toBeUndefined();
    expect(playTarget('mobile', { kind: 'empty' })).toEqual({ kind: 'empty' });
    expect(permits('mobile', { type: 'moveNode', id: 'n1', x: 1, y: 1 })).toBe(false);
    expect(permits('mobile', { type: 'removeNode', id: 'n1' })).toBe(false);
    expect(permits('mobile', { type: 'select', sel: {} })).toBe(true);
  });

  it('locks the wiring in play-only and mobile', () => {
    expect(wiringLocked('play')).toBe(true);
    expect(wiringLocked('mobile')).toBe(true);
    expect(wiringLocked('edit')).toBe(false);
    expect(wiringLocked('dev')).toBe(false);
  });
});
