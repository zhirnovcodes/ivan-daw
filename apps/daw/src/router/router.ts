// P8 router. Tech design: "Router" and "Fades and clicks".
// validate and plan are pure (validate.ts, plan.ts). apply is the only step that touches Web Audio.
// Events are forwarded through a lookup table rebuilt whenever the plan changes; the router never re-times them.
// v1.1 control cables: a modulator's `automation` values go to a host-made `ctl:*` input. Volume and pan
// glide the strip's AudioParam; `ctl:param:<id>` becomes an `automation` event with source 'binding'.
// v1.2: control edges come from ARM links, mapped through their Min / Max. A plugin that is off
// (`bypass`) sends nothing. A MIDI plugin's Volume scales the velocity of its note-ons and its Pan goes
// out as MIDI pan (CC 10). Design: docs/v1.2-redesign.md, "4. Plugin windows" and "7. ARM connections".
// Host-driven MIDI: one ticker calls `render(until)` on every plugin that has it, sources first, so a
// MIDI plugin's input is in place before it renders. Brief: docs/plugin-dev/tasks/host-driven-render.md.

import { effect } from '@preact/signals-core';
import {
  allNotesOff,
  beatAt,
  createTicker,
  LOOKAHEAD,
  type PluginEvent,
  type PluginInstance,
  TICK_MS,
} from 'ivandaw-core';
import type { Engine } from '../contracts/engine';
import type { Router, Wiring, WiringEdge } from '../contracts/router';
import { glideTo, rampTo } from '../engine/ramp';
import {
  type ControlTarget,
  controlToGain,
  controlToPan,
  parseControlPort,
} from '../model/control';
import { armMap, clamp, MASTER_ID } from '../model/project';
import { deps, nodeStatus, project } from '../store/store';
import { diffWiring, EMPTY_WIRING, type EventTarget, eventTable, plan } from './plan';
import { validate } from './validate';

/** Cable gain fade on connect and disconnect. */
export const CABLE_FADE = 0.01;
/** A removed cable is disconnected this long after its fade starts. */
export const CABLE_DISCONNECT_MS = 20;

export interface RouterOptions {
  engine: Engine;
  /** Shown once per node when its plugin throws in schedule() or a listener (the canvas toast). */
  onNotify?: (node: string, message: string) => void;
  /** Wakes the render loop. Default: `createTicker` from ivandaw-core. Tests pass a fake. */
  ticker?: (ms: number, tick: () => void) => { stop(): void };
}

/** A plugin the host can drive: `render(until)` emits every event before `until`, synchronously. */
export type Renderable = PluginInstance & { render?(until: number): void };

/**
 * Nodes in the order their events flow along `table` (`<node>:<port>` → targets): every node comes
 * after each node that feeds it. Nodes in a loop keep their given order, after the rest.
 */
export function renderOrder(
  nodes: readonly string[],
  table: ReadonlyMap<string, readonly { node: string }[]>,
): string[] {
  const set = new Set(nodes);
  const next = new Map<string, Set<string>>();
  const indegree = new Map<string, number>(nodes.map((n) => [n, 0]));
  for (const [key, targets] of table) {
    const from = key.slice(0, key.lastIndexOf(':'));
    if (!set.has(from)) continue;
    for (const t of targets) {
      if (!set.has(t.node) || t.node === from) continue;
      const out = next.get(from) ?? new Set<string>();
      if (out.has(t.node)) continue;
      out.add(t.node);
      next.set(from, out);
      indegree.set(t.node, (indegree.get(t.node) ?? 0) + 1);
    }
  }
  const order: string[] = [];
  const queue = nodes.filter((n) => indegree.get(n) === 0);
  while (queue.length > 0) {
    const n = queue.shift() as string;
    order.push(n);
    for (const t of next.get(n) ?? []) {
      const d = (indegree.get(t) ?? 0) - 1;
      indegree.set(t, d);
      if (d === 0) queue.push(t);
    }
  }
  if (order.length < nodes.length) order.push(...nodes.filter((n) => !order.includes(n)));
  return order;
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

/** MIDI pan: CC 10. */
export const CC_PAN = 10;

/** Pan −1..1 as a CC 10 value 0..127 (64 = centre). */
export const panToCc = (pan: number): number =>
  clamp(Math.round(((clamp(pan, -1, 1) + 1) / 2) * 127), 0, 127);

/**
 * A MIDI plugin's Volume on one of its messages: note-on velocity × gain (at least 1, so a note-on
 * stays a note-on); a note-on at gain 0 is dropped. Everything else passes unchanged.
 */
export function scaleVelocity(
  bytes: [number, number, number],
  gain: number,
): [number, number, number] | undefined {
  const [status, note, vel] = bytes;
  if ((status & 0xf0) !== 0x90 || vel === 0 || gain === 1) return bytes;
  if (gain <= 0) return undefined;
  return [status, note, clamp(Math.round(vel * gain), 1, 127)];
}

/** The control value an edge target gets: through the ARM link's Min / Max when it has one. */
const mapped = (t: Pick<EventTarget, 'range'>, v: number): number =>
  t.range ? armMap(t.range, v) : v;

const linkKey = (e: WiringEdge): string =>
  `${e.id}|${e.from.node}:${e.from.port}>${e.to.node}:${e.to.port}`;

/** Ports whose emitted events the router forwards: events outs and modulation outs. */
function eventsOutPorts(instance: PluginInstance): string[] {
  const ids: string[] = [];
  for (const [id, h] of instance.ports) {
    if ((h.info.kind === 'events' || h.info.kind === 'modulation') && h.info.direction === 'out') {
      ids.push(id);
    }
  }
  return ids;
}

/** A parameter's value to fall back to when its control cable goes: what the user set, else its default. */
function restingParam(
  instance: PluginInstance,
  stored: number | undefined,
  id: string,
): number | undefined {
  if (stored !== undefined) return stored;
  const p = instance.parameters().find((x) => x.id === id);
  if (!p) return undefined;
  return p.max === p.min ? 0 : (p.default - p.min) / (p.max - p.min);
}

export function createRouter(opts: RouterOptions): LiveRouter {
  const { engine } = opts;
  let current: Wiring = EMPTY_WIRING;
  let table = eventTable(current);
  let controlTable = eventTable(current, 'control');
  const links = new Map<string, AudioLink>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Node id → its event listener subscription (re-made if the instance changes). */
  const subs = new Map<string, { instance: PluginInstance; off: () => void }>();
  /** Nodes that were ready at the last sync, to hand newly ready ones the current anchor. */
  let ready = new Set<string>();
  const warned = new Set<string>();
  /** v1.2: nodes that are off. Their events are not forwarded. */
  let off = new Set<string>();
  /** v1.2 MIDI plugins: Volume / Pan while an ARM link drives them (else the project's values). */
  const midiGain = new Map<string, number>();
  const midiPan = new Map<string, number>();
  /** MIDI plugin → the CC 10 value last sent, and the channels it has sent notes on. */
  const panSent = new Map<string, number>();
  const channels = new Map<string, Set<number>>();
  /** Ready nodes with `render()`, sources first; the render loop's ticker; the last `until` sent. */
  let renderers: string[] = [];
  let renderTicker: { stop(): void } | undefined;
  let lastUntil = Number.NEGATIVE_INFINITY;

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

  /** Drives one control input with a control value (0..1) at `time`. */
  function drive(
    node: string,
    target: ControlTarget,
    value: number,
    time: number,
    source: 'binding' | 'host',
  ): void {
    if (target.kind === 'param') {
      send(node, [{ type: 'automation', time, id: target.id, value, source }]);
      return;
    }
    if (isMidiStrip(node)) {
      if (target.kind === 'gain') midiGain.set(node, controlToGain(value));
      else {
        midiPan.set(node, controlToPan(value));
        sendPan(node, time);
      }
      return;
    }
    // A plugin that is off stays silent: its volume isn't driven.
    if (target.kind === 'gain' && off.has(node)) return;
    const cp = engine.controlParam(node, target.kind);
    if (!cp) return;
    const v = target.kind === 'gain' ? controlToGain(value) * cp.scale : controlToPan(value);
    glideTo(cp.param, v, Math.max(time, engine.context.currentTime));
  }

  /** A control cable went: the input returns to the value it has without one. */
  function release(to: { node: string; port: string }): void {
    const target = parseControlPort(to.port);
    const node = project.peek().nodes.find((n) => n.id === to.node);
    if (!target || !node) return;
    const now = engine.context.currentTime;
    if (isMidiStrip(to.node)) {
      if (target.kind === 'gain') midiGain.delete(to.node);
      if (target.kind === 'pan') {
        midiPan.delete(to.node);
        sendPan(to.node, now);
      }
      return;
    }
    if (target.kind === 'gain' && node.bypass) return;
    if (target.kind === 'gain' || target.kind === 'pan') {
      const cp = engine.controlParam(to.node, target.kind);
      if (cp) glideTo(cp.param, target.kind === 'gain' ? node.gain * cp.scale : node.pan, now);
      return;
    }
    const inst = engine.get(to.node)?.instance;
    const v = inst ? restingParam(inst, node.params[target.id], target.id) : undefined;
    if (v !== undefined) drive(to.node, target, v, now, 'host');
  }

  /** A new control cable: the input jumps to the source's current value when the source can tell. */
  function prime(e: WiringEdge): void {
    const target = parseControlPort(e.to.port);
    const src = engine.get(e.from.node)?.instance;
    if (!target || !src) return;
    let value: number | undefined;
    try {
      if (src.parameters().some((p) => p.id === e.from.port)) value = src.parameter(e.from.port);
    } catch (err) {
      report(e.from.node, 'parameter', err);
    }
    if (value !== undefined) {
      drive(e.to.node, target, mapped(e, value), engine.context.currentTime, 'binding');
    }
  }

  const nodeOf = (id: string) => project.peek().nodes.find((x) => x.id === id);

  /** True for a node with Volume / Pan but no audio out: a MIDI plugin. */
  function isMidiStrip(node: string): boolean {
    if (node === MASTER_ID) return false;
    const n = nodeOf(node);
    const m = n ? deps.peek().manifests.get(n.plugin) : undefined;
    return m?.kind === 'midi' && !m.ports.some((p) => p.kind === 'audio' && p.direction === 'out');
  }

  /** Sends a MIDI plugin's pan as CC 10 along its notes cables, on every channel it has used. */
  function sendPan(node: string, time: number, force = false): void {
    const pan = midiPan.get(node) ?? nodeOf(node)?.pan ?? 0;
    const cc = panToCc(pan);
    if (!force && panSent.get(node) === cc) return;
    panSent.set(node, cc);
    const chs = channels.get(node) ?? new Set([0]);
    const t = Math.max(time, engine.context.currentTime);
    for (const [key, targets] of table) {
      if (!key.startsWith(`${node}:`)) continue;
      for (const tg of targets) {
        send(
          tg.node,
          [...chs].map((ch) => ({
            type: 'midi' as const,
            time: t,
            bytes: [0xb0 | ch, CC_PAN, cc] as [number, number, number],
            port: tg.port,
          })),
        );
      }
    }
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
    controlTable = eventTable(next, 'control');
    for (const e of d.control.disconnect) release(e.to);
    for (const e of d.control.connect) prime(e);
  }

  /** Passes an event a node emitted along its cables, unchanged except for the target port. */
  function forward(from: string, defaultPort: string | undefined, ev: PluginEvent): void {
    if (off.has(from)) return;
    let e = ev;
    if (e.type === 'midi' && isMidiStrip(from)) {
      if ((e.bytes[0] & 0xf0) === 0x90 && e.bytes[2] > 0) {
        const ch = e.bytes[0] & 0x0f;
        const seen = channels.get(from) ?? new Set<number>();
        if (!seen.has(ch)) {
          seen.add(ch);
          channels.set(from, seen);
          // A new channel gets the pan before its first note.
          if ((midiPan.get(from) ?? nodeOf(from)?.pan ?? 0) !== 0) sendPan(from, e.time, true);
        }
      }
      const bytes = scaleVelocity(e.bytes, midiGain.get(from) ?? nodeOf(from)?.gain ?? 1);
      if (!bytes) return;
      if (bytes !== e.bytes) e = { ...e, bytes };
    }
    const port = e.port ?? defaultPort;
    const key = `${from}:${port}`;
    for (const t of table.get(key) ?? []) send(t.node, [{ ...e, port: t.port }]);
    if (e.type !== 'automation') return;
    for (const t of controlTable.get(key) ?? []) {
      const target = parseControlPort(t.port);
      if (target) drive(t.node, target, mapped(t, e.value), e.time, 'binding');
    }
  }

  /** Nodes turned off release their notes downstream; MIDI plugins whose Pan changed send CC 10. */
  function syncNodes(): void {
    const p = project.peek();
    const now = engine.context.currentTime;
    const nowOff = new Set(p.nodes.filter((n) => n.bypass).map((n) => n.id));
    for (const id of nowOff) {
      if (off.has(id)) continue;
      for (const [key, targets] of table) {
        if (!key.startsWith(`${id}:`)) continue;
        for (const t of targets) {
          send(t.node, [{ type: 'midi', time: now, bytes: allNotesOff(), port: t.port }]);
        }
      }
    }
    off = nowOff;
    for (const n of p.nodes) {
      if (midiPan.has(n.id) || !isMidiStrip(n.id)) continue;
      const sent = panSent.get(n.id);
      if (sent === undefined ? n.pan !== 0 : sent !== panToCc(n.pan)) sendPan(n.id, now);
    }
  }

  /** One render pass: every host-driven plugin renders up to the same `until`, sources first. */
  function renderPass(): void {
    if (renderers.length === 0) return;
    const until = Math.max(lastUntil, engine.context.currentTime + LOOKAHEAD);
    lastUntil = until;
    for (const id of renderers) {
      const inst = engine.get(id)?.instance as Renderable | undefined;
      if (!inst?.render) continue;
      try {
        inst.render(until);
      } catch (e) {
        report(id, 'render', e);
      }
    }
  }

  /** Transport, tempo and CC 123 from the scheduler go to every ready node, no cable needed. */
  function broadcast(e: PluginEvent): void {
    for (const id of ready) send(id, [e]);
    // Play, Pause, Stop: book the first notes now, not on the next tick.
    if (e.type === 'transport') renderPass();
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
    syncNodes();
    const joined = [...nowReady].filter((id) => !ready.has(id));
    ready = nowReady;
    syncListeners();
    const all = [...ready];
    renderers = renderOrder(all, table).filter(
      (id) => typeof (engine.get(id)?.instance as Renderable | undefined)?.render === 'function',
    );
    // A node that joins while playing gets the current anchor at now, so it plays in time.
    const a = deps.value.scheduler.anchor.peek();
    if (a.state.playing && joined.length > 0) {
      const t = engine.context.currentTime;
      const state = t > a.time ? { ...a.state, beat: beatAt(t, a) } : a.state;
      for (const id of joined) {
        send(id, [{ type: 'transport', time: Math.max(t, a.time), state }]);
      }
      renderPass();
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
      renderTicker = (opts.ticker ?? createTicker)(TICK_MS, renderPass);
      return () => {
        renderTicker?.stop();
        renderTicker = undefined;
        renderers = [];
        lastUntil = Number.NEGATIVE_INFINITY;
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
        controlTable = eventTable(current, 'control');
        ready = new Set();
        off = new Set();
        midiGain.clear();
        midiPan.clear();
        panSent.clear();
        channels.clear();
      };
    },
  };
}
