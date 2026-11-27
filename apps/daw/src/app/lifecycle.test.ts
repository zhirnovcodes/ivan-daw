import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUSPEND_DELAY_MS, sleepWhenHidden } from './lifecycle';

function setup() {
  const target = new EventTarget();
  const doc = Object.assign(target, { hidden: false }) as unknown as Document & { hidden: boolean };
  const pause = vi.fn();
  const suspend = vi.fn(() => Promise.resolve());
  const wake = vi.fn();
  const remove = sleepWhenHidden({ doc, pause, suspend, wake });
  const show = (hidden: boolean): void => {
    doc.hidden = hidden;
    target.dispatchEvent(new Event('visibilitychange'));
  };
  return { pause, suspend, wake, remove, show };
}

describe('sleepWhenHidden', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses at once and suspends after the fade', () => {
    const s = setup();
    s.show(true);
    expect(s.pause).toHaveBeenCalledTimes(1);
    expect(s.suspend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SUSPEND_DELAY_MS);
    expect(s.suspend).toHaveBeenCalledTimes(1);
  });

  it('wakes when visible again and does not play', () => {
    const s = setup();
    s.show(true);
    vi.advanceTimersByTime(SUSPEND_DELAY_MS);
    s.show(false);
    expect(s.wake).toHaveBeenCalledTimes(1);
    expect(s.pause).toHaveBeenCalledTimes(1);
  });

  it('does not suspend if the page comes back before the fade ends', () => {
    const s = setup();
    s.show(true);
    s.show(false);
    vi.advanceTimersByTime(SUSPEND_DELAY_MS * 2);
    expect(s.suspend).not.toHaveBeenCalled();
  });

  it('remove stops listening and cancels a pending suspend', () => {
    const s = setup();
    s.show(true);
    s.remove();
    vi.advanceTimersByTime(SUSPEND_DELAY_MS);
    s.show(true);
    expect(s.suspend).not.toHaveBeenCalled();
    expect(s.pause).toHaveBeenCalledTimes(1);
  });
});
