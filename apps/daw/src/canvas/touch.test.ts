import { describe, expect, it } from 'vitest';
import { fitView, touchStep } from './touch';

describe('touchStep', () => {
  it('one finger pans by its move, no zoom', () => {
    expect(touchStep([{ x: 10, y: 10 }], [{ x: 25, y: 5 }])).toEqual({
      dx: 15,
      dy: -5,
      dLevel: 0,
      at: { x: 25, y: 5 },
    });
  });

  it('two fingers pan by their midpoint and zoom by the change in spread', () => {
    const s = touchStep(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: -50, y: 10 },
        { x: 150, y: 10 },
      ],
    );
    expect(s?.dx).toBe(0);
    expect(s?.dy).toBe(10);
    expect(s?.dLevel).toBeCloseTo(1); // twice as far apart → one level in (2×)
    expect(s?.at).toEqual({ x: 50, y: 10 });
  });

  it('does nothing without pointers or when the lists differ', () => {
    expect(touchStep([], [])).toBeUndefined();
    expect(touchStep([{ x: 0, y: 0 }], [])).toBeUndefined();
  });

  it('ignores the zoom when two fingers sit on one spot', () => {
    const p = { x: 5, y: 5 };
    expect(touchStep([p, p], [p, p])?.dLevel).toBe(0);
  });
});

describe('fitView', () => {
  it('centres the bounds and zooms out until they fit', () => {
    const c = fitView({ left: 0, top: 0, right: 1600, bottom: 800 }, { w: 400, h: 800 }, 0);
    expect(c.z).toBeCloseTo(0.25);
    expect(c.x + 400 / (2 * c.z)).toBeCloseTo(800);
    expect(c.y + 800 / (2 * c.z)).toBeCloseTo(400);
  });

  it('never zooms in past 100% and never out past 25%', () => {
    expect(fitView({ left: 0, top: 0, right: 10, bottom: 10 }, { w: 400, h: 800 }).z).toBe(1);
    expect(fitView({ left: 0, top: 0, right: 1e6, bottom: 10 }, { w: 400, h: 800 }).z).toBe(0.25);
  });
});
