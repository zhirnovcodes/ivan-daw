// Downloads the pinned Beatality CI build into plugins/beatality/dist.
//
//   node scripts/fetch-beatality.mjs            fetch the release pinned in plugins/beatality/package.json
//   node scripts/fetch-beatality.mjs --update   pin the newest daw-build-<n> release first, then fetch it
//
// Runs on `pnpm i` and before `pnpm dev`. Offline, it keeps whatever is installed and only warns,
// so neither command fails because GitHub is unreachable.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import {
  assetUrl,
  latestBuild,
  MARKER,
  needsFetch,
  REPO,
  safeEntryPath,
} from './beatality-release.mjs';

const root = resolve(import.meta.dirname, '..');
const pkgFile = join(root, 'plugins', 'beatality', 'package.json');
const dist = join(root, 'plugins', 'beatality', 'dist');
const update = process.argv.includes('--update');

const log = (msg) => console.log(`[beatality] ${msg}`);

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

async function newestTag() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ivandaw-fetch-beatality' },
  });
  if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`);
  const tag = latestBuild((await res.json()).map((r) => r.tag_name));
  if (!tag) throw new Error('no daw-build-<n> release found');
  return tag;
}

async function main() {
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  if (update) {
    const tag = await newestTag();
    if (tag !== pkg.ivandaw.release) {
      pkg.ivandaw.release = tag;
      writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
      log(`pinned ${tag}`);
    } else {
      log(`${tag} is already the newest`);
    }
  }
  const tag = pkg.ivandaw.release;
  const installed = readText(join(dist, MARKER));
  if (!needsFetch(tag, installed)) return;

  log(`downloading ${tag} …`);
  const res = await fetch(assetUrl(tag), { headers: { 'User-Agent': 'ivandaw-fetch-beatality' } });
  if (!res.ok) throw new Error(`${assetUrl(tag)}: HTTP ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));

  rmSync(dist, { recursive: true, force: true });
  let count = 0;
  for (const [name, bytes] of Object.entries(files)) {
    const rel = safeEntryPath(name);
    if (!rel) continue;
    const target = join(dist, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    count++;
  }
  if (!readText(join(dist, 'manifest.json'))) throw new Error('the zip has no manifest.json');
  writeFileSync(join(dist, MARKER), `${tag}\n`);
  log(`installed ${tag} (${count} files)`);
}

main().catch((e) => {
  const had = readText(join(dist, MARKER));
  console.warn(`[beatality] could not fetch the build: ${e instanceof Error ? e.message : e}`);
  console.warn(
    had
      ? `[beatality] keeping ${had.trim()}. Retry with: node scripts/fetch-beatality.mjs`
      : '[beatality] Beatality will be missing from the plugin list. Retry online with: node scripts/fetch-beatality.mjs',
  );
  // An --update that fails is a real error; a plain fetch never breaks `pnpm i` or `pnpm dev`.
  if (update) process.exitCode = 1;
});
