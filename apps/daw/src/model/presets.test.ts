import { describe, expect, it } from 'vitest';
import { findPreset, isLocalHost, isLoopback, presetSlug, sameName } from './presets';

describe('preset names', () => {
  it('slugs a name into a file-safe id', () => {
    expect(presetSlug('My Beat #2')).toBe('my-beat-2');
    expect(presetSlug('  Drums  ')).toBe('drums');
    expect(presetSlug('!!!')).toBe('');
  });
  it('matches names ignoring case and outer spaces', () => {
    expect(sameName('Drums', ' drums ')).toBe(true);
    expect(sameName('Drums', 'Drums 2')).toBe(false);
  });
  it('finds a preset by name first, then by file name', () => {
    const list = [
      { name: 'A b', file: 'a-b.json' },
      { name: 'a-b-c', file: 'a-b-c.json' },
    ];
    expect(findPreset(list, 'a B')?.file).toBe('a-b.json');
    expect(findPreset(list, 'a-b')?.file).toBe('a-b.json');
    expect(findPreset(list, 'A-B-C')?.file).toBe('a-b-c.json');
    expect(findPreset(list, 'zzz')).toBeUndefined();
    expect(findPreset(list, '!!')).toBeUndefined();
  });
});

describe('localhost only', () => {
  it('knows a page opened from this machine', () => {
    for (const h of [
      'localhost',
      'LOCALHOST',
      'app.localhost',
      '127.0.0.1',
      '127.1.2.3',
      '[::1]',
      '::1',
    ]) {
      expect(isLocalHost(h), h).toBe(true);
    }
    for (const h of ['192.168.1.5', 'ivancodes.com', 'localhost.evil.com', '10.0.0.1', '']) {
      expect(isLocalHost(h), h).toBe(false);
    }
  });
  it('knows a request from this machine', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isLoopback(a), a).toBe(true);
    for (const a of ['192.168.1.5', '::ffff:192.168.1.5', 'fe80::1', undefined]) {
      expect(isLoopback(a), String(a)).toBe(false);
    }
  });
});
