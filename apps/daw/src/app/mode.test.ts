import { describe, expect, it } from 'vitest';
import { readMode } from './mode';

describe('readMode', () => {
  it('opens play-only at /play_only and with ?play_only', () => {
    expect(readMode({ pathname: '/play_only', search: '' })).toBe('play');
    expect(readMode({ pathname: '/play_only/', search: '' })).toBe('play');
    expect(readMode({ pathname: '/', search: '?play_only' })).toBe('play');
    expect(readMode({ pathname: '/', search: '?click=1&play_only=1' })).toBe('play');
  });
  it('opens in edit mode otherwise', () => {
    expect(readMode({ pathname: '/', search: '' })).toBe('edit');
    expect(readMode({ pathname: '/play', search: '?click=1' })).toBe('edit');
  });
});
