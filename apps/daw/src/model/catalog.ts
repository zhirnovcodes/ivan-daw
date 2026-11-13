// Contract C6: the plugin catalog and the plugin folder layout. Tech design: "Plugin loading and the catalog".
//
// Plugin package layout (plugins/<name>/):
//   package.json        name, version, "ivandaw": { "id": "com.ivandaw.note-gen" }
//   src/index.ts        default export: PluginFactory (manifest + create)
//   src/worklet.ts      AudioWorkletProcessor (instruments with DSP)
//   src/dsp.ts          pure DSP, unit-tested
//   src/test-page.html  standalone page: load the plugin, play notes by key, no DAW needed
//   vite.config.ts      library mode → dist/index.js, dist/worklet.js, dist/manifest.json
//
// The plugin build writes dist/manifest.json (its PluginManifest as JSON). The dev server plugin
// (apps/daw/vite/plugins-catalog.ts) reads every plugins/*/dist/manifest.json, serves
// /plugins/catalog.json, and serves /plugins/<id>/* from plugins/<name>/dist/*.
// The DAW never imports plugin code at build time: it loads `url` with import() at runtime.

import type { PluginKind, PluginManifest, PortInfo } from 'ivandaw-core';
import { MASTER_IN, MASTER_PLUGIN } from './project';

export const CATALOG_URL = '/plugins/catalog.json';

export interface CatalogEntry {
  id: string; // manifest id, e.g. 'com.ivandaw.note-gen'
  name: string;
  kind: PluginKind;
  url: string; // module URL, e.g. '/plugins/com.ivandaw.note-gen/index.js'
  /**
   * The manifest's ports, copied from manifest.json, so the host knows a node's ports before
   * its module loads: the canvas can draw them, `connect` can validate, and `addNode` can cable
   * a new instrument's main out to Master.
   */
  ports: PortInfo[];
  /** The manifest's UI size (v1.1). Set → the plugin's own UI is shown inside its node box. */
  ui?: PluginUiSize;
}

/** A plugin UI's fixed size in CSS px, from `manifest.ui`. */
export type PluginUiSize = NonNullable<PluginManifest['ui']>;

export interface Catalog {
  plugins: CatalogEntry[];
}

/** What the router and store need of a manifest. Built from the catalog, then from the loaded module. */
export type PortsManifest = Pick<PluginManifest, 'id' | 'name' | 'kind' | 'ports'> & {
  ui?: PluginUiSize;
};

/** Plugin id → manifest. Always includes `builtin.master`. */
export type ManifestMap = ReadonlyMap<string, PortsManifest>;

/** Master's ports, as the router sees them. It has no outputs on the canvas. */
export const MASTER_MANIFEST: PortsManifest = {
  id: MASTER_PLUGIN,
  name: 'Master',
  kind: 'utility',
  ports: [{ id: MASTER_IN, label: 'in', kind: 'audio', direction: 'in', channels: 2, main: true }],
};

/** A usable `manifest.ui`: positive width and height. Anything else means "no UI". */
export function readUiSize(v: unknown): PluginUiSize | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const u = v as Record<string, unknown>;
  if (typeof u.width !== 'number' || typeof u.height !== 'number') return undefined;
  if (!(u.width > 0 && u.height > 0)) return undefined;
  return { width: u.width, height: u.height, resizable: u.resizable === true };
}

const KINDS: readonly PluginKind[] = ['instrument', 'effect', 'midi', 'modulator', 'utility'];

function isPort(v: unknown): v is PortInfo {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.label !== 'string') return false;
  if (p.kind === 'audio') {
    return (
      (p.direction === 'in' || p.direction === 'out') &&
      (p.channels === 1 || p.channels === 2) &&
      typeof p.main === 'boolean'
    );
  }
  if (p.kind === 'events') {
    return (p.direction === 'in' || p.direction === 'out') && Array.isArray(p.accepts);
  }
  return p.kind === 'modulation' && p.direction === 'out';
}

/** Reads untrusted catalog JSON. Entries with a bad shape are dropped with a console warning. */
export function parseCatalog(raw: unknown): Catalog {
  const list =
    typeof raw === 'object' && raw !== null ? (raw as { plugins?: unknown }).plugins : undefined;
  if (!Array.isArray(list)) throw new Error('catalog: expected { plugins: [] }');
  const plugins: CatalogEntry[] = [];
  for (const e of list) {
    const r = e as Record<string, unknown>;
    if (
      typeof r === 'object' &&
      r !== null &&
      typeof r.id === 'string' &&
      typeof r.name === 'string' &&
      typeof r.url === 'string' &&
      KINDS.includes(r.kind as PluginKind) &&
      Array.isArray(r.ports) &&
      r.ports.every(isPort)
    ) {
      const ui = readUiSize(r.ui);
      plugins.push({
        id: r.id,
        name: r.name,
        kind: r.kind as PluginKind,
        url: r.url,
        ports: r.ports,
        ...(ui ? { ui } : {}),
      });
    } else {
      console.warn('catalog: skipping a malformed entry', e);
    }
  }
  return { plugins };
}

export async function fetchCatalog(url = CATALOG_URL): Promise<Catalog> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseCatalog(await res.json());
}

/** Master plus every catalog entry, keyed by plugin id. */
export function manifestsFrom(catalog: Catalog): ManifestMap {
  const map = new Map<string, PortsManifest>([[MASTER_PLUGIN, MASTER_MANIFEST]]);
  for (const e of catalog.plugins) {
    map.set(e.id, {
      id: e.id,
      name: e.name,
      kind: e.kind,
      ports: e.ports,
      ...(e.ui ? { ui: e.ui } : {}),
    });
  }
  return map;
}

/** The main audio out of a manifest, if it has one. */
export function mainAudioOut(m: PortsManifest): PortInfo | undefined {
  return m.ports.find((p) => p.kind === 'audio' && p.direction === 'out' && p.main);
}
