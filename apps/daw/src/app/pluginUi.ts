// v1.1: plugins with a `manifest.ui` show their own UI inside their node box.
// Design: docs/v1.1-tech-design.md, "2. Beatality in the DAW" → "Plugin UI inside the node box".
//
// The canvas makes one slot element per box that has room for a UI (store `uiSlots`). This keeps
// each slot showing its plugin: `mount(slot)` once the node is ready, `unmount()` when the slot
// goes away, the node stops being ready, or its instance is replaced. The engine disposes removed
// nodes 20 ms later, so a UI is always unmounted before its instance is disposed.

import type { PluginInstance } from 'ivandaw-core';

export interface Mounted {
  slot: HTMLElement;
  instance: PluginInstance;
}

export interface UiSyncInput {
  /** Node id → slot element, from the canvas. */
  slots: ReadonlyMap<string, HTMLElement>;
  /** Node id → load status. */
  status: Readonly<Record<string, string>>;
  /** The live instance of a node, if loaded. */
  instance(id: string): PluginInstance | undefined;
  /** A plugin threw in mount / unmount. */
  onError(id: string, message: string): void;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Brings `mounted` in line with the slots and statuses. Mutates and returns `mounted`. */
export function syncPluginUis(
  mounted: Map<string, Mounted>,
  input: UiSyncInput,
): Map<string, Mounted> {
  // Unmount first, so a slot reused by a new instance is empty before the new mount.
  for (const [id, m] of mounted) {
    const slot = input.slots.get(id);
    const inst = input.status[id] === 'ready' ? input.instance(id) : undefined;
    if (slot === m.slot && inst === m.instance) continue;
    mounted.delete(id);
    try {
      m.instance.unmount();
    } catch (e) {
      input.onError(id, `unmount failed: ${message(e)}`);
    }
    m.slot.replaceChildren();
  }
  for (const [id, slot] of input.slots) {
    if (mounted.has(id) || input.status[id] !== 'ready') continue;
    const instance = input.instance(id);
    if (!instance) continue;
    mounted.set(id, { slot, instance });
    try {
      instance.mount(slot);
    } catch (e) {
      input.onError(id, `mount failed: ${message(e)}`);
    }
  }
  return mounted;
}
