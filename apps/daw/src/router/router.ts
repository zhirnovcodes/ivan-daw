// P8 router. Tech design: "Router" and "Fades and clicks".
// validate and plan are pure (validate.ts, plan.ts). apply is the only step that touches Web Audio.
// Events are forwarded through a lookup table rebuilt whenever the plan changes; the router never re-times them.

import { effect } from '@preact/signals-core';
import { allNotesOff, beatAt, type PluginEvent, type PluginInstance } from 'ivandaw-core';
import type { Engine } from '../contracts/engine';
import type { Router, Wiring, WiringEdge } from '../contracts/router';
import { rampTo } from '../engine/ramp';
import { MASTER_ID } from '../model/project';
import { deps, nodeStatus, project } from '../store/store';
import { diffWiring, EMPTY_WIRING, eventTable, plan } from './plan';
import { validate } from './validate';

/** Cable gain fade on connect and disconnect. */
export const CABLE_FADE = 0.01;
/** A removed cable is disconnected this long after its fade starts. */
export const CABLE_DISCONNECT_MS = 20;

export interface RouterOptions {
  engine: Engine;
  /** Shown once per node when its plugin throws in schedule() or a listener (the canvas toast). */
  onNotify?: (node: string, message: string) => void;
}

export interface LiveRouter extends Router {
  /** Follows the store and the scheduler: re-plans on every change, forwards events. Returns stop. */
  attach(): () => void;
  /** The wiring currently applied (for tests and the dev page). */
  readonly wiring: Wiring;
}

interface AudioLink {
  gain: GainNode;
  source: AudioNode;
}

const linkKey = (e: WiringEdge): string =>
  `${e.id}|${e.from.node}:${e.from.port}>${e.to.node}:${e.to.port}`;

function eventsOutPorts(instance: PluginInstance): string[] {
  const ids: string[] = [];
  for (const [id, h] of instance.ports) {
    if (h.info.kind === 'events' && h.info.direction === 'out') ids.push(id);
  }
  return ids;
}

export function createRouter(opts: RouterOptions): LiveRouter {
  const { engine } = opts;
  let current: Wiring = EMPTY_WIRING;
  let table = eventTable(current);
  const links = new Map<string, AudioLink>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Node id → its event listener subscription (re-made if the instance changes). */
  const subs = new Map<string, { instance: PluginInstance; off: () => void }>();
  /** Nodes that were ready at the last sync, to hand newly ready ones the current anchor. */
  let ready = new Set<string>();
  const warned = new Set<string>();

  const report = (node: string, what: string, e: unknown): void => {
    const message = `${what} failed: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[router] [${node}] ${message}`, e);
    if (!warned.has(node)) {
      warned.add(node);
      opts.onNotify?.(node, message);
    }
  };

  const send = (node: string, events: PluginEvent[]): void => {
    const n = engine.get(node);
    if (!n) return;
    try {
      n.instance.schedule(events);
    } catch (e) {
      report(node, 'schedule', e);
    }
  };

  /** Where a cable's audio comes from: the strip for a main out, else the port's own node. */
  const sourceOf = (e: WiringEdge): { node: AudioNode; index: number } | undefined => {
    const n = engine.get(e.from.node);
    const h = n?.instance.ports.get(e.from.port);
    if (!n || !h || !('node' in h)) return undefined;
    if (h.info.main && n.strip) return { node: n.strip.output, index: 0 };
    return { node: h.node, index: h.index };
  };

  const targetOf = (e: WiringEdge): { node: AudioNode; index: number } | undefined => {
    if (e.to.node === MASTER_ID) return { node: engine.master, index: 0 };
    const h = engine.get(e.to.node)?.instance.ports.get(e.to.port);
    if (!h || !('node' in h)) return undefined;
    return { node: h.node, index: h.index };
  };

  function connectAudio(e: WiringEdge): void {
    const src = sourceOf(e);
    const dst = targetOf(e);
    if (!src || !dst) {
      console.warn(`[router] cannot wire ${e.id}: a port has no audio node`);
      return;
    }
    const ctx = engine.context;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.node.connect(gain, src.index);
    gain.connect(dst.node, 0, dst.index);
    rampTo(gain.gain, 1, ctx.currentTime, CABLE_FADE);
    links.set(linkKey(e), { gain, source: src.node });
  }

  function disconnectAudio(e: WiringEdge): void {
    const k = linkKey(e);
    const link = links.get(k);
    if (!link) return;
    links.delete(k);
    rampTo(link.gain.gain, 0, engine.context.currentTime, CABLE_FADE);
    const timer = setTimeout(() => {
      timers.delete(timer);
      try {
        link.source.disconnect(link.gain);
      } catch {
        // the source was already disconnected (node removed)
      }
      link.gain.disconnect();
    }, CABLE_DISCONNECT_MS);
    timers.add(timer);
  }

  function apply(prev: Wiring, next: Wiring): void {
    const d = diffWiring(prev, next);
    // Disconnect first, then connect: a replaced cable crossfades over the same 10 ms.
    for (const e of d.audio.disconnect) disconnectAudio(e);
    for (const e of d.audio.connect) connectAudio(e);
    // A removed notes cable must not leave a note hanging.
    for (const e of d.events.disconnect) {
      send(e.to.node, [{ type: 'midi', time: engine.context.currentTime, bytes: allNotesOff() }]);
    }
    table = eventTable(next);
  }

  /** Passes an event a node emitted along its cables, unchanged except for the target port. */
  function forward(from: string, defaultPort: string | undefined, e: PluginEvent): void {
    const port = e.port ?? defaultPort;
    const targets = table.get(`${from}:${port}`);
    if (!targets) return;
    for (const t of targets) send(t.node, [{ ...e, port: t.port }]);
  }

  /** Transport, tempo and CC 123 from the scheduler go to every ready node, no cable needed. */
  function broadcast(e: PluginEvent): void {
    for (const id of ready) send(id, [e]);
  }

  function syncListeners(): void {
    for (const [id, s] of subs) {
      if (engine.get(id)?.instance !== s.instance) {
        s.off();
        subs.delete(id);
      }
    }
    for (const id of ready) {
      const n = engine.get(id);
      if (!n || subs.has(id)) continue;
      const outs = eventsOutPorts(n.instance);
      if (outs.length === 0) continue;
      const off = n.instance.listen((e) => {
        try {
          forward(id, outs[0], e);
        } catch (err) {
          report(id, 'listener', err);
        }
      });
      subs.set(id, { instance: n.instance, off });
    }
  }

  function sync(): void {
    const p = project.value;
    const status = nodeStatus.value;
    const manifests = deps.value.manifests;
    const nowReady = new Set(
      Object.entries(status)
        .filter(([id, s]) => s === 'ready' && id !== MASTER_ID && engine.get(id))
        .map(([id]) => id),
    );
    const next = plan(p, manifests, status);
    apply(current, next);
    current = next;
    const joined = [...nowReady].filter((id) => !ready.has(id));
    ready = nowReady;
    syncListeners();
    // A node that joins while playing gets the current anchor at now, so it plays in time.
    const a = deps.value.scheduler.anchor.peek();
    if (a.state.playing && joined.length > 0) {
      const t = engine.context.currentTime;
      const state = t > a.time ? { ...a.state, beat: beatAt(t, a) } : a.state;
      for (const id of joined) {
        send(id, [{ type: 'transport', time: Math.max(t, a.time), state }]);
      }
    }
  }

  return {
    validate,
    plan,
    apply,
    get wiring() {
      return current;
    },
    attach() {
      const stopSync = effect(sync);
      const stopTransport = effect(() => deps.value.scheduler.onEvent(broadcast));
      return () => {
        stopSync();
        stopTransport();
        for (const s of subs.values()) s.off();
        subs.clear();
        for (const t of timers) clearTimeout(t);
        timers.clear();
        for (const l of links.values()) {
          try {
            l.source.disconnect(l.gain);
          } catch {
            // already gone
          }
          l.gain.disconnect();
        }
        links.clear();
        current = EMPTY_WIRING;
        table = eventTable(current);
        ready = new Set();
      };
    },
  };
}
