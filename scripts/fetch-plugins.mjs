// Downloads the pinned CI build of every external plugin into plugins/<name>/dist.
// An external plugin is a plugins/<name>/package.json with ivandaw.repo, ivandaw.asset and
// ivandaw.release (see readPin in plugin-release.mjs). First-party plugins are skipped.
//
//   node scripts/fetch-plugins.mjs                  fetch every pinned release that is not installed yet
//   node scripts/fetch-plugins.mjs --update         pin the newest daw-build-<n> of every plugin, then fetch
//   node scripts/fetch-plugins.mjs --update <name>  the same for plugins/<name> only
//
// Runs on `pnpm i` and before `pnpm dev`. A plain run never fails: when a plugin can't be fetched
// (offline, GitHub down, bad zip) it warns, keeps that plugin's installed build and goes on with
// the others. A failed --update sets exit code 1.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import {
  assetUrl,
  latestBuild,
  MARKER,
  needsFetch,
  readPin,
  safeEntryPath,
} from './plugin-release.mjs';

const root = resolve(import.meta.dirname, '..');
const pluginsDir = join(root, 'plugins');
const UA = { 'User-Agent': 'ivandaw-fetch-plugins' };

const log = (name, msg) => console.log(`[plugins] ${name}: ${msg}`);
const warn = (name, msg) => console.warn(`[plugins] ${name}: ${msg}`);
const message = (e) => (e instanceof Error ? e.message : String(e));

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Every plugins/<name> folder with a package.json, as { name, pkgFile, pkg }. */
function pluginFolders() {
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(pluginsDir, d.name, 'package.json')))
    .map((d) => {
      const pkgFile = join(pluginsDir, d.name, 'package.json');
      return { name: d.name, pkgFile, pkg: JSON.parse(readFileSync(pkgFile, 'utf8')) };
    });
}

async function newestTag(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', ...UA },
  });
  if (!res.ok) throw new Error(`GitHub releases of ${repo}: HTTP ${res.status}`);
  const tag = latestBuild((await res.json()).map((r) => r.tag_name));
  if (!tag) throw new Error(`no daw-build-<n> release in ${repo}`);
  return tag;
}

/**
 * Replaces plugins/<name>/dist with the zip's files, checks its manifest and writes the marker.
 * On a bad zip dist/ is left as it was.
 */
function install(name, expectedId, zipBytes, marker) {
  const files = unzipSync(zipBytes);
  const entries = [];
  for (const [entry, bytes] of Object.entries(files)) {
    const rel = safeEntryPath(entry);
    if (rel) entries.push([rel, bytes]);
  }
  const manifestEntry = entries.find(([rel]) => rel === 'manifest.json');
  if (!manifestEntry) throw new Error('the zip has no manifest.json');
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry[1]));
  if (expectedId !== undefined && manifest.id !== expectedId) {
    throw new Error(`manifest.json id is ${manifest.id}, package.json says ${expectedId}`);
  }

  const dist = join(pluginsDir, name, 'dist');
  rmSync(dist, { recursive: true, force: true });
  for (const [rel, bytes] of entries) {
    const target = join(dist, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeFileSync(join(dist, MARKER), `${marker}\n`);
  return entries.length;
}

/** Moves one plugin's pin to its newest release. Returns the (possibly new) pin. */
async function updatePin(folder, pin) {
  const tag = await newestTag(pin.repo);
  if (tag === pin.release) {
    log(folder.name, `${tag} is already the newest`);
    return pin;
  }
  folder.pkg.ivandaw.release = tag;
  writeFileSync(folder.pkgFile, `${JSON.stringify(folder.pkg, null, 2)}\n`);
  log(folder.name, `pinned ${tag} (was ${pin.release})`);
  return { ...pin, release: tag };
}

async function fetchPinned(name, pin) {
  const installed = readText(join(pluginsDir, name, 'dist', MARKER));
  if (!needsFetch(pin.release, installed)) return;
  const url = assetUrl(pin.repo, pin.asset, pin.release);
  log(name, `downloading ${pin.release} …`);
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const count = install(name, pin.id, new Uint8Array(await res.arrayBuffer()), pin.release);
  log(name, `installed ${pin.release} (${count} files)`);
}

async function main(argv) {
  const at = argv.indexOf('--update');
  const update = at !== -1;
  const only = update && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : undefined;

  const folders = pluginFolders();
  if (only && !folders.some((f) => f.name === only)) {
    console.error(`[plugins] ${only}: no plugins/${only}/package.json`);
    process.exitCode = 1;
    return;
  }

  for (const folder of folders) {
    let pin;
    try {
      pin = readPin(folder.pkg, folder.name);
    } catch (e) {
      warn(folder.name, message(e));
      if (update) process.exitCode = 1;
      continue;
    }
    if (!pin) {
      if (only === folder.name) {
        console.error(`[plugins] ${only}: not an external plugin (no release pin)`);
        process.exitCode = 1;
      }
      continue;
    }

    const updating = update && (only === undefined || only === folder.name);
    try {
      if (updating) pin = await updatePin(folder, pin);
      await fetchPinned(folder.name, pin);
    } catch (e) {
      const had = readText(join(pluginsDir, folder.name, 'dist', MARKER));
      warn(folder.name, `could not fetch the build: ${message(e)}`);
      warn(
        folder.name,
        had
          ? `keeping ${had.trim()}. Retry with: node scripts/fetch-plugins.mjs`
          : 'it will be missing from the plugin list. Retry online with: node scripts/fetch-plugins.mjs',
      );
      // A failed --update is a real error; a plain fetch never breaks `pnpm i` or `pnpm dev`.
      if (updating) process.exitCode = 1;
    }
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.warn(`[plugins] ${message(e)}`);
  if (process.argv.includes('--update')) process.exitCode = 1;
});
