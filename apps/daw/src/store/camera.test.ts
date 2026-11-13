import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  clampCamera,
  SNAP_BAND,
  snapLevel,
  toScreen,
  toWorld,
  WHEEL_MAX_STEP,
  wheelZoom,
  zoomAround,
} from './camera';

const view = { w: 1000, h: 600 };
const bounds = { left: 0, top: 0, right: 2000, bottom: 1000 };

describe('camera math', () => {
  it('toWorld and toScreen are inverses at any zoom', () => {
    const c = { x: 120, y: -40, z: 0.5 };
    expect(toWorld({ x: 100, y: 50 }, c)).toEqual({ x: 320, y: 60 });
    expect(toScreen(toWorld({ x: 33, y: 77 }, c), c)).toEqual({ x: 33, y: 77 });
  });

  it('zoomAround keeps the world point under the pointer', () => {
    const c = { x: 10, y: 20, z: 1 };
    const at = { x: 400, y: 300 };
    const before = toWorld(at, c);
    const next = zoomAround(c, at, 2);
    expect(next.z).toBe(2);
    expect(toWorld(at, next)).toEqual(before);
  });

  it('snaps the level to 0 near 100% and leaves it alone outside', () => {
    expect(snapLevel(0.1)).toBe(0);
    expect(snapLevel(-0.1)).toBe(0);
    expect(snapLevel(SNAP_BAND + 0.01)).toBeCloseTo(SNAP_BAND + 0.01);
    expect(snapLevel(-0.6)).toBe(-0.6);
  });

  it('wheel up zooms in, one event is capped, line mode counts lines', () => {
    expect(wheelZoom(-30, 0, 600)).toBeGreaterThan(0);
    expect(wheelZoom(30, 0, 600)).toBeLessThan(0);
    expect(wheelZoom(-10_000, 0, 600)).toBe(WHEEL_MAX_STEP);
    expect(wheelZoom(3, 1, 600)).toBeCloseTo(wheelZoom(48, 0, 600));
  });

  it('boundsOf spans every box', () => {
    expect(boundsOf([])).toBeUndefined();
    expect(
      boundsOf([
        { left: 10, top: 5, right: 50, bottom: 40 },
        { left: -20, top: 30, right: 30, bottom: 90 },
      ]),
    ).toEqual({ left: -20, top: 5, right: 50, bottom: 90 });
  });
});

describe('clampCamera: the view centre stays inside the node bounds', () => {
  const at100 = { x: 0, y: 0, z: 1 }; // centre (500, 300): inside

  it('lets moves inside the bounds through unchanged', () => {
    const next = { x: 200, y: 100, z: 1 };
    expect(clampCamera(next, at100, view, bounds)).toBe(next);
  });

  it('stops at half a screen past the outermost node, each side', () => {
    // Centre may go to x 2000 → camera x 1500; to y 1000 → camera y 700.
    expect(clampCamera({ x: 9000, y: 9000, z: 1 }, at100, view, bounds)).toEqual({
      x: 1500,
      y: 700,
      z: 1,
    });
    // Centre may go to 0 → camera x -500, y -300.
    expect(clampCamera({ x: -9000, y: -9000, z: 1 }, at100, view, bounds)).toEqual({
      x: -500,
      y: -300,
      z: 1,
    });
  });

  it('measures half a screen in screen px at any zoom', () => {
    const prev = { x: 0, y: 0, z: 0.5 }; // centre (1000, 600)
    // At 50%, half the view is 1000 × 600 world px: the centre stops at x 2000 → camera x 1000.
    expect(clampCamera({ x: 5000, y: 0, z: 0.5 }, prev, view, bounds).x).toBe(1000);
  });

  it('never jumps: from outside, a move may come back but not go further out', () => {
    const out = { x: 3000, y: 0, z: 1 }; // centre x 3500, past the right edge (a node was deleted)
    expect(clampCamera({ x: 3100, y: 0, z: 1 }, out, view, bounds).x).toBe(3000);
    expect(clampCamera({ x: 2900, y: 0, z: 1 }, out, view, bounds).x).toBe(2900);
  });

  it('is free without nodes', () => {
    const next = { x: 1e6, y: -1e6, z: 1 };
    expect(clampCamera(next, at100, view, undefined)).toBe(next);
  });
});
