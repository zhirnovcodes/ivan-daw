import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deletePreset, readIndex, savePreset, storeFile } from './presets';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

const project = (files?: Record<string, string>) => ({
  format: 'ivandaw.project',
  version: 1,
  transport: { bpm: 120 },
  nodes: [
    {
      id: 'n1',
      plugin: 'p',
      x: 0,
      y: 0,
      ...(files ? { state: { pluginId: 'p', pluginVersion: '1', data: { k: 1 }, files } } : {}),
    },
  ],
  cables: [],
});

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ivd-presets-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('preset library', () => {
  it('saves a preset and lists it', () => {
    expect(savePreset(dir, 'My Beat', false, project())).toEqual({
      name: 'My Beat',
      mobile: false,
      file: 'my-beat.json',
    });
    expect(readIndex(dir)).toEqual([{ name: 'My Beat', mobile: false, file: 'my-beat.json' }]);
    const saved = JSON.parse(readFileSync(join(dir, 'my-beat.json'), 'utf8'));
    expect(saved.nodes.map((n: { id: string }) => n.id)).toEqual(['n1', 'master']);
  });

  it('replaces a preset with the same name, any case, in place', () => {
    savePreset(dir, 'A', false, project());
    savePreset(dir, 'B', false, project());
    savePreset(dir, 'a', false, { ...project(), transport: { bpm: 90 } });
    expect(readIndex(dir).map((e) => e.name)).toEqual(['a', 'B']);
    expect(JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8')).transport.bpm).toBe(90);
  });

  it('keeps a mobile and a desktop preset of the same name apart', () => {
    savePreset(dir, 'Beat', false, { ...project(), transport: { bpm: 100 } });
    expect(savePreset(dir, 'beat', true, { ...project(), transport: { bpm: 140 } })).toEqual({
      name: 'beat',
      mobile: true,
      file: 'beat.mobile.json',
    });
    expect(readIndex(dir).map((e) => [e.name, e.mobile])).toEqual([
      ['Beat', false],
      ['beat', true],
    ]);
    expect(JSON.parse(readFileSync(join(dir, 'beat.json'), 'utf8')).transport.bpm).toBe(100);
    expect(JSON.parse(readFileSync(join(dir, 'beat.mobile.json'), 'utf8')).transport.bpm).toBe(140);
    expect(deletePreset(dir, 'BEAT', true)).toBe(true);
    expect(readIndex(dir).map((e) => e.file)).toEqual(['beat.json']);
    expect(existsSync(join(dir, 'beat.mobile.json'))).toBe(false);
  });

  it('keeps the saved view (zoom and scroll)', () => {
    savePreset(dir, 'V', false, { ...project(), view: { x: -40, y: 12.5, z: 0.5 } });
    expect(JSON.parse(readFileSync(join(dir, 'v.json'), 'utf8')).view).toEqual({
      x: -40,
      y: 12.5,
      z: 0.5,
    });
  });

  it('refuses a bad name, a non-project, and a file-name clash', () => {
    expect(() => savePreset(dir, '  !! ', false, project())).toThrow('bad preset name');
    expect(() => savePreset(dir, 'x', false, { nope: true })).toThrow();
    savePreset(dir, 'A b', false, project());
    expect(() => savePreset(dir, 'a-b', false, project())).toThrow('would overwrite');
  });

  it('deletes a preset', () => {
    savePreset(dir, 'A', false, project());
    expect(deletePreset(dir, 'a', true)).toBe(false);
    expect(deletePreset(dir, 'a', false)).toBe(true);
    expect(readIndex(dir)).toEqual([]);
    expect(existsSync(join(dir, 'a.json'))).toBe(false);
    expect(deletePreset(dir, 'a', false)).toBe(false);
  });

  it('stores state files by content and drops the ones no preset uses', () => {
    const one = storeFile(dir, bytes('one'));
    const two = storeFile(dir, bytes('two'));
    expect(storeFile(dir, bytes('one'))).toBe(one);
    savePreset(dir, 'A', false, project({ s: one }));
    expect(readdirSync(join(dir, 'files'))).toEqual([one.split('/').pop()]);
    savePreset(dir, 'B', true, project({ s: one }));
    deletePreset(dir, 'A', false);
    expect(readdirSync(join(dir, 'files'))).toHaveLength(1);
    deletePreset(dir, 'B', true);
    expect(readdirSync(join(dir, 'files'))).toHaveLength(0);
    void two;
  });
});
