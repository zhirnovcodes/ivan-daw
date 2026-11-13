// P5 Canvas: nodes as DOM boxes, cables as one SVG layer behind them.
// Reads the project, selection, nodeStatus, nodeErrors and camera signals and calls store actions. No audio.
// Nodes and cables live in one "world" layer that the camera moves; the canvas itself stays put.
// Tech design: "Canvas".

import { effect } from '@preact/signals-core';
import { REFUSE_TEXT } from '../contracts/router';
import type { MountUi } from '../contracts/ui';
import { mainAudioOut, type PortsManifest } from '../model/catalog';
import { CTL_GAIN, CTL_PAN, controlLabel, isControlPort } from '../model/control';
import { GAIN_MAX, MASTER_PLUGIN, type PortRef } from '../model/project';
import {
  connect,
  disconnect,
  moveNode,
  panCamera,
  removeNode,
  select,
  setGain,
  setPan,
  setUiSlot,
} from '../store/actions';
import { camera, deps, nodeErrors, nodeStatus, project, selection } from '../store/store';
import { CTL_SPOT, controlChoices, spotOf } from './controls';
import {
  CABLE_HIT_W,
  cableMidpoint,
  cablePath,
  layoutPorts,
  NODE_W,
  nodeSize,
  nodeWidth,
  type PortLayout,
  type PortSpot,
  type Pt,
  portAt,
  portCenter,
  toWorld,
  type UiBox,
  uiTop,
  wheelPan,
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
import { canvasServices } from './services';
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
  /** Box width: 180, or wider for a plugin UI. */
  w: number;
  /** The plugin UI's size and the element it is mounted into, when the manifest has `ui`. */
  ui?: { box: UiBox; slot: HTMLElement };
  /** Volume and pan on the box, for nodes with a main audio out and for Master. */
  footer?: { el: HTMLElement; vol: HTMLInputElement; pan: HTMLInputElement };
}

/** Whether a node shows the volume / pan footer. */
const hasFooter = (plugin: string, manifest: PortsManifest | undefined): boolean =>
  plugin === MASTER_PLUGIN || (manifest !== undefined && mainAudioOut(manifest) !== undefined);

export const mountCanvas: MountUi = (root) => {
  ensureStyles();
  const canvas = h('div', 'ivd-canvas');
  const svg = s('svg', {}, 'ivd-cables');
  const cableLayer = s('g');
  const tempPath = s('path', {}, 'ivd-cable temp');
  tempPath.style.display = 'none';
  svg.append(cableLayer, tempPath);
  const nodeLayer = h('div', 'ivd-nodes');
  const world = h('div', 'ivd-world');
  world.append(svg, nodeLayer);
  canvas.append(world);
  root.appendChild(canvas);

  const views = new Map<string, NodeView>();
  let state: GestureState = IDLE;
  /** While connecting: 'node:port' → is that input a valid target. */
  let validity = new Map<string, boolean>();

  /** Pointer position relative to the canvas's top-left, in screen px. */
  const screenPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** Pointer position in world px: what node positions and port centres use. */
  const rel = (e: PointerEvent): Pt => toWorld(screenPt(e), camera.peek());

  const nodePos = (id: string): Pt => {
    const n = project.peek().nodes.find((x) => x.id === id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  const portPoint = (ref: PortRef): Pt | undefined => {
    const n = project.peek().nodes.find((x) => x.id === ref.node);
    const spot = spotOf(ref.port);
    const l = views.get(ref.node)?.layout.find((p) => p.id === spot);
    const w = views.get(ref.node)?.w ?? NODE_W;
    return n && l ? portCenter(n, l, w) : undefined;
  };

  const inputSpots = (): PortSpot[] => {
    const spots: PortSpot[] = [];
    for (const n of project.peek().nodes) {
      for (const l of views.get(n.id)?.layout ?? []) {
        if (l.direction === 'in') {
          spots.push({
            ref: { node: n.id, port: l.id },
            center: portCenter(n, l, views.get(n.id)?.w),
          });
        }
      }
    }
    return spots;
  };

  const ctx = (): GestureCtx => ({
    sizeOf: (id) => {
      const v = views.get(id);
      return nodeSize(v?.layout ?? [], v?.footer !== undefined, v?.ui?.box);
    },
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
        if (e.to.port === CTL_SPOT) {
          openPicker(e.from, e.to.node);
          break;
        }
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

  /** What a control cable from `from` may drive on `node`, already checked by the router. */
  function choicesFor(from: PortRef, node: string) {
    const { router, manifests } = deps.peek();
    const p = project.peek();
    const hasStrip = views.get(node)?.footer !== undefined;
    return controlChoices(hasStrip, canvasServices().parameters(node)).filter(
      (c) => router.validate(p, manifests, from, { node, port: c.port }).ok,
    );
  }

  function startConnect(from: PortRef): void {
    const { router, manifests } = deps.peek();
    const p = project.peek();
    validity = new Map();
    for (const spot of inputSpots()) {
      const ok =
        spot.ref.port === CTL_SPOT
          ? choicesFor(from, spot.ref.node).length > 0
          : router.validate(p, manifests, from, spot.ref).ok;
      validity.set(`${spot.ref.node}:${spot.ref.port}`, ok);
    }
  }

  // The control-input picker: opens where a control cable was dropped on a node's ctl spot.
  let picker: HTMLElement | undefined;
  let lastUp: Pt = { x: 0, y: 0 };
  const closePicker = (): void => {
    picker?.remove();
    picker = undefined;
  };
  function openPicker(from: PortRef, node: string): void {
    closePicker();
    const choices = choicesFor(from, node);
    if (choices.length === 0) {
      showToast('nothing on this node takes a control cable yet');
      return;
    }
    const el = h('div', 'ivd-picker');
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'Control what');
    let group: string | undefined;
    for (const c of choices) {
      if (c.group && c.group !== group) el.append(h('div', 'ivd-picker-group', c.group));
      group = c.group;
      const b = h('button', '', c.label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.dataset.port = c.port;
      b.addEventListener('click', () => {
        closePicker();
        const r = connect(from, { node, port: c.port });
        if (!r.ok) showToast(REFUSE_TEXT[r.reason]);
      });
      el.append(b);
    }
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation());
    el.style.left = `${Math.max(4, Math.min(lastUp.x, canvas.clientWidth - 220))}px`;
    el.style.top = `${Math.max(4, Math.min(lastUp.y, canvas.clientHeight - 300))}px`;
    canvas.append(el);
    picker = el;
  }
  canvas.addEventListener('pointerdown', () => closePicker());

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
      lastUp = screenPt(u);
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

  // Camera pan, right button: anywhere on the canvas, over nodes too (capture phase, so it wins).
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      let last = screenPt(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events may have no active pointer.
      }
      canvas.classList.add('panning');
      const move = (m: PointerEvent): void => {
        const p = screenPt(m);
        panCamera(last.x - p.x, last.y - p.y);
        last = p;
      };
      const end = (): void => {
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', end);
        canvas.removeEventListener('pointercancel', end);
        canvas.classList.remove('panning');
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
    },
    { capture: true },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Camera pan, trackpad two-finger scroll (and mouse wheel). Pinch arrives as ctrl + wheel: no zoom yet,
  // but it must not zoom the whole page either.
  canvas.addEventListener(
    'wheel',
    (e) => {
      // Over a plugin's own UI the wheel is the plugin's (its knobs, its lists).
      if (e.target instanceof Element && e.target.closest('.ivd-ui')) return;
      e.preventDefault();
      if (e.ctrlKey) return;
      const d = wheelPan(e, canvas.clientHeight || 600);
      panCamera(d.x, d.y);
    },
    { passive: false },
  );

  const stopCamera = effect(() => {
    const c = camera.value;
    world.style.transform = `translate(${-c.x}px, ${-c.y}px)`;
    canvas.style.backgroundPosition = `${-c.x}px ${-c.y}px`;
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
    return {
      el,
      title,
      dot,
      manifest: undefined,
      plugin: '',
      layout: [],
      portEls: new Map(),
      w: NODE_W,
    };
  }

  function buildPorts(id: string, v: NodeView, manifest: PortsManifest | undefined): void {
    for (const el of v.portEls.values()) el.remove();
    v.portEls.clear();
    v.manifest = manifest;
    // Every node with a known manifest gets the one dotted ctl input for control cables (v1.1).
    v.layout = layoutPorts(
      manifest
        ? [...manifest.ports, { id: CTL_SPOT, label: 'ctl', kind: 'modulation', direction: 'in' }]
        : [],
    );
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

  /** The slot a plugin's own UI is mounted into (by the app shell), under the port rows. */
  function buildUi(id: string, v: NodeView): void {
    v.ui?.slot.remove();
    v.ui = undefined;
    const box = v.manifest?.ui;
    v.w = nodeWidth(box);
    if (!box) {
      setUiSlot(id, null);
      return;
    }
    const slot = h('div', 'ivd-ui');
    slot.dataset.ui = id;
    slot.style.top = `${uiTop(v.layout)}px`;
    slot.style.width = `${box.width}px`;
    slot.style.height = `${box.height}px`;
    // The UI belongs to the plugin: no node drag, no default-prevented clicks. It still selects the node.
    slot.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (selection.peek().node !== id) select({ node: id });
    });
    v.el.appendChild(slot);
    v.ui = { box, slot };
    setUiSlot(id, slot);
  }

  function buildFooter(id: string, v: NodeView): void {
    v.footer?.el.remove();
    v.footer = undefined;
    if (!hasFooter(v.plugin, v.manifest)) return;
    const el = h('div', 'ivd-foot');
    const range = (label: string, min: number, max: number): HTMLInputElement => {
      const row = h('label', 'ivd-foot-row');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = '0.01';
      input.setAttribute('aria-label', label);
      row.append(h('span', '', label), input);
      el.append(row);
      return input;
    };
    const vol = range('Vol', 0, GAIN_MAX);
    const pan = range('Pan', -1, 1);
    vol.dataset.control = 'gain';
    pan.dataset.control = 'pan';
    vol.addEventListener('input', () => setGain(id, Number(vol.value)));
    pan.addEventListener('input', () => setPan(id, Number(pan.value)));
    pan.addEventListener('dblclick', () => setPan(id, 0));
    // The footer is for the sliders: no node drag, no empty-canvas click, but it selects the node.
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (selection.peek().node !== id) select({ node: id });
    });
    v.el.appendChild(el);
    v.footer = { el, vol, pan };
  }

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
      if (isControlPort(c.to.port)) {
        const params = canvasServices().parameters(c.to.node);
        const label = s('text', { x: b.x - 10, y: b.y - 8 }, 'ivd-cable-label');
        label.textContent = controlLabel(c.to.port, (id) => params.find((p) => p.id === id)?.label);
        g.appendChild(label);
      }
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
        buildUi(n.id, v);
        buildFooter(n.id, v);
        v.title.textContent = manifest?.name ?? n.plugin;
      }
      v.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
      const size = nodeSize(v.layout, v.footer !== undefined, v.ui?.box);
      v.el.style.width = `${size.w}px`;
      v.el.style.height = `${size.h}px`;
      if (v.footer) {
        if (Number(v.footer.vol.value) !== n.gain) v.footer.vol.value = String(n.gain);
        if (Number(v.footer.pan.value) !== n.pan) v.footer.pan.value = String(n.pan);
        // A control cable drives it now: the slider shows the resting value and waits.
        const bound = (port: string) =>
          p.cables.some((c) => c.to.node === n.id && c.to.port === port);
        v.footer.vol.disabled = bound(CTL_GAIN);
        v.footer.pan.disabled = bound(CTL_PAN);
      }
      v.el.classList.toggle('selected', sel.node === n.id);
      const st = status[n.id] ?? 'loading';
      v.dot.className = `ivd-dot ${st}`;
      const err = errors[n.id];
      v.dot.title = st === 'error' ? (err ?? 'error') : st;
      v.el.dataset.status = st;
    }
    for (const [id, v] of views) {
      if (!live.has(id)) {
        if (v.ui) setUiSlot(id, null);
        v.el.remove();
        views.delete(id);
      }
    }
    renderCables();
    drawOverlay();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closePicker();
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
    stopCamera();
    document.removeEventListener('keydown', onKey);
    canvas.remove();
    for (const [id, v] of views) if (v.ui) setUiSlot(id, null);
    views.clear();
  };
};
