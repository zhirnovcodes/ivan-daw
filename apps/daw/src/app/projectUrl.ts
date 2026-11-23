// Which project the page opens: projects/demo.json, or projects/<name>.json with ?project=<name>
// (lowercase letters, digits and dashes only). The v1 sine scene is ?project=sine.
// ?preset=<Preset Name> (a saved dev-mode preset) is looked up in the preset list: see openPath.

import { findPreset, type PresetEntry } from '../model/presets';

export const DEMO = 'demo';

export function projectPath(search: string): string {
  const name = new URLSearchParams(search).get('project') ?? DEMO;
  return `projects/${/^[a-z0-9-]+$/.test(name) ? name : DEMO}.json`;
}

/**
 * The file the page opens. With ?preset=, the saved preset of that name wins over ?project; a name
 * that isn't in the list gives `missing` and falls back to ?project / the demo.
 */
export async function openPath(
  search: string,
  presets: () => Promise<PresetEntry[]>,
): Promise<{ path: string; missing?: string }> {
  const asked = new URLSearchParams(search).get('preset');
  if (asked === null || asked.trim() === '') return { path: projectPath(search) };
  const hit = findPreset(await presets(), asked);
  return hit ? { path: `presets/${hit.file}` } : { path: projectPath(search), missing: asked };
}
