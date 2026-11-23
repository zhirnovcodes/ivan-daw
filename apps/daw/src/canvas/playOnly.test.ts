import { describe, expect, it } from 'vitest';
import { permits, playTarget } from './playOnly';

const header = { kind: 'header' as const, node: 'n1', nodePos: { x: 0, y: 0 } };
const out = { kind: 'outPort' as const, ref: { node: 'n1', port: 'out' } };
const armOut = { kind: 'armOut' as const, end: { node: 'n1', index: 1 } };

describe('play-only canvas rules', () => {
  it('changes nothing in edit mode', () => {
    expect(playTarget('edit', header)).toBe(header);
    expect(playTarget('edit', out, 'audio')).toBe(out);
    expect(permits('edit', { type: 'removeNode', id: 'n1' })).toBe(true);
  });

  it('turns a header grab into a plain select', () => {
    expect(playTarget('play', header)).toEqual({ kind: 'body', node: 'n1' });
  });

  it('audio and notes outputs start no cable; ARM OUT does', () => {
    expect(playTarget('play', out, 'audio')).toBeUndefined();
    expect(playTarget('play', out, 'events')).toBeUndefined();
    expect(playTarget('play', armOut)).toBe(armOut);
  });

  it('blocks moving and removing nodes and audio / notes cable edits; ARM links stay editable', () => {
    expect(permits('play', { type: 'moveNode', id: 'n1', x: 1, y: 1 })).toBe(false);
    expect(permits('play', { type: 'removeNode', id: 'n1' })).toBe(false);
    expect(permits('play', { type: 'disconnect', id: 'c1' })).toBe(false);
    const ends = { from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' } };
    expect(permits('play', { type: 'connect', ...ends })).toBe(false);
    expect(permits('play', { type: 'select', sel: { node: 'n1' } })).toBe(true);
    const arm = { from: { node: 'a', index: 1 }, to: { node: 'b', index: 2 } };
    expect(permits('play', { type: 'connectArm', ...arm })).toBe(true);
    expect(permits('play', { type: 'removeArm', id: 'a1' })).toBe(true);
  });
});
