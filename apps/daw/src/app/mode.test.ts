import { describe, expect, it } from 'vitest';
import { readMobile, readMode } from './mode';

describe('readMode', () => {
  it('reads ?mode=normal | play_only | dev', () => {
    expect(readMode('?mode=normal')).toBe('edit');
    expect(readMode('?mode=play_only')).toBe('play');
    expect(readMode('?project=sine&mode=dev')).toBe('dev');
    expect(readMode('?mode=Play_Only')).toBe('play');
  });
  it('mobile is not a mode any more', () => {
    expect(readMode('?mode=mobile')).toBe('edit');
    expect(readMode('?mode=dev&mobile=true')).toBe('dev');
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

describe('readMobile', () => {
  const yes = () => true;
  const no = () => false;
  it('reads ?mobile=true | false (and 1 | 0), whatever the device', () => {
    expect(readMobile('?mobile=true', no)).toBe(true);
    expect(readMobile('?mode=dev&mobile=TRUE', no)).toBe(true);
    expect(readMobile('?mobile=1', no)).toBe(true);
    expect(readMobile('?mobile=false', yes)).toBe(false);
    expect(readMobile('?mobile=0', yes)).toBe(false);
  });
  it('detects when missing or unknown', () => {
    expect(readMobile('', yes)).toBe(true);
    expect(readMobile('?mode=play_only', no)).toBe(false);
    expect(readMobile('?mobile=maybe', yes)).toBe(true);
    expect(readMobile('?mode=mobile', no)).toBe(false);
  });
});
