// P5 Canvas: nodes as DOM boxes, cables as one SVG layer behind them.
// Reads the project, selection, nodeStatus and nodeErrors signals and calls store actions. No audio.
// Tech design: "Canvas".

import { effect } from '@preact/signals-core';
import { REFUSE_TEXT } from '../contracts/router';
import type { MountUi } from '../contracts/ui';
import type { PortsManifest } from '../model/catalog';
import type { PortRef } from '../model/project';
import { connect, disconnect, moveNode, removeNode, select } from '../store/actions';
import { deps, nodeErrors, nodeStatus, project, selection } from '../store/store';
import {
  CABLE_HIT_W,
  cableMidpoint,
  cablePath,
  layoutPorts,
  nodeSize,
  type PortLayout,
  type PortSpot,
  type Pt,
  portAt,
  portCenter,
} from './geometry';
import {
  type Effect,
  type GestureCtx,
  type GestureEvent,
  type GestureState,
  IDLE,
  keyEffects,
  reduce,
  type Target,
} from './gesture';
import { CANVAS_CSS } from './styles';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOAST_MS = 2000;

let styleEl: HTMLStyleElement | undefined;
function ensureStyles(): void {
  if (styleEl?.isConnected) return;
  styleEl = document.createElement('style');
  styleEl.textContent = CANVAS_CSS;
  document.head.appendChild(styleEl);
}

let toastEl: HTMLElement | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short message at the bottom of the window for 2 s. A new one replaces the old. */
export function showToast(message: string): void {
  ensureStyles();
  toastEl?.remove();
  if (toastTimer) clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'ivd-toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  toastEl = el;
  toastTimer = setTimeout(() => {
    el.remove();
    if (toastEl === el) toastEl = undefined;
  }, TOAST_MS);
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  cls?: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (cls) el.setAttribute('class', cls);
  return el;
}

interface NodeView {
  el: HTMLElement;
  title: HTMLElement;
  dot: HTMLElement;
  manifest: PortsManifest | undefined;
  plugin: string;
  layout: PortLayout[];
  portEls: Map<string, HTMLElement>;
}

export const mountCanvas: MountUi = (root) => {
  ensureStyles();
  const canvas = h('div', 'ivd-canvas');
  const svg = s('svg', {}, 'ivd-cables');
  const cableLayer = s('g');
  const tempPath = s('path', {}, 'ivd-cable temp');
  tempPath.style.display = 'none';
  svg.append(cableLayer, tempPath);
  const nodeLayer = h('div', 'ivd-nodes');
  canvas.append(svg, nodeLayer);
  root.appendChild(canvas);

  const views = new Map<string, NodeView>();
  let state: GestureState = IDLE;
  /** While connecting: 'node:port' → is that input a valid target. */
  let validity = new Map<string, boolean>();

  const rel = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const nodePos = (id: string): Pt => {
    const n = project.peek().nodes.find((x) => x.id === id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  const portPoint = (ref: PortRef): Pt | undefined => {
    const n = project.peek().nodes.find((x) => x.id === ref.node);
    const l = views.get(ref.node)?.layout.find((p) => p.id === ref.port);
    return n && l ? portCenter(n, l) : undefined;
  };

  const inputSpots = (): PortSpot[] => {
    const spots: PortSpot[] = [];
    for (const n of project.peek().nodes) {
      for (const l of views.get(n.id)?.layout ?? []) {
        if (l.direction === 'in') {
          spots.push({ ref: { node: n.id, port: l.id }, center: portCenter(n, l) });
        }
      }
    }
    return spots;
  };

  const ctx = (): GestureCtx => ({
    bounds: {
      w: canvas.clientWidth > 0 ? canvas.clientWidth : Number.POSITIVE_INFINITY,
      h: canvas.clientHeight > 0 ? canvas.clientHeight : Number.POSITIVE_INFINITY,
    },
    sizeOf: (id) => nodeSize(views.get(id)?.layout ?? []),
  });

  function run(e: Effect): void {
    switch (e.type) {
      case 'moveNode':
        moveNode(e.id, e.x, e.y);
        break;
      case 'select':
        select(e.sel);
        break;
      case 'connect': {
        const r = connect(e.from, e.to);
        if (!r.ok) showToast(REFUSE_TEXT[r.reason]);
        break;
      }
      case 'disconnect':
        disconnect(e.id);
        break;
      case 'removeNode':
        removeNode(e.id);
        break;
    }
  }

  function dispatch(ev: GestureEvent): void {
    const before = state;
    const step = reduce(state, ev, ctx());
    state = step.state;
    if (before.mode !== 'connect' && state.mode === 'connect') startConnect(state.from);
    if (before.mode === 'connect' && state.mode !== 'connect') validity = new Map();
    for (const e of step.effects) run(e);
    drawOverlay();
  }

  function startConnect(from: PortRef): void {
    const { router, manifests } = deps.peek();
    const p = project.peek();
    validity = new Map();
    for (const spot of inputSpots()) {
      const v = router.validate(p, manifests, from, spot.ref);
      validity.set(`${spot.ref.node}:${spot.ref.port}`, v.ok);
    }
  }

  /** Temporary cable and the glow / dim on input ports. Runs on every gesture change. */
  function drawOverlay(): void {
    const connecting = state.mode === 'connect';
    for (const [id, v] of views) {
      for (const [portId, el] of v.portEls) {
        const ok = validity.get(`${id}:${portId}`);
        const isIn = el.classList.contains('in');
        el.classList.toggle('valid', connecting && isIn && ok === true);
        el.classList.toggle('invalid', connecting && (!isIn || ok === false));
      }
    }
    if (state.mode !== 'connect') {
      tempPath.style.display = 'none';
      return;
    }
    const ref = state.from;
    const from = portPoint(ref);
    if (!from) {
      tempPath.style.display = 'none';
      return;
    }
    const over = portAt(state.at, inputSpots());
    const end = over && validity.get(`${over.ref.node}:${over.ref.port}`) ? over.center : state.at;
    tempPath.setAttribute('d', cablePath(from, end));
    const kind = views.get(ref.node)?.layout.find((p) => p.id === ref.port)?.kind;
    tempPath.setAttribute('class', `ivd-cable temp ${kind ?? 'audio'}`);
    tempPath.style.display = '';
  }

  /** Captures the pointer on `el` and feeds its move / up / cancel into the state machine. */
  function track(el: HTMLElement, e: PointerEvent): void {
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events may have no active pointer; dragging still works without capture.
    }
    const move = (m: PointerEvent): void => dispatch({ type: 'move', at: rel(m) });
    const end = (u: PointerEvent): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      void u;
    };
    const up = (u: PointerEvent): void => {
      end(u);
      const at = rel(u);
      const hit = portAt(at, inputSpots());
      dispatch({ type: 'up', at, ...(hit ? { drop: hit.ref } : {}) });
    };
    const cancel = (u: PointerEvent): void => {
      end(u);
      dispatch({ type: 'cancel' });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  }

  function down(e: PointerEvent, target: Target, capture?: HTMLElement): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dispatch({ type: 'down', target, at: rel(e) });
    if (capture && state.mode !== 'idle') track(capture, e);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.target === canvas) down(e, { kind: 'empty' });
  });

  function buildNode(id: string): NodeView {
    const el = h('div', 'ivd-node');
    el.dataset.node = id;
    const header = h('div', 'ivd-header');
    const title = h('span', 'ivd-title');
    const dot = h('span', 'ivd-dot');
    header.append(title, dot);
    el.appendChild(header);
    header.addEventListener('pointerdown', (e) =>
      down(e, { kind: 'header', node: id, nodePos: nodePos(id) }, header),
    );
    el.addEventListener('pointerdown', (e) => down(e, { kind: 'body', node: id }));
    nodeLayer.appendChild(el);
    return { el, title, dot, manifest: undefined, plugin: '', layout: [], portEls: new Map() };
  }

  function buildPorts(id: string, v: NodeView, manifest: PortsManifest | undefined): void {
    for (const el of v.portEls.values()) el.remove();
    v.portEls.clear();
    v.manifest = manifest;
    v.layout = layoutPorts(manifest?.ports ?? []);
    for (const l of v.layout) {
      const port = h('div', `ivd-port ${l.direction} ${l.kind}`);
      port.dataset.port = l.id;
      port.style.top = `${portCenterY(l) - 11}px`;
      const dotEl = h('i', '');
      const label = h('span', '', l.label);
      port.append(dotEl, label);
      if (l.direction === 'out') {
        port.addEventListener('pointerdown', (e) =>
          down(e, { kind: 'outPort', ref: { node: id, port: l.id } }, port),
        );
      }
      v.el.appendChild(port);
      v.portEls.set(l.id, port);
    }
  }

  const portCenterY = (l: PortLayout): number => portCenter({ x: 0, y: 0 }, l).y;

  function renderCables(): void {
    cableLayer.replaceChildren();
    const sel = selection.value;
    for (const c of project.value.cables) {
      const a = portPoint(c.from);
      const b = portPoint(c.to);
      if (!a || !b) continue;
      const kind =
        views.get(c.from.node)?.layout.find((p) => p.id === c.from.port)?.kind ?? 'audio';
      const selected = sel.cable === c.id;
      const d = cablePath(a, b);
      const g = s('g');
      g.dataset.cable = c.id;
      const hit = s('path', { d, 'stroke-width': CABLE_HIT_W }, 'ivd-hit');
      hit.addEventListener('pointerdown', (e) => down(e, { kind: 'cable', id: c.id }));
      g.append(s('path', { d }, `ivd-cable ${kind}${selected ? ' selected' : ''}`), hit);
      if (selected) {
        const m = cableMidpoint(a, b);
        const x = s('g', { transform: `translate(${m.x} ${m.y})` }, 'ivd-x');
        x.dataset.cableX = c.id;
        const label = s('text');
        label.textContent = '×';
        x.append(s('circle', { r: 9 }), label);
        x.addEventListener('pointerdown', (e) => down(e, { kind: 'cableX', id: c.id }));
        g.appendChild(x);
      }
      cableLayer.appendChild(g);
    }
  }

  const stop = effect(() => {
    const p = project.value;
    const sel = selection.value;
    const status = nodeStatus.value;
    const errors = nodeErrors.value;
    const { manifests } = deps.value;

    const live = new Set<string>();
    for (const n of p.nodes) {
      live.add(n.id);
      let v = views.get(n.id);
      if (!v) {
        v = buildNode(n.id);
        views.set(n.id, v);
      }
      const manifest = manifests.get(n.plugin);
      if (v.plugin !== n.plugin || v.manifest !== manifest) {
        v.plugin = n.plugin;
        buildPorts(n.id, v, manifest);
        v.title.textContent = manifest?.name ?? n.plugin;
      }
      v.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
      v.el.style.height = `${nodeSize(v.layout).h}px`;
      v.el.classList.toggle('selected', sel.node === n.id);
      const st = status[n.id] ?? 'loading';
      v.dot.className = `ivd-dot ${st}`;
      const err = errors[n.id];
      v.dot.title = st === 'error' ? (err ?? 'error') : st;
      v.el.dataset.status = st;
    }
    for (const [id, v] of views) {
      if (!live.has(id)) {
        v.el.remove();
        views.delete(id);
      }
    }
    renderCables();
    drawOverlay();
  });

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target;
    if (
      t instanceof HTMLElement &&
      (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    ) {
      return;
    }
    const effects = keyEffects(e.key, selection.peek());
    if (effects.length === 0) return;
    e.preventDefault();
    for (const fx of effects) run(fx);
  };
  document.addEventListener('keydown', onKey);

  return () => {
    stop();
    document.removeEventListener('keydown', onKey);
    canvas.remove();
    views.clear();
  };
};
