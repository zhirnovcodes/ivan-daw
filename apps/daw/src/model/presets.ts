// Dev-mode preset library (2026-11-23): shared by the dev-server routes (vite/presets.ts) and the panel.

export interface PresetEntry {
  /** As typed in the panel. Names match case-insensitively. */
  name: string;
  /** File under presets/, e.g. `my-beat.json`. Open it with ?preset=my-beat. */
  file: string;
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

/** The saved preset a ?preset= value names: by its name (any case), else by its file name (`my-beat`). */
export function findPreset(list: readonly PresetEntry[], asked: string): PresetEntry | undefined {
  const slug = presetSlug(asked);
  return (
    list.find((e) => sameName(e.name, asked)) ??
    (slug === '' ? undefined : list.find((e) => e.file === `${slug}.json`))
  );
}

/** Reads presets/index.json; a missing or broken list is empty. */
export async function fetchPresets(
  base: string,
  fetchFn: typeof fetch = fetch,
): Promise<PresetEntry[]> {
  try {
    const res = await fetchFn(`${base}presets/index.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    const raw: unknown = await res.json();
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
