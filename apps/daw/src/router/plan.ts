// Pure wiring plan and diff. Tech design: "Router" → "Plan".

import type { Wiring, WiringEdge } from '../contracts/router';
import type { ManifestMap } from '../model/catalog';
import type { Project } from '../model/project';
import { compatible, findPort } from './validate';

export const EMPTY_WIRING: Wiring = { audio: [], events: [], control: [] };

/**
 * Exactly the project's cables whose two nodes are `ready`, split by port kind.
 * A cable whose ports are unknown or no longer compatible is skipped. No implicit links.
 */
export function plan(
  p: Project,
  manifests: ManifestMap,
  status: Readonly<Record<string, string>>,
): Wiring {
  const audio: WiringEdge[] = [];
  const events: WiringEdge[] = [];
  const control: WiringEdge[] = [];
  for (const c of p.cables) {
    if (status[c.from.node] !== 'ready' || status[c.to.node] !== 'ready') continue;
    const out = findPort(p, manifests, c.from);
    const inp = findPort(p, manifests, c.to);
    if (
      !out ||
      !inp ||
      out.direction !== 'out' ||
      inp.direction !== 'in' ||
      !compatible(out, inp)
    ) {
      continue;
    }
    const edge = { id: c.id, from: { ...c.from }, to: { ...c.to } };
    if (out.kind === 'audio') audio.push(edge);
    else if (out.kind === 'events') events.push(edge);
    else control.push(edge);
  }
  return { audio, events, control };
}

export interface WiringDiff {
  connect: WiringEdge[];
  disconnect: WiringEdge[];
}

const key = (e: WiringEdge): string =>
  `${e.id}|${e.from.node}:${e.from.port}>${e.to.node}:${e.to.port}`;

/** What to connect and disconnect to go from `prev` to `next`, per kind. Edges match by id and ends. */
export function diffWiring(
  prev: Wiring,
  next: Wiring,
): { audio: WiringDiff; events: WiringDiff; control: WiringDiff } {
  const diff = (a: WiringEdge[], b: WiringEdge[]): WiringDiff => {
    const before = new Set(a.map(key));
    const after = new Set(b.map(key));
    return {
      connect: b.filter((e) => !before.has(key(e))),
      disconnect: a.filter((e) => !after.has(key(e))),
    };
  };
  return {
    audio: diff(prev.audio, next.audio),
    events: diff(prev.events, next.events),
    control: diff(prev.control, next.control),
  };
}

/** The lookup table `fromNode:fromPort → [{ node, port }]` for one edge list (events or control). */
export function eventTable(
  w: Wiring,
  kind: 'events' | 'control' = 'events',
): Map<string, { node: string; port: string }[]> {
  const table = new Map<string, { node: string; port: string }[]>();
  for (const e of w[kind]) {
    const k = `${e.from.node}:${e.from.port}`;
    const list = table.get(k) ?? [];
    list.push({ ...e.to });
    table.set(k, list);
  }
  return table;
}
