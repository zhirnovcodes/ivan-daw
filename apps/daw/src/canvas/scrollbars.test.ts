import { describe, expect, it } from 'vitest';
import { dragToWorld, extentsOf, scrollExtent, thumbOf } from './scrollbars';

describe('scrollbars', () => {
  it('extent is the node bounds grown by half a view on each side', () => {
    expect(scrollExtent(0, 100, 0, 400)).toEqual({ min: -50, max: 450, start: 0, len: 100 });
  });

  it('no nodes: the thumb fills the track', () => {
    expect(thumbOf(scrollExtent(30, 100, undefined, undefined))).toEqual({ pos: 0, size: 1 });
  });

  it('thumb at the pan limits sits at the track ends', () => {
    // Centre at bounds.left (0): view starts at -50.
    expect(thumbOf(scrollExtent(-50, 100, 0, 400)).pos).toBe(0);
    // Centre at bounds.right (400): view starts at 350, thumb at the end.
    const t = thumbOf(scrollExtent(350, 100, 0, 400));
    expect(t.size).toBeCloseTo(0.2);
    expect(t.pos + t.size).toBeCloseTo(1);
  });

  it('a view past the extent widens it, so the thumb stays on the track', () => {
    const e = scrollExtent(1000, 100, 0, 400);
    expect(e.max).toBe(1100);
    const t = thumbOf(e);
    expect(t.pos + t.size).toBeCloseTo(1);
  });

  it('dragging the whole track moves the whole extent', () => {
    const e = scrollExtent(0, 100, 0, 400);
    expect(dragToWorld(250, 250, e)).toBe(500);
    expect(dragToWorld(10, 0, e)).toBe(0);
  });

  it('view length follows the zoom', () => {
    const e = extentsOf(
      { x: 0, y: 0, z: 2 },
      { w: 200, h: 100 },
      { left: 0, top: 0, right: 400, bottom: 300 },
    );
    expect(e.x.len).toBe(100);
    expect(e.y.len).toBe(50);
  });
});
