// v1.2: names shown for nodes in ARM connection labels. Pure. Design: "7. ARM connections" → Identity.

import type { ArmLink } from '../model/project';

/**
 * Node id → display name. Plugins that appear more than once get a number from the second one on,
 * in project order: `Sine synth`, `Sine synth 2`.
 */
export function displayNames(
  nodes: readonly { id: string; plugin: string }[],
  nameOf: (plugin: string) => string,
): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const n of nodes) {
    const base = nameOf(n.plugin);
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    out.set(n.id, k === 1 ? base : `${base} ${k}`);
  }
  return out;
}

/** `"LFO".1 - "Sine synth".3` */
export function armName(
  a: Pick<ArmLink, 'from' | 'to'>,
  names: ReadonlyMap<string, string>,
): string {
  const n = (id: string): string => names.get(id) ?? id;
  return `"${n(a.from.node)}".${a.from.index} - "${n(a.to.node)}".${a.to.index}`;
}
