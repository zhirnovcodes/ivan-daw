// Which project the page opens: projects/demo.json, or projects/<name>.json with ?project=<name>
// (lowercase letters, digits and dashes only). The v1 sine scene is ?project=sine.
// ?preset=<Preset Name> (a saved dev-mode preset) is looked up in the preset list: see openPath.
// A preset is a name plus a mobile flag (2026-11-26): the kind matching the page's mode wins, else
// the other kind of that name opens.
// With neither ?preset nor ?project (2026-11-27), the preset named "Default" opens when it is saved.

import { findPreset, type PresetEntry } from '../model/presets';

export const DEMO = 'demo';

/** The preset a page with neither ?preset nor ?project opens (names match in any case). */
export const DEFAULT_PRESET = 'Default';

export function projectPath(search: string): string {
  const name = new URLSearchParams(search).get('project') ?? DEMO;
  return `projects/${/^[a-z0-9-]+$/.test(name) ? name : DEMO}.json`;
}

/**
 * The file the page opens. With ?preset=, the saved preset of that name wins over ?project: the
 * mobile one when `mobile` (the page is in mobile mode), else the desktop one, else whichever kind is
 * saved (`otherKind`: it was made for the other mode). A name that isn't in the list gives `missing`
 * and falls back to ?project / the demo. With neither ?preset nor ?project, the preset named
 * DEFAULT_PRESET opens when it is saved, else the demo (quietly: no `missing`).
 */
export async function openPath(
  search: string,
  presets: () => Promise<PresetEntry[]>,
  mobile = false,
): Promise<{ path: string; missing?: string; otherKind?: true }> {
  const params = new URLSearchParams(search);
  const asked = params.get('preset');
  const named = asked !== null && asked.trim() !== '';
  if (!named && params.has('project')) return { path: projectPath(search) };
  const hit = findPreset(await presets(), named ? asked : DEFAULT_PRESET, mobile);
  if (!hit)
    return named ? { path: projectPath(search), missing: asked } : { path: projectPath(search) };
  return {
    path: `presets/${hit.file}`,
    ...(hit.mobile !== mobile ? { otherKind: true } : {}),
  };
}
