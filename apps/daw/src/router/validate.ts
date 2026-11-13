// Pure cable rules. Tech design: "Ports and cables". No audio objects here.

import type { PortInfo } from 'ivandaw-core';
import type { ValidateResult } from '../contracts/router';
import type { ManifestMap } from '../model/catalog';
import { isSummingInput, type PortRef, type Project, samePort } from '../model/project';

/** The port a PortRef points at, via its node's plugin manifest. */
export function findPort(p: Project, manifests: ManifestMap, ref: PortRef): PortInfo | undefined {
  const node = p.nodes.find((n) => n.id === ref.node);
  if (!node) return undefined;
  return manifests.get(node.plugin)?.ports.find((port) => port.id === ref.port);
}

/** True if a cable from `out` to `inp` may carry anything: same kind, and shared event types for events. */
export function compatible(out: PortInfo, inp: PortInfo): boolean {
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
 * and covers audio and events cables together.
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
