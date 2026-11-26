import { describe, expect, it } from 'vitest';
import {
  findPreset,
  isLocalHost,
  isLoopback,
  presetFile,
  presetSlug,
  readEntries,
  sameName,
} from './presets';

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
      { name: 'A b', mobile: false, file: 'a-b.json' },
      { name: 'a-b-c', mobile: false, file: 'a-b-c.json' },
    ];
    expect(findPreset(list, 'a B', false)?.file).toBe('a-b.json');
    expect(findPreset(list, 'a-b', false)?.file).toBe('a-b.json');
    expect(findPreset(list, 'A-B-C', false)?.file).toBe('a-b-c.json');
    expect(findPreset(list, 'zzz', false)).toBeUndefined();
    expect(findPreset(list, '!!', false)).toBeUndefined();
  });
  it('prefers the kind for the page mode, else opens the other kind', () => {
    const both = [
      { name: 'Beat', mobile: false, file: 'beat.json' },
      { name: 'Beat', mobile: true, file: 'beat.mobile.json' },
    ];
    expect(findPreset(both, 'beat', true)?.file).toBe('beat.mobile.json');
    expect(findPreset(both, 'beat', false)?.file).toBe('beat.json');
    const desktopOnly = [{ name: 'BeatalityOnly', mobile: false, file: 'beatalityonly.json' }];
    expect(findPreset(desktopOnly, 'BeatalityOnly', true)?.file).toBe('beatalityonly.json');
    const mobileOnly = [{ name: 'Pad', mobile: true, file: 'pad.mobile.json' }];
    expect(findPreset(mobileOnly, 'pad', false)?.file).toBe('pad.mobile.json');
  });
  it('names files by kind and reads old index entries as desktop', () => {
    expect(presetFile('beat', false)).toBe('beat.json');
    expect(presetFile('beat', true)).toBe('beat.mobile.json');
    expect(
      readEntries([
        { name: 'Old', file: 'old.json' },
        { name: 'M', mobile: true, file: 'm.mobile.json' },
        { name: 3 },
      ]),
    ).toEqual([
      { name: 'Old', mobile: false, file: 'old.json' },
      { name: 'M', mobile: true, file: 'm.mobile.json' },
    ]);
    expect(readEntries({})).toEqual([]);
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
