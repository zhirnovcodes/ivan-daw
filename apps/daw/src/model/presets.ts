// Dev-mode preset library (2026-11-23): shared by the dev-server routes (vite/presets.ts) and the panel.

/**
 * One saved preset (2026-11-26: a preset is a name plus a mobile flag, so "Drums" and "Drums" MOBILE
 * are two presets).
 */
export interface PresetEntry {
  /** As typed in the panel. Names match case-insensitively. */
  name: string;
  /** Made for the mobile version (?mobile=true). Index entries saved before 2026-11-26 have none: desktop. */
  mobile: boolean;
  /** File under presets/: `my-beat.json`, or `my-beat.mobile.json` for a mobile one. */
  file: string;
}

/** The file a preset is saved in. Slugs never hold a dot, so the two kinds never clash. */
export const presetFile = (slug: string, mobile: boolean): string =>
  `${slug}${mobile ? '.mobile' : ''}.json`;

/** Keeps the well-formed entries of a raw index.json; a missing mobile flag means desktop. */
export function readEntries(raw: unknown): PresetEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is { name: string; file: string; mobile?: unknown } =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.name === 'string' &&
        typeof e.file === 'string',
    )
    .map((e) => ({ name: e.name, mobile: e.mobile === true, file: e.file }));
}

/** Whether the page is opened from this machine: dev mode only works there. */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h)
  );
}

/** Whether a request's remote address is this machine (IPv4, IPv6, or IPv4-mapped IPv6 loopback). */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.toLowerCase().replace(/^::ffff:/, '');
  return a === '::1' || /^127\.\d+\.\d+\.\d+$/.test(a);
}

/** `My Beat #2` → `my-beat-2`. Empty when the name has no letters or digits. */
export function presetSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The same preset: same name (any case) and same kind. */
export const samePreset = (e: PresetEntry, name: string, mobile: boolean): boolean =>
  e.mobile === mobile && sameName(e.name, name);

/**
 * The saved preset a ?preset= value names: by its name (any case), else by its file name (`my-beat`).
 * Of the two kinds, the one for the page's mode (`mobile`) wins; when only the other kind is saved,
 * that one opens.
 */
export function findPreset(
  list: readonly PresetEntry[],
  asked: string,
  mobile: boolean,
): PresetEntry | undefined {
  const slug = presetSlug(asked);
  const named = list.filter((e) => sameName(e.name, asked));
  const hits =
    named.length > 0 || slug === '' ? named : list.filter((e) => presetSlug(e.name) === slug);
  return hits.find((e) => e.mobile === mobile) ?? hits[0];
}

/** Reads presets/index.json; a missing or broken list is empty. */
export async function fetchPresets(
  base: string,
  fetchFn: typeof fetch = fetch,
): Promise<PresetEntry[]> {
  try {
    const res = await fetchFn(`${base}presets/index.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    return readEntries(await res.json());
  } catch {
    return [];
  }
}
