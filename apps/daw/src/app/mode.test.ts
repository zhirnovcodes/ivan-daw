import { describe, expect, it } from 'vitest';
import { readMode } from './mode';

describe('readMode', () => {
  it('reads ?mode=normal | play_only | dev', () => {
    expect(readMode('?mode=normal')).toBe('edit');
    expect(readMode('?mode=play_only')).toBe('play');
    expect(readMode('?project=sine&mode=dev')).toBe('dev');
    expect(readMode('?mode=Play_Only')).toBe('play');
  });
  it('reads ?mode=mobile', () => {
    expect(readMode('?mode=mobile')).toBe('mobile');
    expect(readMode('?project=sine&mode=MOBILE')).toBe('mobile');
    expect(readMode('?mobile=true')).toBe('edit');
  });
  it('opens normal when mode is missing or unknown', () => {
    expect(readMode('')).toBe('edit');
    expect(readMode('?mode=')).toBe('edit');
    expect(readMode('?mode=bogus')).toBe('edit');
  });
  it('ignores the old flags', () => {
    expect(readMode('?play_only=true')).toBe('edit');
    expect(readMode('?dev=true')).toBe('edit');
  });
});
