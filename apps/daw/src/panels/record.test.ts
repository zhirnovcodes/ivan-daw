import { describe, expect, it } from 'vitest';
import {
  formatRemaining,
  nextRec,
  type RecEvent,
  type RecState,
  recordingFileName,
} from './record';

const run = (from: RecState, ev: RecEvent) => nextRec(from, ev);

describe('nextRec', () => {
  it('Record while stopped waits for Play', () => {
    expect(run('off', { type: 'press', playing: false })).toEqual({
      state: 'armed',
      effect: 'arm',
    });
    expect(run('armed', { type: 'play' })).toEqual({ state: 'recording', effect: 'start' });
  });
  it('Record while playing starts at once', () => {
    expect(run('off', { type: 'press', playing: true })).toEqual({
      state: 'recording',
      effect: 'start',
    });
  });
  it('Record again disarms, or ends the recording and offers to save', () => {
    expect(run('armed', { type: 'press', playing: false })).toEqual({
      state: 'off',
      effect: 'none',
    });
    expect(run('recording', { type: 'press', playing: true })).toEqual({
      state: 'off',
      effect: 'finish',
    });
  });
  it('Stop and the limit end the recording and offer to save', () => {
    expect(run('recording', { type: 'stop' })).toEqual({ state: 'off', effect: 'finish' });
    expect(run('recording', { type: 'limit' })).toEqual({ state: 'off', effect: 'finish' });
  });
  it('ignores what does not apply', () => {
    expect(run('off', { type: 'play' })).toEqual({ state: 'off', effect: 'none' });
    expect(run('off', { type: 'stop' })).toEqual({ state: 'off', effect: 'none' });
    expect(run('armed', { type: 'stop' })).toEqual({ state: 'armed', effect: 'none' });
    expect(run('recording', { type: 'play' })).toEqual({ state: 'recording', effect: 'none' });
  });
});

describe('recordingFileName', () => {
  it('uses local date and time, safe for every file system', () => {
    expect(recordingFileName(new Date(2026, 10, 28, 9, 5, 7))).toBe(
      'IvanDAW 2026-11-28 09-05-07.mp3',
    );
  });
});

describe('formatRemaining', () => {
  it('counts down in m:ss, rounding up', () => {
    expect(formatRemaining(300)).toBe('5:00');
    expect(formatRemaining(299.2)).toBe('5:00');
    expect(formatRemaining(299)).toBe('4:59');
    expect(formatRemaining(9.5)).toBe('0:10');
    expect(formatRemaining(0.01)).toBe('0:01');
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(-3)).toBe('0:00');
  });
});
