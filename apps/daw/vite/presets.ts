// Dev-server plugin: the preset library for development mode (?mode=dev). Added 2026-11-23.
//
// Presets are project files kept in the repo, so a build serves them as static files:
//   public/presets/index.json       [{ name, file }]  the list, in save order
//   public/presets/<slug>.json      one project each; open it with ?preset=<slug>
//   public/presets/files/<sha256>   plugin state files (PluginState.files), shared between presets
//
// Routes (dev server only, and only for requests from this machine; a build has none, so the hosted
// site is read-only):
//   POST   /__presets/file               raw bytes   → { path }  stores one state file
//   PUT    /__presets/preset?name=<name> project JSON → { file }  saves, replacing a preset of that name
//   DELETE /__presets/preset?name=<name>              → { ok }
// Saving or deleting removes state files no preset uses any more.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { isLoopback, type PresetEntry, presetSlug, sameName } from '../src/model/presets';
import { parseProject } from '../src/model/project';

const FILES = 'files';
/** Public path prefix of stored state files, relative to the app's base URL. */
export const FILES_PREFIX = `presets/${FILES}/`;

export function readIndex(dir: string): PresetEntry[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is PresetEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.name === 'string' &&
        typeof e.file === 'string',
    );
  } catch {
    return [];
  }
}

function writeIndex(dir: string, list: PresetEntry[]): void {
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(list, null, 2)}\n`);
}

/** Stores one state file by content hash; the same bytes always get the same path. */
export function storeFile(dir: string, bytes: Uint8Array): string {
  const name = createHash('sha256').update(bytes).digest('hex');
  const filesDir = join(dir, FILES);
  mkdirSync(filesDir, { recursive: true });
  const file = join(filesDir, name);
  if (!existsSync(file)) writeFileSync(file, bytes);
  return FILES_PREFIX + name;
}

/**
 * Saves a project under `name`. A preset with the same name (any case) is replaced. Throws on a bad
 * name or a document that isn't a project.
 */
export function savePreset(dir: string, name: string, doc: unknown): PresetEntry {
  const trimmed = name.trim();
  const slug = presetSlug(trimmed);
  if (!slug) throw new Error('bad preset name');
  const project = parseProject(doc);
  mkdirSync(dir, { recursive: true });
  const list = readIndex(dir);
  const old = list.find((e) => sameName(e.name, trimmed));
  const entry: PresetEntry = { name: trimmed, file: `${slug}.json` };
  // A clash on the file name with a differently named preset ("A b" / "a-b") would overwrite it.
  const clash = list.find((e) => e.file === entry.file && e !== old);
  if (clash) throw new Error(`"${trimmed}" would overwrite preset "${clash.name}"`);
  if (old && old.file !== entry.file) rmSync(join(dir, old.file), { force: true });
  writeFileSync(join(dir, entry.file), `${JSON.stringify(project, null, 2)}\n`);
  writeIndex(dir, old ? list.map((e) => (e === old ? entry : e)) : [...list, entry]);
  pruneFiles(dir);
  return entry;
}

export function deletePreset(dir: string, name: string): boolean {
  const list = readIndex(dir);
  const old = list.find((e) => sameName(e.name, name));
  if (!old) return false;
  rmSync(join(dir, old.file), { force: true });
  writeIndex(
    dir,
    list.filter((e) => e !== old),
  );
  pruneFiles(dir);
  return true;
}

/** Removes stored state files that no preset in the index points at. */
export function pruneFiles(dir: string): void {
  const filesDir = join(dir, FILES);
  if (!existsSync(filesDir)) return;
  const used = new Set<string>();
  for (const e of readIndex(dir)) {
    try {
      const doc = parseProject(JSON.parse(readFileSync(join(dir, e.file), 'utf8')));
      for (const n of doc.nodes) for (const p of Object.values(n.state?.files ?? {})) used.add(p);
    } catch {
      // An unreadable preset keeps nothing alive.
    }
  }
  for (const f of readdirSync(filesDir)) {
    if (!used.has(FILES_PREFIX + f)) rmSync(join(filesDir, f), { force: true });
  }
}

/** The bits of a Node request the routes use (no @types/node here). */
interface Req {
  url?: string;
  method?: string;
  socket?: { remoteAddress?: string };
  on(event: string, listener: (chunk?: Uint8Array) => void): unknown;
}

function readBody(req: Req): Promise<Uint8Array> {
  return new Promise((ok, fail) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (c) => {
      if (c) chunks.push(c);
    });
    req.on('end', () => {
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.length;
      }
      ok(out);
    });
    req.on('error', () => fail(new Error('request failed')));
  });
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

export function presetLibrary(dir = resolve(import.meta.dirname, '../public/presets')): Plugin {
  return {
    name: 'ivandaw-preset-library',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (raw, res, next) => {
        const req = raw as unknown as Req;
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/__presets/')) {
          next();
          return;
        }
        const reply = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        // Only this machine may write presets, even when the dev server listens on the network.
        if (!isLoopback(req.socket?.remoteAddress)) {
          reply(403, { error: 'presets can only be saved from localhost' });
          return;
        }
        try {
          if (req.method === 'POST' && url.pathname === '/__presets/file') {
            reply(200, { path: storeFile(dir, await readBody(req)) });
            return;
          }
          if (url.pathname === '/__presets/preset') {
            const name = url.searchParams.get('name') ?? '';
            if (req.method === 'PUT') {
              const doc: unknown = JSON.parse(text(await readBody(req)));
              reply(200, savePreset(dir, name, doc));
              return;
            }
            if (req.method === 'DELETE') {
              if (!deletePreset(dir, name)) reply(404, { error: `no preset "${name}"` });
              else reply(200, { ok: true });
              return;
            }
          }
          reply(404, { error: 'unknown preset route' });
        } catch (e) {
          reply(400, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
