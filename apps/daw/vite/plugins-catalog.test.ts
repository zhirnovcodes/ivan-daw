import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCatalog, resolvePluginFile, scanPackages } from './plugins-catalog';

const PORTS = [
  { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
];

let root: string;

function plugin(name: string, id: string | null, manifest?: unknown, scripts?: object) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  const pkg: Record<string, unknown> = { name: `@ivandaw/${name}`, scripts };
  if (id) pkg.ivandaw = { id };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  if (manifest) writeFileSync(join(dir, 'dist', 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(import.meta.dirname, '.tmp-plugins-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('buildCatalog', () => {
  it('is empty when the plugins folder is missing or has nothing built', () => {
    expect(buildCatalog(join(root, 'nope'))).toEqual({ plugins: [] });
    plugin('synth', 'com.test.synth'); // package.json only, no dist/manifest.json
    expect(buildCatalog(root)).toEqual({ plugins: [] });
  });

  it('lists built plugins with id, name, kind, url and ports', () => {
    plugin('synth', 'com.test.synth', {
      id: 'com.test.synth',
      name: 'Synth',
      kind: 'instrument',
      ports: PORTS,
    });
    plugin('gen', 'com.test.gen', { id: 'com.test.gen', name: 'Gen', kind: 'midi', ports: [] });
    expect(buildCatalog(root)).toEqual({
      plugins: [
        {
          id: 'com.test.gen',
          name: 'Gen',
          kind: 'midi',
          url: '/plugins/com.test.gen/index.js',
          ports: [],
        },
        {
          id: 'com.test.synth',
          name: 'Synth',
          kind: 'instrument',
          url: '/plugins/com.test.synth/index.js',
          ports: PORTS,
        },
      ],
    });
  });

  it('skips packages without an ivandaw id, an id mismatch and incomplete manifests', () => {
    plugin('plain', null, { id: 'x', name: 'X', kind: 'effect', ports: [] });
    plugin('mismatch', 'com.test.a', { id: 'com.test.b', name: 'B', kind: 'effect', ports: [] });
    plugin('noports', 'com.test.c', { id: 'com.test.c', name: 'C', kind: 'effect' });
    expect(buildCatalog(root)).toEqual({ plugins: [] });
    expect(scanPackages(root).map((p) => p.id)).toEqual(['com.test.a', 'com.test.c']);
  });
});

describe('resolvePluginFile', () => {
  it('maps /plugins/<id>/<file> to <plugin>/dist/<file>', () => {
    const dir = plugin('synth', 'com.test.synth');
    expect(resolvePluginFile(root, '/plugins/com.test.synth/worklet.js')).toBe(
      resolve(dir, 'dist/worklet.js'),
    );
  });

  it('refuses unknown ids, bare ids and paths that escape dist/', () => {
    plugin('synth', 'com.test.synth');
    expect(resolvePluginFile(root, '/plugins/com.other/index.js')).toBeUndefined();
    expect(resolvePluginFile(root, '/plugins/com.test.synth')).toBeUndefined();
    expect(resolvePluginFile(root, '/plugins/com.test.synth/')).toBeUndefined();
    expect(resolvePluginFile(root, '/plugins/com.test.synth/../package.json')).toBeUndefined();
    expect(resolvePluginFile(root, '/plugins/com.test.synth/%2e%2e/package.json')).toBeUndefined();
  });
});
