// Pure helpers for fetching Beatality's CI build. No I/O here, so Vitest tests every function.
// Design: docs/v1.1-tech-design.md, "2. Beatality in the DAW" → "Taking the build".

export const REPO = 'zhirnovcodes/Beatality';
export const ASSET = 'beatality-daw.zip';
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

/** Download URL of the zip for a release tag. */
export function assetUrl(tag) {
  return `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${ASSET}`;
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
