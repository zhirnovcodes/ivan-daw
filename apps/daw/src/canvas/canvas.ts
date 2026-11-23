// Canvas: plugin windows as DOM, cables as one SVG layer, sticky notes on top.
// Reads the project, selection, nodeStatus, nodeErrors and camera signals and calls store actions. No audio.
// Everything lives in one "world" layer that the camera moves; the canvas itself stays put.
// v1.2 layers, bottom to top: plugins, cables, connector info (the connection window), notes.
// Design: docs/v1.2-redesign.md, "2. Layers", "4. Plugin windows", "7. ARM connections".

import { effect } from '@preact/signals-core';
import type { ParameterInfo } from 'ivandaw-core';
import { REFUSE_TEXT } from '../contracts/router';
import type { MountUi } from '../contracts/ui';
import { hasStrip, type PortsManifest } from '../model/catalog';
import { CTL_GAIN, CTL_PAN } from '../model/control';
import { pluginInfo } from '../model/pluginInfo';
import {
  type ArmEnd,
  type ArmLink,
  armValid,
  GAIN_MAX,
  MASTER_PLUGIN,
  type PortRef,
} from '../model/project';
import { mountParamStrip, stripParams } from '../panels/paramStrip';
import { ensureW95, titleBar } from '../panels/w95';
import {
  connect,
  connectArm,
  disconnect,
  moveNode,
  panCamera,
  removeArm,
  removeNode,
  resetZoom,
  select,
  setArm,
  setEnabled,
  setGain,
  setPan,
  setUiHidden,
  setUiSlot,
  zoomAt,
} from '../store/actions';
import {
  boundsOf,
  type Camera,
  clampCamera,
  KEY_STEP,
  type Rect,
  wheelZoom,
} from '../store/camera';
import { camera, deps, mode, nodeErrors, nodeStatus, project, selection } from '../store/store';
import { controlChoices } from './controls';
import {
  cableMidpoint,
  cablePath,
  PORT_HIT_R,
  type PortSpot,
  type Pt,
  portAt,
  toWorld,
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
import { armName, displayNames } from './names';
import { mountNotes } from './notes';
import { renderNoteText } from './noteText';
import { permits, playTarget } from './playOnly';
import { canvasServices } from './services';
import { CANVAS_CSS } from './styles';
import {
  armDot,
  type Box,
  layoutWindow,
  PARAM_ROW,
  type PortLite,
  portDot,
  type Side,
  UI_INSET,
  type WindowLayout,
} from './window';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOAST_MS = 2000;
/** Cable hit width: the invisible stroke you click. */
const CABLE_HIT_W = 12;

let styleEl: HTMLStyleElement | undefined;
function ensureStyles(): void {
  ensureW95();
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

const place = (el: HTMLElement, b: Box): void => {
  el.style.left = `${b.x}px`;
  el.style.top = `${b.y}px`;
  el.style.width = `${b.w}px`;
  el.style.height = `${b.h}px`;
};

interface NodeView {
  el: HTMLElement;
  caption: HTMLElement;
  check: HTMLInputElement | undefined;
  fold: HTMLButtonElement | undefined;
  manifest: PortsManifest | undefined;
  plugin: string;
  /** Group boxes and connectors, rebuilt when the layout changes. */
  chrome: HTMLElement;
  layout: WindowLayout;
  /** Layout inputs as a string: rebuild the chrome only when it changes. */
  sig: string;
  /** Connector elements: `in:<port>`, `out:<port>`, `in:arm:<n>`, `out:arm:<n>`. */
  dots: Map<string, HTMLElement>;
  page: { in: number; out: number };
  uiHidden: boolean;
  ui?: { box: { width: number; height: number }; frame: HTMLElement; slot: HTMLElement };
  params?: { el: HTMLElement; key: string; dispose: () => void };
  footer?: { el: HTMLElement; vol: HTMLInputElement; pan: HTMLInputElement };
}

const portLite = (manifest: PortsManifest | undefined, dir: 'in' | 'out'): PortLite[] =>
  (manifest?.ports ?? [])
    .filter((p) => p.direction === dir)
    .map((p) => ({ id: p.id, label: p.label, kind: p.kind }));

const modOuts = (manifest: PortsManifest | undefined) =>
  (manifest?.ports ?? []).filter((p) => p.kind === 'modulation' && p.direction === 'out');

export const mountCanvas: MountUi = (root) => {
  ensureStyles();
  const canvas = h('div', 'ivd-canvas');
  const svg = s('svg', {}, 'ivd-cables');
  const cableLayer = s('g');
  const tempPath = s('path', {}, 'ivd-cable temp');
  tempPath.style.display = 'none';
  svg.append(cableLayer, tempPath);
  const nodeLayer = h('div', 'ivd-nodes');
  const infoLayer = h('div', 'ivd-info');
  const noteLayer = h('div', 'ivd-notes');
  const world = h('div', 'ivd-world');
  // Bottom to top: plugins, cables, connector info, notes.
  world.append(nodeLayer, svg, infoLayer, noteLayer);

  // Zoom panel, bottom-left: − · % (click = 100%) · +.
  const zoomPanel = h('div', 'ivd-zoombar');
  const zoomBtn = (cls: string, text: string, label: string): HTMLButtonElement => {
    const b = h('button', cls, text);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    zoomPanel.append(b);
    return b;
  };
  const zoomOut = zoomBtn('ivd-zoom-step', '−', 'Zoom out');
  const zoomLabel = zoomBtn('ivd-zoom', '100%', 'Zoom. Click for 100%');
  const zoomIn = zoomBtn('ivd-zoom-step', '+', 'Zoom in');
  zoomPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
  zoomPanel.addEventListener('wheel', (e) => e.stopPropagation());
  canvas.append(world, zoomPanel);
  root.appendChild(canvas);

  const views = new Map<string, NodeView>();
  let state: GestureState = IDLE;
  /** While connecting: 'node:port' (or 'node:arm:n') → is that input a valid target. */
  let validity = new Map<string, boolean>();

  /** Pointer position relative to the canvas's top-left, in screen px. */
  const screenPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** Pointer position in world px. */
  const rel = (e: PointerEvent): Pt => toWorld(screenPt(e), camera.peek());

  const nodeOf = (id: string) => project.peek().nodes.find((x) => x.id === id);
  const nodePos = (id: string): Pt => {
    const n = nodeOf(id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  const at = (node: string, p: Pt | undefined): Pt | undefined => {
    const n = nodeOf(node);
    return n && p ? { x: n.x + p.x, y: n.y + p.y } : undefined;
  };
  const portPoint = (ref: PortRef, side: Side): Pt | undefined => {
    const v = views.get(ref.node);
    return v ? at(ref.node, portDot(v.layout, side, ref.port)) : undefined;
  };
  const armPoint = (end: ArmEnd, side: Side): Pt | undefined => {
    const v = views.get(end.node);
    return v ? at(end.node, armDot(v.layout, side, end.index)) : undefined;
  };

  /** Input connectors as spots: audio / MIDI ones, or (arm) visible ARM IN ones with port `arm:<n>`. */
  const spotsOf = (arm: boolean): PortSpot[] => {
    const spots: PortSpot[] = [];
    for (const n of project.peek().nodes) {
      for (const g of views.get(n.id)?.layout.groups ?? []) {
        if (g.side !== 'in' || (g.kind === 'arm') !== arm) continue;
        for (const d of g.dots) {
          spots.push({ ref: { node: n.id, port: d.key }, center: { x: n.x + d.x, y: n.y + d.y } });
        }
      }
    }
    return spots;
  };
  const armEndOf = (spot: PortSpot): ArmEnd => ({
    node: spot.ref.node,
    index: Number(spot.ref.port.slice('arm:'.length)),
  });

  const sizeOf = (id: string) => {
    const l = views.get(id)?.layout;
    return { w: l?.w ?? 0, h: l?.h ?? 0 };
  };
  const ctx = (): GestureCtx => ({ sizeOf });

  /** Port hit radius in world px: never under PORT_HIT_R screen px when zoomed out. */
  const hitR = (): number => PORT_HIT_R / Math.min(1, camera.peek().z);

  /** The pan limit (v1.1.2): the view centre stays inside the box around all nodes. */
  const fit = (next: Camera, prev: Camera): Camera => {
    const boxes: Rect[] = [];
    for (const n of project.peek().nodes) {
      const sz = sizeOf(n.id);
      boxes.push({ left: n.x, top: n.y, right: n.x + sz.w, bottom: n.y + sz.h });
    }
    const view = { w: canvas.clientWidth, h: canvas.clientHeight };
    if (view.w === 0 || view.h === 0) return next;
    return clampCamera(next, prev, view, boundsOf(boxes));
  };
  const viewCenter = (): Pt => ({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });

  function run(e: Effect): void {
    if (!permits(mode.peek(), e)) return;
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
      case 'connectArm': {
        // One Out to choose from: pick it already. In always waits for the connection window.
        const outs = modOuts(views.get(e.from.node)?.manifest);
        connectArm(e.from, e.to, outs.length === 1 ? outs[0]?.id : undefined);
        break;
      }
      case 'removeArm':
        removeArm(e.id);
        break;
    }
  }

  function dispatch(ev: GestureEvent): void {
    const before = state;
    const step = reduce(state, ev, ctx());
    state = step.state;
    if (before.mode !== 'connect' && state.mode === 'connect') startConnect(state.from);
    if (before.mode !== 'armConnect' && state.mode === 'armConnect') startArmConnect(state.from);
    if (state.mode === 'idle') validity = new Map();
    for (const e of step.effects) run(e);
    drawOverlay();
  }

  function startConnect(from: PortRef): void {
    const { router, manifests } = deps.peek();
    const p = project.peek();
    validity = new Map();
    for (const spot of spotsOf(false)) {
      validity.set(
        `${spot.ref.node}:${spot.ref.port}`,
        router.validate(p, manifests, from, spot.ref).ok,
      );
    }
  }

  function startArmConnect(from: ArmEnd): void {
    validity = new Map();
    for (const spot of spotsOf(true)) {
      validity.set(`${spot.ref.node}:${spot.ref.port}`, spot.ref.node !== from.node);
    }
  }

  /** Temporary cable and the glow / dim on connectors. Runs on every gesture change. */
  function drawOverlay(): void {
    const connecting = state.mode === 'connect' || state.mode === 'armConnect';
    const armMode = state.mode === 'armConnect';
    for (const [id, v] of views) {
      for (const [key, el] of v.dots) {
        const isIn = key.startsWith('in:');
        const port = key.slice(isIn ? 3 : 4);
        const ok = validity.get(`${id}:${port}`);
        const sameKind = port.startsWith('arm:') === armMode;
        el.classList.toggle('valid', connecting && isIn && ok === true);
        el.classList.toggle('invalid', connecting && (!isIn || !sameKind || ok !== true));
      }
    }
    if (state.mode !== 'connect' && state.mode !== 'armConnect') {
      tempPath.style.display = 'none';
      return;
    }
    const from =
      state.mode === 'armConnect' ? armPoint(state.from, 'out') : portPoint(state.from, 'out');
    if (!from) {
      tempPath.style.display = 'none';
      return;
    }
    const over = portAt(state.at, spotsOf(armMode), hitR());
    const end = over && validity.get(`${over.ref.node}:${over.ref.port}`) ? over.center : state.at;
    tempPath.setAttribute('d', cablePath(from, end));
    let kind = 'modulation';
    if (state.mode === 'connect') {
      const ref = state.from;
      kind =
        views.get(ref.node)?.manifest?.ports.find((p) => p.id === ref.port && p.direction === 'out')
          ?.kind ?? 'audio';
    }
    tempPath.setAttribute('class', `ivd-cable temp ${kind}`);
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
    const end = (): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
    const up = (u: PointerEvent): void => {
      end();
      const p = rel(u);
      if (state.mode === 'armConnect') {
        const hit = portAt(p, spotsOf(true), hitR());
        dispatch({ type: 'up', at: p, ...(hit ? { dropArm: armEndOf(hit) } : {}) });
        return;
      }
      const hit = portAt(p, spotsOf(false), hitR());
      dispatch({ type: 'up', at: p, ...(hit ? { drop: hit.ref } : {}) });
    };
    const cancel = (): void => {
      end();
      dispatch({ type: 'cancel' });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  }

  function down(e: PointerEvent, asked: Target, capture?: HTMLElement): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const outKind =
      asked.kind === 'outPort'
        ? views.get(asked.ref.node)?.manifest?.ports.find((p) => p.id === asked.ref.port)?.kind
        : undefined;
    const target = playTarget(mode.peek(), asked, outKind);
    if (!target) return;
    dispatch({ type: 'down', target, at: rel(e) });
    if (capture && state.mode !== 'idle') track(capture, e);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.target === canvas) down(e, { kind: 'empty' });
  });

  // Camera pan, right button: anywhere on the canvas, over windows too (capture phase, so it wins).
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
        const z = camera.peek().z;
        panCamera((last.x - p.x) / z, (last.y - p.y) / z, fit);
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

  // Two-finger scroll and mouse wheel pan. Ctrl + wheel and trackpad pinch zoom around the pointer.
  canvas.addEventListener(
    'wheel',
    (e) => {
      const pageH = canvas.clientHeight || 600;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(screenPt(e), wheelZoom(e.deltaY, e.deltaMode, pageH), fit);
        return;
      }
      // Over a plugin's own UI the wheel is the plugin's (its knobs, its lists).
      if (e.target instanceof Element && e.target.closest('.ivd-ui')) return;
      e.preventDefault();
      const d = wheelPan(e, pageH);
      const z = camera.peek().z;
      panCamera(d.x / z, d.y / z, fit);
    },
    { passive: false },
  );

  zoomLabel.addEventListener('click', () => resetZoom(viewCenter(), fit));
  zoomOut.addEventListener('click', () => zoomAt(viewCenter(), -KEY_STEP, fit));
  zoomIn.addEventListener('click', () => zoomAt(viewCenter(), KEY_STEP, fit));

  const stopCamera = effect(() => {
    const c = camera.value;
    world.style.transform = `translate(${-c.x * c.z}px, ${-c.y * c.z}px) scale(${c.z})`;
    zoomLabel.textContent = `${Math.round(c.z * 100)}%`;
  });

  // ---- Plugin info notes (`?`): read-only, not saved, one per plugin. ----
  const infoNotes = new Map<string, HTMLElement>();
  function toggleInfo(id: string): void {
    const open = infoNotes.get(id);
    if (open) {
      open.remove();
      infoNotes.delete(id);
      return;
    }
    const n = nodeOf(id);
    const v = views.get(id);
    if (!n || !v) return;
    const el = h('div', 'ivd-note ivd-info-note w95-window');
    el.dataset.info = id;
    const { bar } = titleBar(v.manifest?.name ?? n.plugin, [
      { label: 'X', title: 'Close', onClick: () => toggleInfo(id) },
    ]);
    const body = h('div', 'ivd-note-body w95-scroll');
    body.append(renderNoteText(pluginInfo(n.plugin)));
    el.append(bar, body);
    el.style.transform = `translate(${n.x + v.layout.w + 12}px, ${n.y}px)`;
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) e.stopPropagation();
    });
    el.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) e.stopPropagation();
    });
    noteLayer.append(el);
    infoNotes.set(id, el);
  }

  // ---- Plugin windows ----

  function buildNode(id: string): NodeView {
    const el = h('div', 'ivd-node w95-window');
    el.dataset.node = id;
    const chrome = h('div', 'ivd-chrome');
    el.append(chrome);
    el.addEventListener('pointerdown', (e) => down(e, { kind: 'body', node: id }));
    nodeLayer.appendChild(el);
    return {
      el,
      caption: h('span', ''),
      check: undefined,
      fold: undefined,
      manifest: undefined,
      plugin: '',
      chrome,
      layout: { w: 0, h: 0, groups: [] },
      sig: '',
      dots: new Map(),
      page: { in: 0, out: 0 },
      uiHidden: false,
    };
  }

  /** Title bar: on / off box, name, `?`, `_` (plugins with a UI), `X` (not Master, not in play-only). */
  function buildTitle(id: string, v: NodeView): void {
    v.el.querySelector(':scope > .w95-titlebar')?.remove();
    const isMaster = v.plugin === MASTER_PLUGIN;
    const buttons: Parameters<typeof titleBar>[1][number][] = [];
    if (!isMaster) {
      buttons.push({ label: '?', title: 'About this plugin', onClick: () => toggleInfo(id) });
    }
    if (v.manifest?.ui) {
      buttons.push({
        label: '_',
        title: 'Hide plugin',
        onClick: () => setUiHidden(id, !v.uiHidden),
      });
    }
    if (!isMaster && mode.peek() === 'edit') {
      buttons.push({ label: 'X', title: 'Remove plugin', onClick: () => removeNode(id) });
    }
    const { bar, caption } = titleBar(v.manifest?.name ?? v.plugin, buttons);
    bar.classList.add('ivd-header');
    v.caption = caption;
    v.fold = v.manifest?.ui
      ? (bar.querySelector<HTMLButtonElement>('button[aria-label="Hide plugin"]') ?? undefined)
      : undefined;
    v.check = undefined;
    if (!isMaster) {
      const check = h('input', 'w95-check ivd-onoff');
      check.type = 'checkbox';
      check.checked = true;
      check.title = 'On / off';
      check.setAttribute('aria-label', 'Plugin on');
      check.addEventListener('pointerdown', (e) => e.stopPropagation());
      check.addEventListener('change', () => setEnabled(id, check.checked));
      bar.prepend(check);
      v.check = check;
    }
    bar.addEventListener('pointerdown', (e) =>
      down(e, { kind: 'header', node: id, nodePos: nodePos(id) }, bar),
    );
    v.el.prepend(bar);
  }

  /** The slot a plugin's own UI is mounted into (by the app shell), in a sunken frame. */
  function buildUi(id: string, v: NodeView): void {
    v.ui?.frame.remove();
    v.ui = undefined;
    const box = v.manifest?.ui;
    if (!box) {
      setUiSlot(id, null);
      return;
    }
    const frame = h('div', 'ivd-uiframe');
    const slot = h('div', 'ivd-ui');
    slot.dataset.ui = id;
    slot.style.left = `${UI_INSET}px`;
    slot.style.top = `${UI_INSET}px`;
    slot.style.width = `${box.width}px`;
    slot.style.height = `${box.height}px`;
    // The UI belongs to the plugin: no window drag, no default-prevented clicks. It still selects.
    slot.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (selection.peek().node !== id) select({ node: id });
    });
    frame.append(slot);
    v.el.appendChild(frame);
    v.ui = { box, frame, slot };
    setUiSlot(id, slot);
  }

  function buildFooter(id: string, v: NodeView): void {
    v.footer?.el.remove();
    v.footer = undefined;
    if (!hasStrip(v.plugin, v.manifest)) return;
    const el = h('div', 'ivd-foot');
    const range = (label: string, min: number, max: number): HTMLInputElement => {
      const row = h('label', 'ivd-foot-row');
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'w95-range';
      input.min = String(min);
      input.max = String(max);
      input.step = '0.01';
      input.setAttribute('aria-label', label);
      row.append(h('span', '', label), input);
      el.append(row);
      return input;
    };
    const vol = range('Volume', 0, GAIN_MAX);
    const pan = range('Pan', -1, 1);
    vol.dataset.control = 'gain';
    pan.dataset.control = 'pan';
    vol.addEventListener('input', () => setGain(id, Number(vol.value)));
    pan.addEventListener('input', () => setPan(id, Number(pan.value)));
    pan.addEventListener('dblclick', () => setPan(id, 0));
    // The footer is for the sliders: no window drag, but it selects the window.
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (selection.peek().node !== id) select({ node: id });
    });
    v.el.appendChild(el);
    v.footer = { el, vol, pan };
  }

  /** The parameter strip for plugins without their own UI, rebuilt when the parameter list changes. */
  function syncParams(id: string, v: NodeView, params: readonly ParameterInfo[]): void {
    const key = params.map((p) => p.id).join('|');
    if ((v.params?.key ?? '') === key) return;
    v.params?.dispose();
    v.params?.el.remove();
    v.params = undefined;
    const inst = canvasServices().instance(id);
    if (key === '' || !inst) return;
    const el = h('div', 'ivd-params');
    el.style.setProperty('--row', `${PARAM_ROW}px`);
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (selection.peek().node !== id) select({ node: id });
    });
    const dispose = mountParamStrip(el, id, inst, params);
    v.el.appendChild(el);
    v.params = { el, key, dispose };
  }

  /** Group boxes, labels, connectors and pagers, from the layout. */
  function buildChrome(id: string, v: NodeView): void {
    v.chrome.replaceChildren();
    v.dots.clear();
    for (const g of v.layout.groups) {
      const box = h('div', `ivd-group ${g.kind}`);
      place(box, { x: g.x, y: g.y, w: g.w, h: g.h });
      box.append(h('div', 'ivd-group-label', `${g.label[0]}\n${g.label[1]}`));
      v.chrome.append(box);
      for (const d of g.dots) {
        const dot = h('i', `ivd-dot ${g.kind} ${g.side}`);
        dot.style.left = `${d.x}px`;
        dot.style.top = `${d.y}px`;
        dot.title = g.kind === 'arm' ? `${g.label.join(' ')} ${d.label}` : d.label;
        dot.dataset.port = `${g.side}:${d.key}`;
        if (g.kind === 'arm') {
          const num = h('span', 'ivd-dot-num', d.label);
          num.style.left = `${d.x}px`;
          num.style.top = `${d.y - 19}px`;
          v.chrome.append(num);
        }
        const index = d.index;
        if (g.side === 'out' && g.kind !== 'arm') {
          dot.addEventListener('pointerdown', (e) =>
            down(e, { kind: 'outPort', ref: { node: id, port: d.key } }, dot),
          );
        } else if (g.side === 'out' && index !== undefined) {
          dot.addEventListener('pointerdown', (e) =>
            down(e, { kind: 'armOut', end: { node: id, index } }, dot),
          );
        }
        v.chrome.append(dot);
        v.dots.set(`${g.side}:${d.key}`, dot);
      }
      if (g.arm) {
        const arm = g.arm;
        const side = g.side;
        const pager = h('div', 'ivd-pager');
        pager.style.left = `${g.x + 4}px`;
        pager.style.top = `${arm.pagerY - 8}px`;
        const btn = (text: string, label: string, dir: 1 | -1): void => {
          const b = h('button', 'w95-tbtn', text);
          b.type = 'button';
          b.title = label;
          b.setAttribute('aria-label', label);
          b.disabled = dir < 0 ? arm.page === 0 : arm.page >= arm.pages - 1;
          b.addEventListener('pointerdown', (e) => e.stopPropagation());
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            v.page[side] = Math.max(0, Math.min(arm.pages - 1, arm.page + dir));
            v.sig = ''; // force a relayout
            render();
          });
          pager.append(b);
        };
        btn('<', `${g.label.join(' ')}: previous`, -1);
        btn('>', `${g.label.join(' ')}: next`, 1);
        v.chrome.append(pager);
      }
    }
  }

  /** Which ARM targets a node has: Volume / Pan (when it has them) and automatable parameters. */
  const armTargets = (id: string, v: NodeView) =>
    v.plugin === MASTER_PLUGIN
      ? []
      : controlChoices(hasStrip(v.plugin, v.manifest), canvasServices().parameters(id));

  function render(): void {
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
        v.manifest = manifest;
        buildTitle(n.id, v);
        buildUi(n.id, v);
        buildFooter(n.id, v);
        v.sig = '';
      }
      const st = status[n.id] ?? 'loading';
      const ready = st === 'ready';
      const params = ready && !manifest?.ui ? stripParams(canvasServices().instance(n.id)) : [];
      syncParams(n.id, v, params);

      v.uiHidden = v.ui !== undefined && n.uiHidden === true;
      if (v.ui) v.ui.frame.style.display = v.uiHidden ? 'none' : '';
      if (v.fold) {
        v.fold.textContent = v.uiHidden ? '□' : '–';
        const t = v.uiHidden ? 'Show plugin' : 'Hide plugin';
        v.fold.title = t;
        v.fold.setAttribute('aria-label', t);
      }
      if (v.check) v.check.checked = !n.bypass;
      v.el.classList.toggle('off', n.bypass);

      const spec = {
        ins: portLite(manifest, 'in'),
        outs: portLite(manifest, 'out'),
        armIn: ready && armTargets(n.id, v).length > 0,
        armOut: modOuts(manifest).length > 0,
        ...(v.ui && !v.uiHidden ? { ui: v.ui.box } : {}),
        paramRows: v.params ? params.length : 0,
        footer: v.footer !== undefined,
        page: v.page,
      };
      const sig = JSON.stringify(spec);
      if (sig !== v.sig) {
        v.sig = sig;
        v.layout = layoutWindow(spec);
        buildChrome(n.id, v);
        if (v.ui && v.layout.ui) place(v.ui.frame, v.layout.ui);
        if (v.params && v.layout.params) place(v.params.el, v.layout.params);
        if (v.footer && v.layout.footer) place(v.footer.el, v.layout.footer);
        v.el.style.width = `${v.layout.w}px`;
        v.el.style.height = `${v.layout.h}px`;
      }
      v.el.style.transform = `translate(${n.x}px, ${n.y}px)`;

      if (v.footer) {
        if (Number(v.footer.vol.value) !== n.gain) v.footer.vol.value = String(n.gain);
        if (Number(v.footer.pan.value) !== n.pan) v.footer.pan.value = String(n.pan);
        // An ARM link drives it now: the slider shows the resting value and waits.
        const bound = (port: string) =>
          (p.arms ?? []).some((a) => armValid(a) && a.to.node === n.id && a.target === port);
        v.footer.vol.disabled = bound(CTL_GAIN);
        v.footer.pan.disabled = bound(CTL_PAN);
      }
      v.el.classList.toggle('selected', sel.node === n.id);
      const name = manifest?.name ?? n.plugin;
      v.caption.textContent =
        st === 'error' ? `${name} (error)` : st === 'loading' ? `${name} (loading…)` : name;
      v.caption.title = st === 'error' ? (errors[n.id] ?? 'error') : name;
      v.el.dataset.status = st;
    }
    for (const [id, v] of views) {
      if (!live.has(id)) {
        if (v.ui) setUiSlot(id, null);
        v.params?.dispose();
        v.el.remove();
        views.delete(id);
        infoNotes.get(id)?.remove();
        infoNotes.delete(id);
      }
    }
    renderCables();
    renderConnection();
    drawOverlay();
  }

  function renderCables(): void {
    cableLayer.replaceChildren();
    const p = project.value;
    const sel = selection.value;
    for (const c of p.cables) {
      const a = portPoint(c.from, 'out');
      const b = portPoint(c.to, 'in');
      if (!a || !b) continue;
      const kind =
        views.get(c.from.node)?.manifest?.ports.find((x) => x.id === c.from.port)?.kind ?? 'audio';
      const d = cablePath(a, b);
      const g = s('g', {}, `ivd-cable-g${sel.cable === c.id ? ' selected' : ''}`);
      g.dataset.cable = c.id;
      const hit = s('path', { d, 'stroke-width': CABLE_HIT_W }, 'ivd-hit');
      hit.addEventListener('pointerdown', (e) => down(e, { kind: 'cable', id: c.id }));
      g.append(s('path', { d }, `ivd-cable ${kind}`), hit);
      cableLayer.appendChild(g);
    }
    for (const arm of p.arms ?? []) {
      const a = armPoint(arm.from, 'out');
      const b = armPoint(arm.to, 'in');
      if (!a || !b) continue;
      const d = cablePath(a, b);
      const valid = armValid(arm);
      const g = s('g', {}, `ivd-cable-g${sel.arm === arm.id ? ' selected' : ''}`);
      g.dataset.arm = arm.id;
      const hit = s('path', { d, 'stroke-width': CABLE_HIT_W }, 'ivd-hit');
      hit.addEventListener('pointerdown', (e) => down(e, { kind: 'armCable', id: arm.id }));
      g.append(s('path', { d }, `ivd-cable modulation${valid ? '' : ' invalid'}`), hit);
      cableLayer.appendChild(g);
    }
  }

  // ---- Connection window: one at a time, for the selected ARM link. ----
  interface Pct {
    range: HTMLInputElement;
    field: HTMLInputElement;
  }
  interface Conn {
    id: string;
    el: HTMLElement;
    caption: HTMLElement;
    out: HTMLSelectElement;
    inp: HTMLSelectElement;
    min: Pct;
    max: Pct;
    choicesKey: string;
  }
  let conn: Conn | undefined;

  const closeConn = (): void => {
    conn?.el.remove();
    conn = undefined;
  };

  function fillSelect(
    sel: HTMLSelectElement,
    opts: readonly { value: string; label: string; group?: string }[],
  ): void {
    sel.replaceChildren();
    const none = h('option', '', '—');
    none.value = '';
    sel.append(none);
    let group: HTMLOptGroupElement | undefined;
    for (const o of opts) {
      const opt = h('option', '', o.label);
      opt.value = o.value;
      if (o.group) {
        if (group?.label !== o.group) {
          group = h('optgroup', '');
          group.label = o.group;
          sel.append(group);
        }
        group.append(opt);
      } else {
        group = undefined;
        sel.append(opt);
      }
    }
  }

  function percentRow(label: string, onSet: (v: number) => void): Pct & { row: HTMLElement } {
    const row = h('div', 'ivd-conn-row');
    const range = h('input', 'w95-range');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.step = '1';
    range.setAttribute('aria-label', label);
    const field = h('input', 'w95-field ivd-conn-pct');
    field.type = 'text';
    field.inputMode = 'numeric';
    field.setAttribute('aria-label', `${label} %`);
    range.addEventListener('input', () => onSet(Number(range.value)));
    const commit = (): void => {
      const v = Number.parseFloat(field.value);
      if (Number.isFinite(v)) onSet(v);
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
        field.blur();
      }
    });
    field.addEventListener('blur', commit);
    row.append(h('span', 'ivd-conn-label', label.toUpperCase()), range, field);
    return { row, range, field };
  }

  function buildConn(link: ArmLink): Conn {
    const el = h('div', 'ivd-conn w95-window');
    el.dataset.conn = link.id;
    const { bar, caption } = titleBar('', [
      { label: 'X', title: 'Close', onClick: () => select({}) },
    ]);
    const body = h('div', 'ivd-conn-body');
    const selRow = (label: string): HTMLSelectElement => {
      const row = h('div', 'ivd-conn-row');
      const wrap = h('div', 'w95-select');
      const sel = h('select', '');
      sel.setAttribute('aria-label', label);
      wrap.append(sel);
      row.append(h('span', 'ivd-conn-label', label.toUpperCase()), wrap);
      body.append(row);
      return sel;
    };
    const id = link.id;
    const out = selRow('Out');
    const inp = selRow('In');
    out.addEventListener('change', () =>
      setArm(id, { source: out.value === '' ? null : out.value }),
    );
    inp.addEventListener('change', () =>
      setArm(id, { target: inp.value === '' ? null : inp.value }),
    );
    const min = percentRow('Min', (v) => setArm(id, { min: v }));
    const max = percentRow('Max', (v) => setArm(id, { max: v }));
    body.append(min.row, max.row);
    el.append(bar, body);
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) e.stopPropagation();
    });
    el.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) e.stopPropagation();
    });
    infoLayer.append(el);
    return { id, el, caption, out, inp, min, max, choicesKey: '' };
  }

  function renderConnection(): void {
    const id = selection.value.arm;
    const p = project.value;
    const link = id ? (p.arms ?? []).find((a) => a.id === id) : undefined;
    if (!link) {
      closeConn();
      return;
    }
    if (conn?.id !== link.id) {
      closeConn();
      conn = buildConn(link);
    }
    const c = conn;
    const { manifests } = deps.value;
    const names = displayNames(p.nodes, (plugin) => manifests.get(plugin)?.name ?? plugin);
    c.caption.textContent = armName(link, names);

    const toView = views.get(link.to.node);
    const outs = modOuts(views.get(link.from.node)?.manifest).map((x) => ({
      value: x.id,
      label: x.label,
    }));
    const ins = toView
      ? armTargets(link.to.node, toView).map((x) => ({
          value: x.port,
          label: x.label,
          ...(x.group ? { group: x.group } : {}),
        }))
      : [];
    const key = JSON.stringify([outs, ins]);
    if (c.choicesKey !== key) {
      c.choicesKey = key;
      fillSelect(c.out, outs);
      fillSelect(c.inp, ins);
    }
    c.out.value = link.source ?? '';
    c.inp.value = link.target ?? '';
    const pct: [Pct, number][] = [
      [c.min, link.min],
      [c.max, link.max],
    ];
    for (const [row, v] of pct) {
      if (Number(row.range.value) !== v) row.range.value = String(v);
      if (document.activeElement !== row.field) row.field.value = `${v}%`;
    }
    // Under the middle of the cable.
    const a = armPoint(link.from, 'out');
    const b = armPoint(link.to, 'in');
    if (a && b) {
      const m = cableMidpoint(a, b);
      c.el.style.transform = `translate(${Math.round(m.x - 120)}px, ${Math.round(m.y + 14)}px)`;
    }
  }

  const stop = effect(render);

  const onKey = (e: KeyboardEvent): void => {
    // Ctrl/Cmd + / - / 0 zoom the canvas around the view centre, not the browser page.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const step = e.key === '=' || e.key === '+' ? KEY_STEP : e.key === '-' ? -KEY_STEP : 0;
      if (step !== 0) {
        e.preventDefault();
        zoomAt(viewCenter(), step, fit);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        resetZoom(viewCenter(), fit);
        return;
      }
    }
    const t = e.target;
    if (
      t instanceof HTMLElement &&
      (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    ) {
      // The on / off box and sliders don't swallow Delete / Escape; text fields and lists do.
      if (!(t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'range'))) return;
    }
    const effects = keyEffects(e.key, selection.peek());
    if (effects.length === 0) return;
    e.preventDefault();
    for (const fx of effects) run(fx);
  };
  document.addEventListener('keydown', onKey);
  const stopNotes = mountNotes(noteLayer);

  return () => {
    stop();
    stopCamera();
    stopNotes();
    closeConn();
    document.removeEventListener('keydown', onKey);
    canvas.remove();
    for (const [id, v] of views) {
      if (v.ui) setUiSlot(id, null);
      v.params?.dispose();
    }
    views.clear();
  };
};
