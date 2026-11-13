// The small services hook. The node panel needs a plugin's live parameters and a way to send it
// events; the add menu needs the catalog. None of that is in the store, so the app shell (P11)
// hands it over with setPanelServices.

import type { PluginInstance } from 'ivandaw-core';
import type { Catalog } from '../model/catalog';

export interface PanelServices {
  /** The live instance of a node, if its plugin has loaded. */
  instance(id: string): PluginInstance | undefined;
  /** AudioContext seconds. */
  now(): number;
  catalog(): Promise<Catalog>;
  /** Canvas centre in canvas px; where `+ Add` puts a new node. */
  canvasCenter(): { x: number; y: number };
}

const defaults = (): PanelServices => ({
  instance: () => undefined,
  now: () => 0,
  catalog: async () => ({ plugins: [] }),
  canvasCenter: () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
});

let current: PanelServices = defaults();

/** Replaces some of the services. Anything not given keeps its current value. */
export function setPanelServices(next: Partial<PanelServices>): void {
  current = { ...current, ...next };
}

export const panelServices = (): PanelServices => current;
