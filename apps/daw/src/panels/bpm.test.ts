import { describe, expect, it } from 'vitest';
import { clampBpm, parseBpm, stepBpm } from './bpm';

describe('parseBpm', () => {
  it('reads numbers', () => {
    expect(parseBpm('120')).toBe(120);
    expect(parseBpm(' 97.5 ')).toBe(97.5);
    expect(parseBpm('97,5')).toBe(97.5);
  });
  it('clamps to 40..240', () => {
    expect(parseBpm('10')).toBe(40);
    expect(parseBpm('999')).toBe(240);
  });
  it('rejects junk', () => {
    expect(parseBpm('')).toBeUndefined();
    expect(parseBpm('abc')).toBeUndefined();
    expect(parseBpm('Infinity')).toBeUndefined();
  });
});

describe('stepBpm', () => {
  it('steps by 1, or 10 with Shift', () => {
    expect(stepBpm(120, 1, false)).toBe(121);
    expect(stepBpm(120, -1, false)).toBe(119);
    expect(stepBpm(120, 1, true)).toBe(130);
    expect(stepBpm(120, -1, true)).toBe(110);
  });
  it('stops at the ends', () => {
    expect(stepBpm(240, 1, false)).toBe(240);
    expect(stepBpm(235, 1, true)).toBe(240);
    expect(stepBpm(40, -1, false)).toBe(40);
    expect(stepBpm(45, -1, true)).toBe(40);
  });
  it('clampBpm', () => {
    expect(clampBpm(0)).toBe(40);
    expect(clampBpm(500)).toBe(240);
  });
});
