// Contract C4: store actions, the only writers of the store. Tech design: "Project model and store".
// Each project change replaces the whole Project object; the previous one is never mutated.

import type { RefuseReason } from '../contracts/router';
import { mainAudioOut } from '../model/catalog';
import {
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
  newNode,
  type PortRef,
  type Project,
  samePort,
} from '../model/project';
import {
  camera,
  deps,
  type NodeStatus,
  nodeErrors,
  nodeStatus,
  project,
  type Selection,
  selection,
} from './store';

export type ConnectResult = { ok: true; id: string } | { ok: false; reason: RefuseReason };

// Id counters never go back, so a removed 'n3' is never confused with a new node.
let nextNode = 1;
let nextCable = 1;

const idNumber = (id: string, prefix: string): number => {
  const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
  return m?.[1] ? Number(m[1]) : 0;
};

function bumpCounters(p: Project): void {
  for (const n of p.nodes) nextNode = Math.max(nextNode, idNumber(n.id, 'n') + 1);
  for (const c of p.cables) nextCable = Math.max(nextCable, idNumber(c.id, 'c') + 1);
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
  project.value = p;
  selection.value = {};
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
  project.value = {
    ...p,
    nodes: p.nodes.filter((n) => n.id !== id),
    cables: p.cables.filter((c) => !gone.has(c.id)),
  };
  const sel = selection.value;
  if (sel.node === id || (sel.cable && gone.has(sel.cable))) selection.value = {};
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

/** Moves the camera by (dx, dy) world px. Positive dx shows what is further right. */
export function panCamera(dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  const c = camera.value;
  camera.value = { x: c.x + dx, y: c.y + dy };
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
