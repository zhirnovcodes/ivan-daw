// Contract C4: store actions, the only writers of the store. Tech design: "Project model and store".
// Each project change replaces the whole Project object; the previous one is never mutated.

import type { RefuseReason } from '../contracts/router';
import { mainAudioOut } from '../model/catalog';
import {
  ARM_SLOTS,
  type ArmEnd,
  type ArmLink,
  BPM_MAX,
  BPM_MIN,
  type Cable,
  clamp,
  GAIN_MAX,
  type GraphNode,
  isSummingInput,
  MASTER_ID,
  MASTER_IN,
  MASTER_PLUGIN,
  NOTE_DEFAULT,
  NOTE_MIN_H,
  NOTE_MIN_W,
  NOTE_TEXT_MAX,
  type Note,
  newNode,
  type PortRef,
  type Project,
  samePort,
} from '../model/project';
import {
  type Camera,
  LEVEL_MAX,
  LEVEL_MIN,
  levelOf,
  type Pt,
  snapLevel,
  zoomAround,
} from './camera';
import {
  camera,
  deps,
  editingNote,
  type NodeStatus,
  nodeErrors,
  nodeStatus,
  project,
  type Selection,
  selection,
  uiSlots,
} from './store';

export type ConnectResult = { ok: true; id: string } | { ok: false; reason: RefuseReason };

// Id counters never go back, so a removed 'n3' is never confused with a new node.
let nextNode = 1;
let nextCable = 1;
let nextNote = 1;
let nextArm = 1;

const idNumber = (id: string, prefix: string): number => {
  const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
  return m?.[1] ? Number(m[1]) : 0;
};

function bumpCounters(p: Project): void {
  for (const n of p.nodes) nextNode = Math.max(nextNode, idNumber(n.id, 'n') + 1);
  for (const c of p.cables) nextCable = Math.max(nextCable, idNumber(c.id, 'c') + 1);
  for (const a of p.arms ?? []) nextArm = Math.max(nextArm, idNumber(a.id, 'a') + 1);
  for (const n of p.notes ?? []) nextNote = Math.max(nextNote, idNumber(n.id, 's') + 1);
}

function update(fn: (p: Project) => Project): void {
  project.value = fn(project.value);
}

function updateNode(id: string, fn: (n: GraphNode) => GraphNode): void {
  const p = project.value;
  const i = p.nodes.findIndex((n) => n.id === id);
  const node = p.nodes[i];
  if (!node) return;
  const next = fn(node);
  if (next === node) return;
  const nodes = p.nodes.slice();
  nodes[i] = next;
  project.value = { ...p, nodes };
}

/** Replaces the project (boot, or a test). Clears selection and node status; ids continue past the loaded ones. */
export function loadProject(p: Project): void {
  bumpCounters(p);
  // A saved view (dev-mode presets, 2026-11-26) moves the camera. `p.view` stays as the view the
  // file was opened with; a preset save writes the current camera over it.
  if (p.view) camera.value = { ...p.view };
  project.value = p;
  selection.value = {};
  editingNote.value = undefined;
  nodeStatus.value = { [MASTER_ID]: 'ready' };
  nodeErrors.value = {};
}

/**
 * Adds a node at (x, y) and selects it. For an instrument whose ports are known
 * (deps.manifests), it also cables the main audio out to Master, so it is heard at once.
 */
export function addNode(plugin: string, x: number, y: number): string {
  if (plugin === MASTER_PLUGIN) throw new Error('the project already has a Master');
  const id = `n${nextNode++}`;
  const cables: Cable[] = [];
  const manifest = deps.value.manifests.get(plugin);
  const out = manifest?.kind === 'instrument' ? mainAudioOut(manifest) : undefined;
  if (out) {
    cables.push({
      id: `c${nextCable++}`,
      from: { node: id, port: out.id },
      to: { node: MASTER_ID, port: MASTER_IN },
    });
  }
  update((p) => ({
    ...p,
    nodes: [...p.nodes, newNode(id, plugin, x, y)],
    cables: [...p.cables, ...cables],
  }));
  selection.value = { node: id };
  return id;
}

/** Called on every pointermove while dragging. The canvas keeps the box inside its bounds. */
export function moveNode(id: string, x: number, y: number): void {
  updateNode(id, (n) => (n.x === x && n.y === y ? n : { ...n, x, y }));
}

/** Removes a node and every cable touching it. Refuses Master. */
export function removeNode(id: string): void {
  if (id === MASTER_ID) return;
  const p = project.value;
  if (!p.nodes.some((n) => n.id === id)) return;
  const gone = new Set(
    p.cables.filter((c) => c.from.node === id || c.to.node === id).map((c) => c.id),
  );
  const arms = (p.arms ?? []).filter((a) => a.from.node !== id && a.to.node !== id);
  const goneArms = new Set((p.arms ?? []).filter((a) => !arms.includes(a)).map((a) => a.id));
  const { arms: _old, ...rest } = p;
  project.value = {
    ...rest,
    nodes: p.nodes.filter((n) => n.id !== id),
    cables: p.cables.filter((c) => !gone.has(c.id)),
    ...(arms.length > 0 ? { arms } : {}),
  };
  const sel = selection.value;
  if (sel.node === id || (sel.cable && gone.has(sel.cable)) || (sel.arm && goneArms.has(sel.arm))) {
    selection.value = {};
  }
  const { [id]: _s, ...status } = nodeStatus.value;
  nodeStatus.value = status;
  const { [id]: _e, ...errors } = nodeErrors.value;
  nodeErrors.value = errors;
}

/**
 * Validates with the router, then adds the cable. On a taken input (anything but Master `in`)
 * the old cable is replaced; the router crossfades the two.
 */
export function connect(from: PortRef, to: PortRef): ConnectResult {
  const { router, manifests } = deps.value;
  const p = project.value;
  const check = router.validate(p, manifests, from, to);
  if (!check.ok) return check;
  const id = `c${nextCable++}`;
  const kept = isSummingInput(to) ? p.cables : p.cables.filter((c) => !samePort(c.to, to));
  const removed = p.cables.length - kept.length;
  project.value = {
    ...p,
    cables: [...kept, { id, from: { ...from }, to: { ...to } }],
  };
  const selCable = selection.value.cable;
  if (removed > 0 && selCable && !kept.some((c) => c.id === selCable)) selection.value = {};
  return { ok: true, id };
}

export function disconnect(cableId: string): void {
  const p = project.value;
  if (!p.cables.some((c) => c.id === cableId)) return;
  project.value = { ...p, cables: p.cables.filter((c) => c.id !== cableId) };
  if (selection.value.cable === cableId) selection.value = {};
}

/** Strip volume, clamped to 0..1.5. */
export function setGain(id: string, v: number): void {
  if (!Number.isFinite(v)) return;
  const g = clamp(v, 0, GAIN_MAX);
  updateNode(id, (n) => (n.gain === g ? n : { ...n, gain: g }));
}

/** Strip pan, clamped to -1..1. */
export function setPan(id: string, v: number): void {
  if (!Number.isFinite(v)) return;
  const pan = clamp(v, -1, 1);
  updateNode(id, (n) => (n.pan === pan ? n : { ...n, pan }));
}

/**
 * Stores a normalized parameter value (0..1). The caller (node panel) also sends the
 * `automation` event to the instance; the engine re-sends stored values when a node loads.
 */
export function setParam(id: string, param: string, v: number): void {
  if (!Number.isFinite(v)) return;
  const value = clamp(v, 0, 1);
  updateNode(id, (n) =>
    n.params[param] === value ? n : { ...n, params: { ...n.params, [param]: value } },
  );
}

/** Clamped to 40..240. Stores it in the project and tells the scheduler. */
export function setBpm(bpm: number): void {
  if (!Number.isFinite(bpm)) return;
  const b = clamp(bpm, BPM_MIN, BPM_MAX);
  const p = project.value;
  if (p.transport.bpm !== b) project.value = { ...p, transport: { ...p.transport, bpm: b } };
  deps.value.scheduler.setBpm(b);
}

export function play(): Promise<void> {
  return deps.value.scheduler.play();
}

export function pause(): void {
  deps.value.scheduler.pause();
}

export function stop(): void {
  deps.value.scheduler.stop();
}

/**
 * Limits a camera move: gets the camera it would move to and the one it moves from.
 * The canvas passes one that keeps the pan limits (`clampCamera`); without it the camera is free.
 */
export type CameraFit = (next: Camera, prev: Camera) => Camera;

function moveCamera(next: Camera, fit: CameraFit | undefined): void {
  const prev = camera.value;
  const c = fit ? fit(next, prev) : next;
  if (c.x === prev.x && c.y === prev.y && c.z === prev.z) return;
  camera.value = c;
}

/** Moves the camera by (dx, dy) world px. Positive dx shows what is further right. */
export function panCamera(dx: number, dy: number, fit?: CameraFit): void {
  if (dx === 0 && dy === 0) return;
  const c = camera.value;
  moveCamera({ x: c.x + dx, y: c.y + dy, z: c.z }, fit);
}

/**
 * The zoom level before the snap. It moves freely during a gesture; the camera shows
 * `snapLevel(rawLevel)`, so a pinch through 100% sticks there for a moment, then passes it.
 */
let rawLevel = 0;

function zoomTo(at: Pt, level: number, fit: CameraFit | undefined): void {
  const c = camera.value;
  const z = 2 ** snapLevel(level);
  if (z === c.z) return;
  moveCamera(zoomAround(c, at, z), fit);
}

/**
 * Zooms by `dLevel` (log2 steps: +1 doubles) around screen point `at`, which stays put.
 * 25%–200%, with a snap to exactly 100% near it.
 */
export function zoomAt(at: Pt, dLevel: number, fit?: CameraFit): void {
  const c = camera.value;
  // The camera was set some other way (a test, a reset): start from what it shows.
  if (Math.abs(snapLevel(rawLevel) - levelOf(c.z)) > 1e-9) rawLevel = levelOf(c.z);
  rawLevel = clamp(rawLevel + dLevel, LEVEL_MIN, LEVEL_MAX);
  zoomTo(at, rawLevel, fit);
}

/** Back to 100%, around screen point `at`. */
export function resetZoom(at: Pt, fit?: CameraFit): void {
  rawLevel = 0;
  zoomTo(at, 0, fit);
}

/** Folds a plugin's own UI away (`true`) or shows it again. Saved with the project (v1.1.2). */
export function setUiHidden(id: string, hidden: boolean): void {
  updateNode(id, (n) => {
    if ((n.uiHidden === true) === hidden) return n;
    if (hidden) return { ...n, uiHidden: true };
    const { uiHidden: _gone, ...shown } = n;
    return shown;
  });
}

/** For the canvas: the element a node's plugin UI goes into, or null when the box is gone. */
export function setUiSlot(id: string, el: HTMLElement | null): void {
  const cur = uiSlots.value;
  if ((cur.get(id) ?? null) === el) return;
  const next = new Map(cur);
  if (el) next.set(id, el);
  else next.delete(id);
  uiSlots.value = next;
}

export function select(sel: Selection): void {
  selection.value = { ...sel };
}

/** For the engine: a node's load status, plus the error message when it is 'error'. */
export function setNodeStatus(id: string, status: NodeStatus, message?: string): void {
  nodeStatus.value = { ...nodeStatus.value, [id]: status };
  const { [id]: _old, ...rest } = nodeErrors.value;
  nodeErrors.value = status === 'error' ? { ...rest, [id]: message ?? 'unknown error' } : rest;
}

// v1.2 sticky notes. Design: docs/v1.2-redesign.md, "5. Sticky notes".

function updateNote(id: string, fn: (n: Note) => Note): void {
  const p = project.value;
  const notes = p.notes ?? [];
  const i = notes.findIndex((n) => n.id === id);
  const note = notes[i];
  if (!note) return;
  const next = fn(note);
  if (next === note) return;
  const all = notes.slice();
  all[i] = next;
  project.value = { ...p, notes: all };
}

/** Adds an empty note with its top-left at (x, y) and opens it for editing. Returns its id. */
export function addNote(x: number, y: number): string {
  const id = `s${nextNote++}`;
  const note: Note = { id, x, y, w: NOTE_DEFAULT.w, h: NOTE_DEFAULT.h, text: '' };
  update((p) => ({ ...p, notes: [...(p.notes ?? []), note] }));
  editingNote.value = id;
  return id;
}

export function moveNote(id: string, x: number, y: number): void {
  updateNote(id, (n) => (n.x === x && n.y === y ? n : { ...n, x, y }));
}

/** Sizes below the minimum are raised to it. */
export function resizeNote(id: string, w: number, h: number): void {
  const nw = Math.max(NOTE_MIN_W, Math.round(w));
  const nh = Math.max(NOTE_MIN_H, Math.round(h));
  updateNote(id, (n) => (n.w === nw && n.h === nh ? n : { ...n, w: nw, h: nh }));
}

export function setNoteText(id: string, text: string): void {
  const t = text.slice(0, NOTE_TEXT_MAX);
  updateNote(id, (n) => (n.text === t ? n : { ...n, text: t }));
}

/** Removes a note. The project loses its `notes` key when the last one goes. */
export function removeNote(id: string): void {
  const p = project.value;
  const notes = p.notes ?? [];
  if (!notes.some((n) => n.id === id)) return;
  const rest = notes.filter((n) => n.id !== id);
  if (rest.length > 0) project.value = { ...p, notes: rest };
  else {
    const { notes: _gone, ...without } = p;
    project.value = without;
  }
  if (editingNote.value === id) editingNote.value = undefined;
}

/** Opens a note's text for editing, or closes the editor (`undefined`). View state only. */
export function editNote(id: string | undefined): void {
  editingNote.value = id;
}

// v1.2 ARM links. Design: docs/v1.2-redesign.md, "7. ARM connections".

const validEnd = (e: ArmEnd): boolean =>
  Number.isInteger(e.index) && e.index >= 1 && e.index <= ARM_SLOTS;

function setArms(p: Project, arms: ArmLink[]): Project {
  const { arms: _old, ...rest } = p;
  return arms.length > 0 ? { ...rest, arms } : rest;
}

/**
 * Draws an ARM link from an ARM OUT connector to an ARM IN connector and selects it, which opens its
 * connection window. A link already on that ARM IN connector is replaced. `source` is filled in when
 * the out node has only one choice. Returns the id, or undefined for a link onto its own node.
 */
export function connectArm(from: ArmEnd, to: ArmEnd, source?: string): string | undefined {
  if (from.node === to.node || !validEnd(from) || !validEnd(to)) return undefined;
  const p = project.value;
  if (!p.nodes.some((n) => n.id === from.node) || !p.nodes.some((n) => n.id === to.node)) {
    return undefined;
  }
  const id = `a${nextArm++}`;
  const link: ArmLink = {
    id,
    from: { ...from },
    to: { ...to },
    ...(source !== undefined ? { source } : {}),
    min: 0,
    max: 100,
  };
  const rest = (p.arms ?? []).filter((a) => !(a.to.node === to.node && a.to.index === to.index));
  project.value = setArms(p, [...rest, link]);
  selection.value = { arm: id };
  return id;
}

export interface ArmPatch {
  source?: string | null;
  target?: string | null;
  min?: number;
  max?: number;
}

/** Changes a link's Out, In, Min or Max. `null` clears Out or In, which makes the link invalid. */
export function setArm(id: string, patch: ArmPatch): void {
  const p = project.value;
  const arms = p.arms ?? [];
  const i = arms.findIndex((a) => a.id === id);
  const a = arms[i];
  if (!a) return;
  const next: ArmLink = { ...a };
  for (const k of ['source', 'target'] as const) {
    const v = patch[k];
    if (v === null) delete next[k];
    else if (v !== undefined) next[k] = v;
  }
  if (patch.min !== undefined) next.min = clamp(Math.round(patch.min), 0, 100);
  if (patch.max !== undefined) next.max = clamp(Math.round(patch.max), 0, 100);
  if (
    next.source === a.source &&
    next.target === a.target &&
    next.min === a.min &&
    next.max === a.max
  ) {
    return;
  }
  const all = arms.slice();
  all[i] = next;
  project.value = { ...p, arms: all };
}

export function removeArm(id: string): void {
  const p = project.value;
  const arms = p.arms ?? [];
  if (!arms.some((a) => a.id === id)) return;
  project.value = setArms(
    p,
    arms.filter((a) => a.id !== id),
  );
  if (selection.value.arm === id) selection.value = {};
}

/** Turns a plugin on (`true`, the default) or off. Off = `bypass: true`. Master can't be turned off. */
export function setEnabled(id: string, on: boolean): void {
  if (id === MASTER_ID) return;
  updateNode(id, (n) => (n.bypass === !on ? n : { ...n, bypass: !on }));
}
