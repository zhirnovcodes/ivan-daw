import { describe, expect, it } from 'vitest';
import { formatBeat, formatDb, formatPan, gainToDb } from './format';

describe('dB', () => {
  it('converts gain to dB', () => {
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(gainToDb(1.5)).toBeCloseTo(3.52, 2);
    expect(gainToDb(0)).toBe(Number.NEGATIVE_INFINITY);
  });
  it('formats with one decimal and an explicit sign', () => {
    expect(formatDb(1)).toBe('0.0 dB');
    expect(formatDb(0.5)).toBe('-6.0 dB');
    expect(formatDb(1.5)).toBe('+3.5 dB');
    expect(formatDb(0)).toBe('-∞ dB');
    expect(formatDb(0.00005)).toBe('-∞ dB');
  });
  it('never prints -0.0', () => {
    expect(formatDb(0.9999)).toBe('0.0 dB');
  });
});

describe('formatPan', () => {
  it('shows C, L and R', () => {
    expect(formatPan(0)).toBe('C');
    expect(formatPan(-0.4)).toBe('L40');
    expect(formatPan(1)).toBe('R100');
    expect(formatPan(0.004)).toBe('C');
  });
});

describe('formatBeat', () => {
  it('is bar.beat, 1-based', () => {
    expect(formatBeat(0, 4)).toBe('1.1');
    expect(formatBeat(3.99, 4)).toBe('1.4');
    expect(formatBeat(4, 4)).toBe('2.1');
    expect(formatBeat(6.5, 4)).toBe('2.3');
    expect(formatBeat(7, 3)).toBe('3.2');
  });
  it('survives bad input', () => {
    expect(formatBeat(-2, 4)).toBe('1.1');
    expect(formatBeat(Number.NaN, 4)).toBe('1.1');
    expect(formatBeat(5, 0)).toBe('2.2');
  });
});
