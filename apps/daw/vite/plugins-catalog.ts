// Vite plugin: the plugin catalog. Tech design: "Plugin loading and the catalog", contract C6.
//
// Dev server:
// - GET /plugins/catalog.json  → { plugins: [{ id, name, kind, url, ports }] } (CatalogEntry).
// - GET /plugins/<id>/*        → plugins/<name>/dist/*.
// - `pnpm dev` also builds each plugin that has a `build` script and keeps it building in watch mode.
//   A plugin without one (Beatality) is prebuilt: its dist/ comes from scripts/fetch-plugins.mjs.
//
// Build (`vite build`, the hosted site, 2026-11-23): builds first-party plugins that have no dist yet,
// then writes the same layout as static files: <base>plugins/catalog.json with urls under the base,
// and every catalog plugin's dist/ at <base>plugins/<id>/. An empty catalog fails the build.
//
// The catalog is read from plugins/*/package.json ("ivandaw": { "id" }) and
// plugins/*/dist/manifest.json on every request, so a plugin that finishes building after the
// server started shows up on the next page load. With nothing built, the catalog is empty.

import { type ChildProcess, spawn } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { type Catalog, type CatalogEntry, readUiSize } from '../src/model/catalog';

export interface PluginPackage {
  /** Folder name under plugins/. */
  name: string;
  /** Plugin id from package.json `ivandaw.id`. */
  id: string;
  dir: string;
  /** The package.json scripts, to pick the watch command. */
  scripts: Record<string, string>;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Every plugins/<name>/ whose package.json declares `"ivandaw": { "id" }`. */
export function scanPackages(pluginsDir: string): PluginPackage[] {
  if (!existsSync(pluginsDir)) return [];
  const found: PluginPackage[] = [];
  for (const name of readdirSync(pluginsDir).sort()) {
    const dir = join(pluginsDir, name);
    const pkg = readJson(join(dir, 'package.json'));
    if (!isRecord(pkg) || !isRecord(pkg.ivandaw) || typeof pkg.ivandaw.id !== 'string') continue;
    const scripts: Record<string, string> = {};
    if (isRecord(pkg.scripts)) {
      for (const [k, v] of Object.entries(pkg.scripts)) if (typeof v === 'string') scripts[k] = v;
    }
    found.push({ name, id: pkg.ivandaw.id, dir, scripts });
  }
  return found;
}

/**
 * The catalog from what is built right now. Packages without a dist/manifest.json are skipped.
 * `base` is the app's base URL: entry urls are `<base>plugins/<id>/index.js`.
 */
export function buildCatalog(pluginsDir: string, base = '/'): Catalog {
  const plugins: CatalogEntry[] = [];
  for (const p of scanPackages(pluginsDir)) {
    const m = readJson(join(p.dir, 'dist', 'manifest.json'));
    if (!isRecord(m)) continue; // not built yet
    if (m.id !== p.id) {
      console.warn(
        `[plugins] ${p.name}: manifest id ${String(m.id)} differs from package.json id ${p.id}; skipped`,
      );
      continue;
    }
    if (typeof m.name !== 'string' || typeof m.kind !== 'string' || !Array.isArray(m.ports)) {
      console.warn(
        `[plugins] ${p.name}: dist/manifest.json is missing name, kind or ports; skipped`,
      );
      continue;
    }
    const ui = readUiSize(m.ui);
    plugins.push({
      id: p.id,
      name: m.name,
      kind: m.kind as CatalogEntry['kind'],
      url: `${base}plugins/${p.id}/index.js`,
      ports: m.ports as CatalogEntry['ports'],
      ...(ui ? { ui } : {}),
    });
  }
  return { plugins };
}

/** Maps /plugins/<id>/<file> to a file under that plugin's dist/, or undefined (also on `..` escapes). */
export function resolvePluginFile(pluginsDir: string, urlPath: string): string | undefined {
  const rest = urlPath.replace(/^\/plugins\//, '');
  const slash = rest.indexOf('/');
  if (slash <= 0) return undefined;
  let id: string;
  let file: string;
  try {
    id = decodeURIComponent(rest.slice(0, slash));
    file = decodeURIComponent(rest.slice(slash + 1));
  } catch {
    return undefined;
  }
  const pkg = scanPackages(pluginsDir).find((p) => p.id === id);
  if (!pkg || file === '') return undefined;
  const distDir = resolve(pkg.dir, 'dist');
  const target = resolve(distDir, file);
  return target.startsWith(distDir + sep) ? target : undefined;
}

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.html': 'text/html; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.woff2': 'font/woff2',
};

/** Every file under `dir`, as paths relative to it with `/` separators. */
export function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const d of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...listFiles(dir, rel));
    else if (d.isFile()) out.push(rel);
  }
  return out.sort();
}

function runBuild(p: PluginPackage): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn('pnpm', ['run', 'build'], { cwd: p.dir, stdio: 'inherit' });
    child.on('error', () => done(false));
    child.on('exit', (code) => done(code === 0));
  });
}

export interface PluginsCatalogOptions {
  /** Absolute path of the plugins folder. Default: <repo>/plugins. */
  pluginsDir?: string;
  /** Build every plugin once at start if needed, then keep it building in watch mode. Default true. */
  watch?: boolean;
}

export function pluginsCatalog(options: PluginsCatalogOptions = {}): Plugin {
  const pluginsDir = options.pluginsDir ?? resolve(import.meta.dirname, '../../../plugins');
  const watch = options.watch ?? true;
  const watchers: ChildProcess[] = [];
  let building = false;
  let base = '/';

  return {
    name: 'ivandaw-plugins-catalog',
    configResolved(config) {
      building = config.command === 'build';
      base = config.base;
    },
    async buildStart() {
      if (!building) return;
      // Prebuilt plugins (no build script) come from fetch-plugins; build the rest if they have no dist.
      const missing = scanPackages(pluginsDir).filter(
        (p) => p.scripts.build && !existsSync(join(p.dir, 'dist', 'manifest.json')),
      );
      for (const p of missing) {
        if (!(await runBuild(p))) this.error(`[plugins] ${p.name}: build failed`);
      }
    },
    generateBundle() {
      if (!building) return;
      const catalog = buildCatalog(pluginsDir, base);
      if (catalog.plugins.length === 0) {
        this.error('[plugins] the catalog is empty: no plugin has a dist/manifest.json');
      }
      const byId = new Map(scanPackages(pluginsDir).map((p) => [p.id, p]));
      for (const entry of catalog.plugins) {
        const pkg = byId.get(entry.id);
        if (!pkg) continue;
        const distDir = join(pkg.dir, 'dist');
        for (const rel of listFiles(distDir)) {
          this.emitFile({
            type: 'asset',
            fileName: `plugins/${entry.id}/${rel}`,
            source: readFileSync(join(distDir, rel)),
          });
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'plugins/catalog.json',
        source: JSON.stringify(catalog),
      });
    },
    async configureServer(server) {
      if (watch) {
        // Prebuilt plugins (no build script) are served as they are.
        const packages = scanPackages(pluginsDir).filter((p) => p.scripts.build);
        // A first build for plugins that have none, so the first page load already finds them.
        await Promise.all(
          packages
            .filter((p) => !existsSync(join(p.dir, 'dist', 'manifest.json')))
            .map(async (p) => {
              if (!(await runBuild(p))) console.warn(`[plugins] ${p.name}: first build failed`);
            }),
        );
        for (const p of packages) {
          const args = p.scripts['build:watch']
            ? ['run', 'build:watch']
            : ['exec', 'vite', 'build', '--watch'];
          const child = spawn('pnpm', args, { cwd: p.dir, stdio: 'inherit' });
          child.on('error', (e) => console.warn(`[plugins] ${p.name}: watch failed: ${e.message}`));
          watchers.push(child);
        }
        server.httpServer?.on('close', () => {
          for (const w of watchers) w.kill();
        });
      }

      server.middlewares.use((req, res, next) => {
        const url = ((req as { url?: string }).url ?? '').split('?')[0] ?? '';
        if (!url.startsWith('/plugins/')) return next();
        res.setHeader('Cache-Control', 'no-store');
        if (url === '/plugins/catalog.json') {
          res.setHeader('Content-Type', TYPES['.json'] as string);
          res.end(JSON.stringify(buildCatalog(pluginsDir)));
          return;
        }
        const file = resolvePluginFile(pluginsDir, url);
        if (!file || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}
