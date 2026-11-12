import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CatalogEntry,
  MASTER_MANIFEST,
  mainAudioOut,
  manifestsFrom,
  parseCatalog,
} from './catalog';

const sine: CatalogEntry = {
  id: 'com.ivandaw.base-sine-synth',
  name: 'Base sine synth',
  kind: 'instrument',
  url: '/plugins/com.ivandaw.base-sine-synth/index.js',
  ports: [
    {
      id: 'in',
      label: 'in',
      kind: 'events',
      direction: 'in',
      accepts: ['midi', 'automation', 'transport', 'tempo'],
    },
    { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
  ],
};
const noteGen: CatalogEntry = {
  id: 'com.ivandaw.note-gen',
  name: 'Note generator',
  kind: 'midi',
  url: '/plugins/com.ivandaw.note-gen/index.js',
  ports: [{ id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseCatalog', () => {
  it('reads well-formed entries', () => {
    expect(parseCatalog({ plugins: [noteGen, sine] })).toEqual({ plugins: [noteGen, sine] });
  });

  it('drops malformed entries with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = [
      { ...sine, kind: 'synth' },
      { ...sine, url: 3 },
      { ...sine, ports: [{ id: 'x', label: 'x', kind: 'audio', direction: 'out' }] },
      null,
    ];
    expect(parseCatalog({ plugins: [noteGen, ...bad] }).plugins).toEqual([noteGen]);
    expect(warn).toHaveBeenCalledTimes(bad.length);
  });

  it('throws when there is no plugins list', () => {
    expect(() => parseCatalog({})).toThrow();
    expect(() => parseCatalog(null)).toThrow();
  });
});

describe('manifestsFrom', () => {
  it('maps plugin id → ports and always includes Master', () => {
    const m = manifestsFrom({ plugins: [noteGen, sine] });
    expect(m.get('builtin.master')).toBe(MASTER_MANIFEST);
    expect(m.get(sine.id)).toEqual({
      id: sine.id,
      name: sine.name,
      kind: 'instrument',
      ports: sine.ports,
    });
    expect(m.size).toBe(3);
  });
});

describe('mainAudioOut', () => {
  it('finds the main audio out, or nothing', () => {
    expect(mainAudioOut(sine)?.id).toBe('out');
    expect(mainAudioOut(noteGen)).toBeUndefined();
    expect(mainAudioOut(MASTER_MANIFEST)).toBeUndefined();
  });
});
