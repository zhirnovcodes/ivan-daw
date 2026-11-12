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
}

export interface GraphNode {
  id: string; // 'n1', 'n2'…; Master is always 'master'
  plugin: string; // manifest id, or 'builtin.master'
  x: number; // canvas px, top-left of the node box
  y: number;
  gain: number; // strip volume 0..1.5, default 1
  pan: number; // strip pan -1..1, default 0
  bypass: boolean; // v1: always false (no UI yet)
  params: Record<string, number>; // normalized 0..1, keyed by ParameterInfo.id; only values the user changed
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
  const cables = raw.cables.map((c, i): Cable => {
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

  return { format: 'ivandaw.project', version: 1, transport, nodes, cables };
}

/** Fetches and parses a project file, e.g. `/projects/demo.json`. */
export async function fetchProject(url: string): Promise<Project> {
  const res = await fetch(url);
  if (!res.ok) throw new ProjectError(`${url}: HTTP ${res.status}`);
  return parseProject(await res.json());
}
