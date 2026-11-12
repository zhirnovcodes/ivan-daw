// Contract C4 (state part). Tech design: "Project model and store".
// UI reads these signals; only the functions in actions.ts write them.
// Engine, router and scheduler react to `project` with effect().

import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import type { Router } from '../contracts/router';
import type { Scheduler } from '../contracts/scheduler';
import { createStubRouter, createStubScheduler } from '../contracts/stubs';
import { MASTER_MANIFEST, type ManifestMap } from '../model/catalog';
import { emptyProject, MASTER_PLUGIN, type Project } from '../model/project';

export type NodeStatus = 'loading' | 'ready' | 'error';

export interface Selection {
  node?: string;
  cable?: string;
}

/** The services the actions call. Stubs until the app shell provides the real ones. */
export interface StoreDeps {
  scheduler: Scheduler;
  router: Router;
  /** Plugin id → ports. Filled from the catalog, so `connect` and `addNode` work before a module loads. */
  manifests: ManifestMap;
}

export const defaultDeps = (): StoreDeps => ({
  scheduler: createStubScheduler(),
  router: createStubRouter(),
  manifests: new Map([[MASTER_PLUGIN, MASTER_MANIFEST]]),
});

export const deps = signal<StoreDeps>(defaultDeps());

/** Replaces some of the services, e.g. `provide({ scheduler, router, manifests })` at boot. */
export function provide(next: Partial<StoreDeps>): void {
  deps.value = { ...deps.value, ...next };
}

export const project = signal<Project>(emptyProject());
export const selection = signal<Selection>({});
/** Written by the engine through `setNodeStatus`. Master is always 'ready'. */
export const nodeStatus = signal<Record<string, NodeStatus>>({});
/** Error message for each node whose status is 'error'. */
export const nodeErrors = signal<Record<string, string>>({});
export const playing: ReadonlySignal<boolean> = computed(
  () => deps.value.scheduler.state.value.playing,
);
