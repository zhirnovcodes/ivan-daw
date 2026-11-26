// Contract C3: the project document. Tech design: "Project model and store".
// A project is plain JSON. The store holds it in a signal and only store actions replace it.

export const MASTER_ID = 'master';
export const MASTER_PLUGIN = 'builtin.master';
/** Master's only port: audio in, 2 ch. The one input that sums any number of cables. */
export const MASTER_IN = 'in';

export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const GAIN_MAX = 1.5;

export interface Project {
  format: 'ivandaw.project';
  version: 1;
  transport: { bpm: number; numerator: number; denominator: number }; // v1: 120, 4, 4
  nodes: GraphNode[];
  cables: Cable[];
  /** v1.2 sticky notes, drawn above everything. Missing = none. */
  notes?: Note[];
  /** v1.2 ARM links: numbered control connectors. Missing = none. */
  arms?: ArmLink[];
  /**
   * 2026-11-26: where the view was when a dev-mode preset was saved: the world point at the canvas's
   * top-left (`x`, `y`) and the zoom (`z`, 1 = 100%). loadProject moves the camera there; mobile mode
   * then skips its fit-all. Missing = the view stays put. Not kept up to date while the camera moves.
   */
  view?: ProjectView;
}

export interface ProjectView {
  x: number;
  y: number;
  z: number;
}

/** The zoom range the canvas allows (store/camera.ts LEVEL_MIN / LEVEL_MAX: 25%–200%). */
const VIEW_Z_MIN = 0.25;
const VIEW_Z_MAX = 2;

/** ARM connectors per side, numbered 1..ARM_SLOTS. */
export const ARM_SLOTS = 16;

/** One end of an ARM link: a node and a connector number 1..16. */
export interface ArmEnd {
  node: string;
  index: number;
}

/**
 * v1.2: an ARM link from an ARM OUT connector to an ARM IN connector.
 * Valid (carries values) only once both `source` and `target` are set. Design: "7. ARM connections".
 */
export interface ArmLink {
  id: string; // 'a1', 'a2'…
  from: ArmEnd;
  to: ArmEnd;
  /** The out node's modulation port id. */
  source?: string;
  /** The in node's control input: `ctl:gain`, `ctl:pan` or `ctl:param:<id>`. */
  target?: string;
  /** 0..100 % of the target's range. Min > Max flips the direction. */
  min: number;
  max: number;
}

/** True when the link carries values: both ends picked. */
export const armValid = (a: ArmLink): a is ArmLink & { source: string; target: string } =>
  a.source !== undefined && a.target !== undefined;

/** A control value 0..1 through a link's Min / Max (percent), to 0..1. */
export const armMap = (a: Pick<ArmLink, 'min' | 'max'>, v: number): number =>
  clamp((a.min + (a.max - a.min) * clamp(v, 0, 1)) / 100, 0, 1);

/** v1.2: a sticky note. Text uses only `**bold**` and `<https://…>` links (see `noteText.ts`). */
export interface Note {
  id: string; // 's1', 's2'…
  x: number; // world px, top-left of the note window
  y: number;
  w: number; // world px, the whole window
  h: number;
  text: string;
}

export const NOTE_MIN_W = 120;
export const NOTE_MIN_H = 80;
export const NOTE_DEFAULT = { w: 300, h: 180 } as const;
/** Longest note text kept, in characters. */
export const NOTE_TEXT_MAX = 20000;

export interface GraphNode {
  id: string; // 'n1', 'n2'…; Master is always 'master'
  plugin: string; // manifest id, or 'builtin.master'
  x: number; // canvas px, top-left of the node box
  y: number;
  gain: number; // strip volume 0..1.5, default 1
  pan: number; // strip pan -1..1, default 0
  bypass: boolean; // v1: always false (no UI yet)
  params: Record<string, number>; // normalized 0..1, keyed by ParameterInfo.id; only values the user changed
  uiHidden?: boolean; // v1.1.2: the plugin's own UI is folded away (`-` on the box); missing = shown
  state?: SavedState; // 2026-11-23: the plugin's own state (getState), written by dev-mode Save
}

/**
 * A plugin's `PluginState` as stored in a project file. Binary files can't go in JSON, so each
 * `files` entry is a path (relative to the app's base URL) the Blob was stored at.
 */
export interface SavedState {
  pluginId: string;
  pluginVersion: string;
  data: unknown;
  files?: Record<string, string>;
}

function readState(v: unknown, where: string): SavedState {
  if (!isObject(v) || typeof v.pluginId !== 'string' || typeof v.pluginVersion !== 'string') {
    throw new ProjectError(`${where}: expected { pluginId, pluginVersion, data }`);
  }
  const out: SavedState = {
    pluginId: v.pluginId,
    pluginVersion: v.pluginVersion,
    data: v.data ?? null,
  };
  if (v.files !== undefined) {
    if (!isObject(v.files)) throw new ProjectError(`${where}.files: expected an object`);
    const files: Record<string, string> = {};
    for (const [k, f] of Object.entries(v.files)) {
      if (typeof f !== 'string') throw new ProjectError(`${where}.files.${k}: expected a path`);
      files[k] = f;
    }
    out.files = files;
  }
  return out;
}

export interface PortRef {
  node: string;
  port: string;
}

export interface Cable {
  id: string; // 'c1', 'c2'…
  from: PortRef;
  to: PortRef;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export function newNode(id: string, plugin: string, x: number, y: number): GraphNode {
  return { id, plugin, x, y, gain: 1, pan: 0, bypass: false, params: {} };
}

/** An empty project holding only Master. */
export function emptyProject(): Project {
  return {
    format: 'ivandaw.project',
    version: 1,
    transport: { bpm: 120, numerator: 4, denominator: 4 },
    nodes: [newNode(MASTER_ID, MASTER_PLUGIN, 640, 160)],
    cables: [],
  };
}

export const samePort = (a: PortRef, b: PortRef): boolean => a.node === b.node && a.port === b.port;

/** True for the one input that takes any number of cables. */
export const isSummingInput = (p: PortRef): boolean => p.node === MASTER_ID && p.port === MASTER_IN;

class ProjectError extends Error {
  override name = 'ProjectError';
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A saved view, or undefined when it's missing or broken (view state: never worth failing a load). */
function readView(v: unknown): ProjectView | undefined {
  if (!isObject(v) || !isNum(v.x) || !isNum(v.y) || !isNum(v.z) || v.z <= 0) return undefined;
  return { x: v.x, y: v.y, z: clamp(v.z, VIEW_Z_MIN, VIEW_Z_MAX) };
}

function readPortRef(v: unknown, where: string): PortRef {
  if (!isObject(v) || typeof v.node !== 'string' || typeof v.port !== 'string') {
    throw new ProjectError(`${where}: expected { node, port }`);
  }
  return { node: v.node, port: v.port };
}

function readNode(v: unknown, i: number): GraphNode {
  const where = `nodes[${i}]`;
  if (!isObject(v)) throw new ProjectError(`${where}: expected an object`);
  if (typeof v.id !== 'string' || v.id === '')
    throw new ProjectError(`${where}.id: expected a string`);
  if (typeof v.plugin !== 'string') throw new ProjectError(`${where}.plugin: expected a string`);
  if (!isNum(v.x) || !isNum(v.y)) throw new ProjectError(`${where}: expected numeric x and y`);
  const params: Record<string, number> = {};
  if (v.params !== undefined) {
    if (!isObject(v.params)) throw new ProjectError(`${where}.params: expected an object`);
    for (const [k, p] of Object.entries(v.params)) {
      if (!isNum(p)) throw new ProjectError(`${where}.params.${k}: expected a number`);
      params[k] = clamp(p, 0, 1);
    }
  }
  return {
    id: v.id,
    plugin: v.plugin,
    x: v.x,
    y: v.y,
    gain: isNum(v.gain) ? clamp(v.gain, 0, GAIN_MAX) : 1,
    pan: isNum(v.pan) ? clamp(v.pan, -1, 1) : 0,
    bypass: v.bypass === true,
    params,
    ...(v.uiHidden === true ? { uiHidden: true } : {}),
    ...(v.state !== undefined && v.state !== null
      ? { state: readState(v.state, `${where}.state`) }
      : {}),
  };
}

function readArmEnd(v: unknown, where: string): ArmEnd {
  if (!isObject(v) || typeof v.node !== 'string' || !isNum(v.index)) {
    throw new ProjectError(`${where}: expected { node, index }`);
  }
  const index = Math.round(v.index);
  if (index < 1 || index > ARM_SLOTS)
    throw new ProjectError(`${where}.index: expected 1..${ARM_SLOTS}`);
  return { node: v.node, index };
}

function readArm(v: unknown, i: number): ArmLink {
  const where = `arms[${i}]`;
  if (!isObject(v) || typeof v.id !== 'string' || v.id === '') {
    throw new ProjectError(`${where}: expected { id, from, to }`);
  }
  const from = readArmEnd(v.from, `${where}.from`);
  const to = readArmEnd(v.to, `${where}.to`);
  return {
    id: v.id,
    from,
    to,
    ...(typeof v.source === 'string' && v.source !== '' ? { source: v.source } : {}),
    ...(typeof v.target === 'string' && v.target.startsWith('ctl:') ? { target: v.target } : {}),
    min: isNum(v.min) ? clamp(v.min, 0, 100) : 0,
    max: isNum(v.max) ? clamp(v.max, 0, 100) : 100,
  };
}

function readNote(v: unknown, i: number): Note {
  const where = `notes[${i}]`;
  if (!isObject(v)) throw new ProjectError(`${where}: expected an object`);
  if (typeof v.id !== 'string' || v.id === '')
    throw new ProjectError(`${where}.id: expected a string`);
  if (!isNum(v.x) || !isNum(v.y)) throw new ProjectError(`${where}: expected numeric x and y`);
  return {
    id: v.id,
    x: v.x,
    y: v.y,
    w: isNum(v.w) ? Math.max(NOTE_MIN_W, v.w) : NOTE_DEFAULT.w,
    h: isNum(v.h) ? Math.max(NOTE_MIN_H, v.h) : NOTE_DEFAULT.h,
    text: typeof v.text === 'string' ? v.text.slice(0, NOTE_TEXT_MAX) : '',
  };
}

/**
 * Reads untrusted JSON into a Project. Fills defaults (gain 1, pan 0, bypass false, params {}),
 * clamps values into range, and adds Master if it is missing. Throws on anything else that is wrong:
 * wrong format or version, duplicate ids, a cable to an unknown node, or a second Master.
 */
export function parseProject(raw: unknown): Project {
  if (!isObject(raw)) throw new ProjectError('project: expected an object');
  if (raw.format !== 'ivandaw.project')
    throw new ProjectError('project.format: expected "ivandaw.project"');
  if (raw.version !== 1) throw new ProjectError('project.version: expected 1');
  const t = raw.transport;
  if (!isObject(t) || !isNum(t.bpm)) throw new ProjectError('project.transport: expected { bpm }');
  const transport = {
    bpm: clamp(t.bpm, BPM_MIN, BPM_MAX),
    numerator: isNum(t.numerator) ? t.numerator : 4,
    denominator: isNum(t.denominator) ? t.denominator : 4,
  };
  if (!Array.isArray(raw.nodes)) throw new ProjectError('project.nodes: expected an array');
  if (!Array.isArray(raw.cables)) throw new ProjectError('project.cables: expected an array');

  const nodes = raw.nodes.map(readNode);
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) throw new ProjectError(`duplicate node id "${n.id}"`);
    ids.add(n.id);
    if ((n.id === MASTER_ID) !== (n.plugin === MASTER_PLUGIN)) {
      throw new ProjectError(`node "${n.id}": only "${MASTER_ID}" may use ${MASTER_PLUGIN}`);
    }
  }
  if (!ids.has(MASTER_ID)) {
    const master = emptyProject().nodes[0];
    if (master) nodes.push(master);
    ids.add(MASTER_ID);
  }

  const cableIds = new Set<string>();
  const all = raw.cables.map((c, i): Cable => {
    const where = `cables[${i}]`;
    if (!isObject(c) || typeof c.id !== 'string' || c.id === '') {
      throw new ProjectError(`${where}: expected { id, from, to }`);
    }
    if (cableIds.has(c.id)) throw new ProjectError(`duplicate cable id "${c.id}"`);
    cableIds.add(c.id);
    const from = readPortRef(c.from, `${where}.from`);
    const to = readPortRef(c.to, `${where}.to`);
    for (const end of [from, to]) {
      if (!ids.has(end.node)) throw new ProjectError(`${where}: unknown node "${end.node}"`);
    }
    return { id: c.id, from, to };
  });
  // v1.2: control cables (to `ctl:*`) are gone; ARM links replace them. Old ones are dropped.
  const cables = all.filter((c) => !c.to.port.startsWith('ctl:'));

  if (raw.arms !== undefined && !Array.isArray(raw.arms))
    throw new ProjectError('project.arms: expected an array');
  const armIds = new Set<string>();
  const armIns = new Set<string>();
  const arms: ArmLink[] = [];
  for (const [i, a] of (raw.arms ?? []).map(readArm).entries()) {
    if (armIds.has(a.id)) throw new ProjectError(`duplicate ARM link id "${a.id}"`);
    armIds.add(a.id);
    for (const end of [a.from, a.to]) {
      if (!ids.has(end.node)) throw new ProjectError(`arms[${i}]: unknown node "${end.node}"`);
    }
    // One link per ARM IN connector: a later one on the same connector is dropped.
    const inKey = `${a.to.node}:${a.to.index}`;
    if (armIns.has(inKey)) continue;
    armIns.add(inKey);
    arms.push(a);
  }

  if (raw.notes !== undefined && !Array.isArray(raw.notes))
    throw new ProjectError('project.notes: expected an array');
  const notes = (raw.notes ?? []).map(readNote);
  const view = readView(raw.view);
  const noteIds = new Set<string>();
  for (const n of notes) {
    if (noteIds.has(n.id)) throw new ProjectError(`duplicate note id "${n.id}"`);
    noteIds.add(n.id);
  }

  return {
    format: 'ivandaw.project',
    version: 1,
    transport,
    nodes,
    cables,
    ...(notes.length > 0 ? { notes } : {}),
    ...(arms.length > 0 ? { arms } : {}),
    ...(view ? { view } : {}),
  };
}

/** Fetches and parses a project file, e.g. `/projects/demo.json`. */
export async function fetchProject(url: string): Promise<Project> {
  const res = await fetch(url);
  if (!res.ok) throw new ProjectError(`${url}: HTTP ${res.status}`);
  return parseProject(await res.json());
}
