import { describe, expect, it } from 'vitest';
import { placeNode } from './placement';

describe('placeNode', () => {
  const c = { x: 500, y: 300 };
  it('uses the centre when it is free', () => {
    expect(placeNode(c, [{ x: 10, y: 10 }])).toEqual({ x: 500, y: 300 });
  });
  it('offsets 24 px for each node already at the spot', () => {
    expect(placeNode(c, [{ x: 500, y: 300 }])).toEqual({ x: 524, y: 324 });
    expect(
      placeNode(c, [
        { x: 500, y: 300 },
        { x: 524, y: 324 },
        { x: 548, y: 348 },
      ]),
    ).toEqual({ x: 572, y: 372 });
  });
  it('skips over a gap only if the spot is free', () => {
    expect(placeNode(c, [{ x: 524, y: 324 }])).toEqual({ x: 500, y: 300 });
  });
  it('rounds a fractional centre', () => {
    expect(placeNode({ x: 500.4, y: 299.6 }, [])).toEqual({ x: 500, y: 300 });
  });
});
