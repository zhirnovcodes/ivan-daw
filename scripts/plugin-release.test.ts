import { describe, expect, it } from 'vitest';
import {
  assetUrl,
  buildNumber,
  latestBuild,
  needsFetch,
  readPin,
  safeEntryPath,
} from './plugin-release.mjs';

describe('plugin release helpers', () => {
  it('reads build numbers only from daw-build tags', () => {
    expect(buildNumber('daw-build-2')).toBe(2);
    expect(buildNumber('daw-build-x')).toBeUndefined();
    expect(buildNumber('v1.0.0')).toBeUndefined();
  });

  it('picks the newest build by number, not by string order', () => {
    expect(latestBuild(['daw-build-2', 'daw-build-10', 'daw-build-9', 'v3'])).toBe('daw-build-10');
    expect(latestBuild(['v1', 'nightly'])).toBeUndefined();
  });

  it('builds the release download URL', () => {
    expect(assetUrl('zhirnovcodes/Beatality', 'beatality-daw.zip', 'daw-build-2')).toBe(
      'https://github.com/zhirnovcodes/Beatality/releases/download/daw-build-2/beatality-daw.zip',
    );
    expect(assetUrl('someone/arp', 'arp-daw.zip', 'daw-build-7')).toBe(
      'https://github.com/someone/arp/releases/download/daw-build-7/arp-daw.zip',
    );
  });

  it('fetches when nothing or another release is installed, and skips the pinned one', () => {
    expect(needsFetch('daw-build-2', undefined)).toBe(true);
    expect(needsFetch('daw-build-2', 'daw-build-1\n')).toBe(true);
    expect(needsFetch('daw-build-2', 'daw-build-2\n')).toBe(false);
  });

  it('keeps zip entries inside dist', () => {
    expect(safeEntryPath('index.js')).toBe('index.js');
    expect(safeEntryPath('packs/samples/kick 1.wav')).toBe('packs/samples/kick 1.wav');
    expect(safeEntryPath('./packs/banks.json')).toBe('packs/banks.json');
    expect(safeEntryPath('packs/')).toBeUndefined();
    expect(safeEntryPath('../evil.js')).toBeUndefined();
    expect(safeEntryPath('/etc/passwd')).toBeUndefined();
    expect(safeEntryPath('C:/x.js')).toBeUndefined();
  });

  it('reads a full release pin', () => {
    const pkg = {
      name: '@ivandaw/beatality',
      ivandaw: {
        id: 'com.beatality.beatality',
        repo: 'zhirnovcodes/Beatality',
        asset: 'beatality-daw.zip',
        release: 'daw-build-4',
      },
    };
    expect(readPin(pkg, 'beatality')).toEqual({
      id: 'com.beatality.beatality',
      repo: 'zhirnovcodes/Beatality',
      asset: 'beatality-daw.zip',
      release: 'daw-build-4',
    });
  });

  it('returns undefined for a first-party plugin', () => {
    expect(
      readPin({ name: 'x', ivandaw: { id: 'ivandaw.base-sine-synth' } }, 'base-sine-synth'),
    ).toBeUndefined();
    expect(readPin({ name: 'x' }, 'x')).toBeUndefined();
  });

  it('throws on a half-filled pin, naming the folder', () => {
    expect(() => readPin({ ivandaw: { id: 'a', release: 'daw-build-1' } }, 'arp')).toThrow(
      /plugins\/arp\/package\.json.*repo, asset/,
    );
    expect(() =>
      readPin({ ivandaw: { id: 'a', repo: 'o/arp', asset: 'arp-daw.zip', release: 3 } }, 'arp'),
    ).toThrow(/release/);
  });
});
