// P3 audio engine. Tech design: "Engine".
// The only code that creates audio objects, and the only place allowed to call `new AudioContext()`.
// It keeps one live node per project node, loading and disposing them as `project.nodes` changes.

import { effect } from '@preact/signals-core';
import {
  allNotesOff,
  beatAt,
  type HostContext,
  type PluginEvent,
  type PluginFactory,
  type PluginInstance,
  type PluginManifest,
  type PortHandle,
  type TransportState,
} from 'ivandaw-core';
import type { Engine, LoadedNode } from '../contracts/engine';
import type { Catalog, CatalogEntry } from '../model/catalog';
import { type GraphNode, MASTER_ID } from '../model/project';
import { setNodeStatus } from '../store/actions';
import { deps, project } from '../store/store';
import { createMaster } from './master';
import { REMOVE_DISPOSE_MS } from './ramp';
import { createStrip, type LiveStrip } from './strip';

export type NotifyLevel = 'info' | 'warning' | 'error';

export interface EngineOptions {
  /** The plugin catalog (usually `fetchCatalog()`); awaited before the first load. */
  catalog: Catalog | Promise<Catalog>;
  /** Loads a plugin module. Default: `import(url)`. Tests and dev pages pass their own. */
  importModule?: (url: string) => Promise<unknown>;
  /** Makes the AudioContext. Default: `new AudioContext({ latencyHint: 'interactive' })`. */
  createContext?: () => AudioContext;
  /** Called for every `host.notify()` and every load error, after the console line. The canvas shows it as a toast. */
  onNotify?: (node: string, level: NotifyLevel, message: string) => void;
}

export interface LiveEngine extends Engine {
  /** Starts following the store: loads, disposes and updates strips as `project` changes. Returns stop. */
  attach(): () => void;
  /** Resumes the context on the first pointerdown or keydown on `target`. Returns a remover. */
  installUnlock(target?: EventTarget): () => void;
  /** Disposes every node and closes the context. */
  close(): Promise<void>;
}

type AudioHandle = Extract<PortHandle, { node: AudioNode }>;

/** Thrown for load failures whose message the node panel shows as is. */
class LoadError extends Error {}

interface Live extends LoadedNode {
  strip?: LiveStrip;
  /** The plugin's main audio out, connected into the strip. */
  out?: AudioHandle;
  gain: number;
  pan: number;
}

const defaultImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url);

function isFactory(v: unknown): v is PluginFactory {
  const f = v as Partial<PluginFactory> | null;
  return (
    typeof f === 'object' &&
    f !== null &&
    typeof f.create === 'function' &&
    typeof f.manifest === 'object' &&
    f.manifest !== null
  );
}

function mainAudioOutHandle(instance: PluginInstance): AudioHandle | undefined {
  for (const h of instance.ports.values()) {
    if (h.info.kind === 'audio' && h.info.direction === 'out' && h.info.main && 'node' in h)
      return h;
  }
  return undefined;
}

export function createEngine(opts: EngineOptions): LiveEngine {
  const context = opts.createContext?.() ?? new AudioContext({ latencyHint: 'interactive' });
  const master = createMaster(context);
  const importModule = opts.importModule ?? defaultImport;
  const catalog = Promise.resolve(opts.catalog);
  const live = new Map<string, Live>();
  /** Node id → token of its current load; a load whose token is gone was cancelled by removal. */
  const pending = new Map<string, object>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const notify = (node: string, level: NotifyLevel, message: string): void => {
    const log =
      level === 'warning' ? console.warn : level === 'error' ? console.error : console.info;
    log(`[${node}] ${message}`);
    opts.onNotify?.(node, level, message);
  };

  const transport = (): TransportState => {
    const a = deps.value.scheduler.anchor.peek();
    return a.state.playing ? { ...a.state, beat: beatAt(context.currentTime, a) } : a.state;
  };

  const hostContext = (id: string, entry: CatalogEntry): HostContext => ({
    audioContext: context,
    apiVersion: 2,
    slotId: id,
    transport,
    notify: (level, message) => notify(id, level, message),
    markDirty: () => {},
    assetUrl: (path) =>
      new URL(path, new URL(entry.url, globalThis.location?.href ?? 'http://localhost/')).href,
  });

  const safeSchedule = (id: string, instance: PluginInstance, events: PluginEvent[]): void => {
    try {
      instance.schedule(events);
    } catch (e) {
      notify(id, 'error', `schedule failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  async function load(node: GraphNode): Promise<void> {
    const { id } = node;
    const token = {};
    pending.set(id, token);
    const current = () => pending.get(id) === token;
    setNodeStatus(id, 'loading');
    let instance: PluginInstance | undefined;
    try {
      const entry = (await catalog).plugins.find((p) => p.id === node.plugin);
      if (!entry) throw new LoadError('plugin not found');
      const mod = (await importModule(entry.url)) as { default?: unknown } | null;
      const factory = mod?.default;
      if (!isFactory(factory))
        throw new LoadError('not a plugin module (no default PluginFactory)');
      if ((factory.manifest as { apiVersion?: unknown }).apiVersion !== 2) {
        throw new LoadError('unsupported plugin API');
      }
      if (!current()) return;
      instance = await factory.create(hostContext(id, entry), null);
      if (!current()) {
        instance.dispose();
        return;
      }
      const manifest: PluginManifest = factory.manifest;
      // Read the latest values: the user may have moved a slider while the module loaded.
      const now = project.peek().nodes.find((n) => n.id === id) ?? node;
      const out = mainAudioOutHandle(instance);
      let strip: LiveStrip | undefined;
      if (out) {
        strip = createStrip(context, now.gain, now.pan);
        out.node.connect(strip.input, out.index);
      }
      live.set(id, { instance, manifest, strip, out, gain: now.gain, pan: now.pan });
      pending.delete(id);
      const t = context.currentTime;
      const params = Object.entries(now.params);
      if (params.length > 0) {
        safeSchedule(
          id,
          instance,
          params.map(([pid, value]) => ({
            type: 'automation',
            time: t,
            id: pid,
            value,
            source: 'host',
          })),
        );
      }
      setNodeStatus(id, 'ready');
    } catch (e) {
      if (!current()) return;
      pending.delete(id);
      const message =
        e instanceof LoadError
          ? e.message
          : `failed to load: ${e instanceof Error ? e.message : String(e)}`;
      setNodeStatus(id, 'error', message);
      notify(id, 'error', message);
    }
  }

  /** CC 123, strip fades over 10 ms, then disconnect and dispose at 20 ms. */
  function unload(id: string): void {
    pending.delete(id);
    const n = live.get(id);
    if (!n) return;
    live.delete(id);
    safeSchedule(id, n.instance, [
      { type: 'midi', time: context.currentTime, bytes: allNotesOff() },
    ]);
    n.strip?.fadeOut();
    const timer = setTimeout(() => {
      timers.delete(timer);
      try {
        if (n.out && n.strip) n.out.node.disconnect(n.strip.input);
      } catch {
        // already disconnected
      }
      n.strip?.disconnect();
      try {
        n.instance.dispose();
      } catch (e) {
        notify(id, 'error', `dispose failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, REMOVE_DISPOSE_MS);
    timers.add(timer);
  }

  let masterVolume = Number.NaN;
  let masterPan = Number.NaN;

  function sync(nodes: readonly GraphNode[]): void {
    const ids = new Set<string>();
    for (const node of nodes) {
      ids.add(node.id);
      if (node.id === MASTER_ID) {
        if (node.gain !== masterVolume) {
          masterVolume = node.gain;
          master.setVolume(node.gain);
        }
        if (node.pan !== masterPan) {
          masterPan = node.pan;
          master.setPan(node.pan);
        }
        continue;
      }
      const n = live.get(node.id);
      if (n) {
        if (n.strip && n.gain !== node.gain) n.strip.setGain(node.gain);
        if (n.strip && n.pan !== node.pan) n.strip.setPan(node.pan);
        n.gain = node.gain;
        n.pan = node.pan;
      } else if (!pending.has(node.id)) {
        void load(node);
      }
    }
    for (const id of [...live.keys(), ...pending.keys()]) {
      if (!ids.has(id)) unload(id);
    }
  }

  return {
    context,
    get master() {
      return master.input;
    },
    async unlock() {
      if (context.state !== 'running') await context.resume();
    },
    get: (id) => live.get(id),
    rms: () => master.rms(),
    attach() {
      setNodeStatus(MASTER_ID, 'ready');
      return effect(() => {
        sync(project.value.nodes);
      });
    },
    installUnlock(target: EventTarget = globalThis) {
      let done = false;
      const handler = (): void => {
        if (done) return;
        done = true;
        remove();
        void this.unlock();
      };
      const remove = (): void => {
        target.removeEventListener('pointerdown', handler, true);
        target.removeEventListener('keydown', handler, true);
      };
      target.addEventListener('pointerdown', handler, true);
      target.addEventListener('keydown', handler, true);
      return remove;
    },
    async close() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      pending.clear();
      for (const [id, n] of live) {
        try {
          n.instance.dispose();
        } catch (e) {
          notify(id, 'error', `dispose failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      live.clear();
      await context.close();
    },
  };
}
