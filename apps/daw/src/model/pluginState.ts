// Saved plugin state (2026-11-23): PluginState ↔ the JSON-safe SavedState in a project file.
// A state's Blobs are stored as files; the project keeps their paths.

import type { PluginState } from 'ivandaw-core';
import type { SavedState } from './project';

/** Turns a SavedState back into a PluginState, fetching each file. `base` is the app's base URL. */
export async function restoreState(
  saved: SavedState,
  base: string,
  fetchFn: typeof fetch = fetch,
): Promise<PluginState> {
  const out: PluginState = {
    pluginId: saved.pluginId,
    pluginVersion: saved.pluginVersion,
    data: saved.data,
  };
  const entries = Object.entries(saved.files ?? {});
  if (entries.length === 0) return out;
  const files: Record<string, Blob> = {};
  for (const [key, path] of entries) {
    const res = await fetchFn(`${base}${path}`);
    if (!res.ok) throw new Error(`state file ${path}: HTTP ${res.status}`);
    files[key] = await res.blob();
  }
  out.files = files;
  return out;
}

/**
 * Turns a PluginState into a SavedState. `store` puts one Blob somewhere and returns its path.
 * Files are stored one at a time, in key order.
 */
export async function captureState(
  state: PluginState,
  store: (blob: Blob) => Promise<string>,
): Promise<SavedState> {
  const out: SavedState = {
    pluginId: state.pluginId,
    pluginVersion: state.pluginVersion,
    data: state.data ?? null,
  };
  const entries = Object.entries(state.files ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return out;
  const files: Record<string, string> = {};
  for (const [key, blob] of entries) files[key] = await store(blob);
  out.files = files;
  return out;
}
