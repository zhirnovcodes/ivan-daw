// Pure helpers for fetching external plugins' CI builds. No I/O here, so Vitest tests every function.
// Design: docs/v1.1-tech-design.md, "2. Beatality in the DAW" → "Taking the build";
// docs/plugin-dev/06-ivandaw-integration.md.

/** Written into dist/ after a successful unpack; holds the release tag. */
export const MARKER = '.release';

const TAG = /^daw-build-(\d+)$/;

/** The release number of a `daw-build-<n>` tag, or undefined for any other tag. */
export function buildNumber(tag) {
  const m = TAG.exec(String(tag));
  return m ? Number(m[1]) : undefined;
}

/** The newest `daw-build-<n>` tag by number (not by date or string order), or undefined. */
export function latestBuild(tags) {
  let best;
  let bestN = -1;
  for (const t of tags) {
    const n = buildNumber(t);
    if (n !== undefined && n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

/** Download URL of a release's zip, e.g. assetUrl('zhirnovcodes/Beatality', 'beatality-daw.zip', 'daw-build-4'). */
export function assetUrl(repo, asset, tag) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${asset}`;
}

const PIN_FIELDS = ['repo', 'asset', 'release'];

/**
 * The release pin of a plugin's package.json, or undefined for a first-party plugin (built here).
 * A pin is `ivandaw.repo`, `ivandaw.asset` and `ivandaw.release`, all strings.
 * Throws when only some of them are set, naming the folder.
 */
export function readPin(pkgJson, folder = '?') {
  const d = pkgJson?.ivandaw;
  if (!d || typeof d !== 'object') return undefined;
  const set = PIN_FIELDS.filter((k) => d[k] !== undefined);
  if (set.length === 0) return undefined;
  const bad = PIN_FIELDS.filter((k) => typeof d[k] !== 'string' || d[k] === '');
  if (bad.length > 0) {
    throw new Error(
      `plugins/${folder}/package.json: a release pin needs ivandaw.repo, ivandaw.asset and ivandaw.release; missing ${bad.join(', ')}`,
    );
  }
  return { id: d.id, repo: d.repo, asset: d.asset, release: d.release };
}

/** True when dist/ must be (re)downloaded: nothing there yet, or another release than the pin. */
export function needsFetch(pinned, installed) {
  return (installed ?? '').trim() !== pinned;
}

/**
 * Where an entry of the zip goes inside dist/, or undefined to skip it.
 * Skips folders, absolute paths and anything that climbs out with `..`.
 */
export function safeEntryPath(name) {
  if (!name || name.endsWith('/')) return undefined;
  const parts = name.replace(/\\/g, '/').split('/');
  if (parts[0] === '' || /^[A-Za-z]:$/.test(parts[0] ?? '')) return undefined;
  if (parts.some((p) => p === '..')) return undefined;
  return parts.filter((p) => p !== '' && p !== '.').join('/');
}
