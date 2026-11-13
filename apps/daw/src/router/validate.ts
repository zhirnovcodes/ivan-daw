// Pure cable rules. Tech design: "Ports and cables". No audio objects here.

import type { PortInfo } from 'ivandaw-core';
import type { ValidateResult } from '../contracts/router';
import { type ManifestMap, mainAudioOut } from '../model/catalog';
import { parseControlPort } from '../model/control';
import {
  isSummingInput,
  MASTER_PLUGIN,
  type PortRef,
  type Project,
  samePort,
} from '../model/project';

/** A host-made control input (v1.1): a modulation port with direction 'in'. Plugins never declare these. */
export interface ControlInPort {
  id: string;
  label: string;
  kind: 'modulation';
  direction: 'in';
}

/** A port as the router sees it: a manifest port, or a host-made control input. */
export type HostPort = PortInfo | ControlInPort;

/**
 * The port a PortRef points at, via its node's plugin manifest.
 * `ctl:gain` / `ctl:pan` exist on Master and on nodes with a main audio out;
 * `ctl:param:<id>` exists on every plugin node (which ids are automatable is the picker's job,
 * and a plugin ignores unknown ids).
 */
export function findPort(p: Project, manifests: ManifestMap, ref: PortRef): HostPort | undefined {
  const node = p.nodes.find((n) => n.id === ref.node);
  if (!node) return undefined;
  const manifest = manifests.get(node.plugin);
  const ctl = parseControlPort(ref.port);
  if (ctl) {
    if (!manifest) return undefined;
    const isMaster = node.plugin === MASTER_PLUGIN;
    if (ctl.kind === 'param') {
      if (isMaster) return undefined;
    } else if (!isMaster && !mainAudioOut(manifest)) {
      return undefined;
    }
    return { id: ref.port, label: ref.port, kind: 'modulation', direction: 'in' };
  }
  return manifest?.ports.find((port) => port.id === ref.port);
}

/** True if a cable from `out` to `inp` may carry anything: same kind, and shared event types for events. */
export function compatible(out: HostPort, inp: HostPort): boolean {
  if (out.kind !== inp.kind) return false;
  if (out.kind === 'events' && inp.kind === 'events') {
    return out.accepts.some((t) => inp.accepts.includes(t));
  }
  return true;
}

/** True if `to` can reach `from` through `edges` (node id → node ids it feeds). */
function reaches(edges: Map<string, string[]>, start: string, goal: string): boolean {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const n = stack.pop() as string;
    if (n === goal) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const next of edges.get(n) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Checks one proposed cable, rules in order: self, direction, kind, duplicate, cycle.
 * A missing node or port is refused with 'kind'.
 * The cycle check ignores the cable that this one would replace on a taken input,
 * and covers audio, events and control cables together.
 */
export function validate(
  p: Project,
  manifests: ManifestMap,
  from: PortRef,
  to: PortRef,
): ValidateResult {
  if (from.node === to.node) return { ok: false, reason: 'self' };
  const out = findPort(p, manifests, from);
  const inp = findPort(p, manifests, to);
  if (!out || !inp) return { ok: false, reason: 'kind' };
  if (out.direction !== 'out' || inp.direction !== 'in') return { ok: false, reason: 'direction' };
  if (!compatible(out, inp)) return { ok: false, reason: 'kind' };
  if (p.cables.some((c) => samePort(c.from, from) && samePort(c.to, to))) {
    return { ok: false, reason: 'duplicate' };
  }
  const replaces = !isSummingInput(to);
  const edges = new Map<string, string[]>();
  for (const c of p.cables) {
    if (replaces && samePort(c.to, to)) continue;
    const list = edges.get(c.from.node) ?? [];
    list.push(c.to.node);
    edges.set(c.from.node, list);
  }
  if (reaches(edges, to.node, from.node)) return { ok: false, reason: 'cycle' };
  return { ok: true };
}
