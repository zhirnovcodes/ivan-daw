import { describe, expect, it } from 'vitest';
import {
  type GestureCtx,
  type GestureState,
  IDLE,
  keyEffects,
  reduce,
  type Target,
} from './gesture';

const ctx: GestureCtx = { sizeOf: () => ({ w: 180, h: 100 }) };
const header = { kind: 'header', node: 'n1', nodePos: { x: 100, y: 100 } } as const;

describe('drag a node', () => {
  it('selects, then moves keeping the grab offset', () => {
    const down = reduce(IDLE, { type: 'down', target: header, at: { x: 120, y: 110 } }, ctx);
    expect(down.effects).toEqual([{ type: 'select', sel: { node: 'n1' } }]);
    const move = reduce(down.state, { type: 'move', at: { x: 220, y: 160 } }, ctx);
    expect(move.effects).toEqual([{ type: 'moveNode', id: 'n1', x: 200, y: 150 }]);
  });
  it('goes past the window edges, down to the world minimum', () => {
    const s: GestureState = { mode: 'drag', node: 'n1', dx: 10, dy: 10 };
    expect(reduce(s, { type: 'move', at: { x: -50, y: 9999 } }, ctx).effects).toEqual([
      { type: 'moveNode', id: 'n1', x: -60, y: 9989 },
    ]);
    expect(reduce(s, { type: 'move', at: { x: -9000, y: 0 } }, ctx).effects).toEqual([
      { type: 'moveNode', id: 'n1', x: -2000, y: -10 },
    ]);
  });
  it('ends on pointer up', () => {
    const s: GestureState = { mode: 'drag', node: 'n1', dx: 0, dy: 0 };
    expect(reduce(s, { type: 'up', at: { x: 0, y: 0 } }, ctx)).toEqual({
      state: IDLE,
      effects: [],
    });
  });
});

describe('connect', () => {
  const from = { node: 'n1', port: 'out' };
  const start = reduce(
    IDLE,
    { type: 'down', target: { kind: 'outPort', ref: from }, at: { x: 1, y: 2 } },
    ctx,
  );
  it('follows the pointer', () => {
    const m = reduce(start.state, { type: 'move', at: { x: 50, y: 60 } }, ctx);
    expect(m.state).toEqual({ mode: 'connect', from, at: { x: 50, y: 60 } });
    expect(m.effects).toEqual([]);
  });
  it('connects on a drop over an input', () => {
    const to = { node: 'n2', port: 'in' };
    expect(reduce(start.state, { type: 'up', at: { x: 0, y: 0 }, drop: to }, ctx)).toEqual({
      state: IDLE,
      effects: [{ type: 'connect', from, to }],
    });
  });
  it('does nothing when released elsewhere or cancelled', () => {
    expect(reduce(start.state, { type: 'up', at: { x: 0, y: 0 } }, ctx).effects).toEqual([]);
    expect(reduce(start.state, { type: 'cancel' }, ctx).state).toEqual(IDLE);
  });
});

describe('selection and cables', () => {
  const down = (target: Target) =>
    reduce(IDLE, { type: 'down', target, at: { x: 0, y: 0 } }, ctx).effects;
  it('selects a node body, a cable, or clears on empty', () => {
    expect(down({ kind: 'body', node: 'n2' })).toEqual([{ type: 'select', sel: { node: 'n2' } }]);
    expect(down({ kind: 'cable', id: 'c1' })).toEqual([{ type: 'select', sel: { cable: 'c1' } }]);
    expect(down({ kind: 'empty' })).toEqual([{ type: 'select', sel: {} }]);
  });
  it('× disconnects', () => {
    expect(down({ kind: 'cableX', id: 'c1' })).toEqual([
      { type: 'disconnect', id: 'c1' },
      { type: 'select', sel: {} },
    ]);
  });
});

describe('keys', () => {
  it('Escape clears', () => {
    expect(keyEffects('Escape', { node: 'n1' })).toEqual([{ type: 'select', sel: {} }]);
  });
  it('Delete and Backspace remove the selected cable first, else the node', () => {
    expect(keyEffects('Delete', { cable: 'c1' })).toEqual([{ type: 'disconnect', id: 'c1' }]);
    expect(keyEffects('Backspace', { node: 'n1' })).toEqual([{ type: 'removeNode', id: 'n1' }]);
  });
  it('never removes Master', () => {
    expect(keyEffects('Delete', { node: 'master' })).toEqual([]);
  });
  it('ignores other keys and empty selection', () => {
    expect(keyEffects('a', { node: 'n1' })).toEqual([]);
    expect(keyEffects('Delete', {})).toEqual([]);
  });
});

describe('ARM links (v1.2)', () => {
  const ctx = { sizeOf: () => ({ w: 100, h: 100 }) };
  it('drag from ARM OUT to ARM IN connects, onto its own node does nothing', () => {
    const from = { node: 'n1', index: 2 };
    let s = reduce(
      IDLE,
      { type: 'down', target: { kind: 'armOut', end: from }, at: { x: 0, y: 0 } },
      ctx,
    );
    expect(s.state.mode).toBe('armConnect');
    s = reduce(s.state, { type: 'move', at: { x: 5, y: 5 } }, ctx);
    const up = reduce(
      s.state,
      { type: 'up', at: { x: 9, y: 9 }, dropArm: { node: 'n2', index: 1 } },
      ctx,
    );
    expect(up.effects).toEqual([{ type: 'connectArm', from, to: { node: 'n2', index: 1 } }]);
    const self = reduce(
      s.state,
      { type: 'up', at: { x: 9, y: 9 }, dropArm: { node: 'n1', index: 1 } },
      ctx,
    );
    expect(self.effects).toEqual([]);
  });

  it('an ARM cable selects; Delete removes the selected link', () => {
    const s = reduce(
      IDLE,
      { type: 'down', target: { kind: 'armCable', id: 'a1' }, at: { x: 0, y: 0 } },
      ctx,
    );
    expect(s.effects).toEqual([{ type: 'select', sel: { arm: 'a1' } }]);
    expect(keyEffects('Delete', { arm: 'a1' })).toEqual([{ type: 'removeArm', id: 'a1' }]);
  });
});
