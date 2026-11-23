// What an ARM link can drive on a node: the In list of the v1.2 connection window.
// Port ids are ctl:gain / ctl:pan / ctl:param:<id> (v1.1 control inputs).

import type { ParameterInfo } from 'ivandaw-core';
import { CTL_GAIN, CTL_PAN, paramPort } from '../model/control';

export interface ControlChoice {
  port: string;
  label: string;
  group?: string;
}

/**
 * What a control cable can drive on a node, in picker order: Volume and Pan first (nodes with a
 * strip, and Master), then automatable parameters grouped by `group`, in plugin order within a group.
 */
export function controlChoices(
  hasStrip: boolean,
  params: readonly ParameterInfo[],
): ControlChoice[] {
  const out: ControlChoice[] = [];
  if (hasStrip) {
    out.push({ port: CTL_GAIN, label: 'Volume' }, { port: CTL_PAN, label: 'Pan' });
  }
  const groups: string[] = [];
  const byGroup = new Map<string, ParameterInfo[]>();
  for (const p of params) {
    if (!p.automatable) continue;
    const g = p.group ?? '';
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      groups.push(g);
    }
    byGroup.get(g)?.push(p);
  }
  for (const g of groups) {
    for (const p of byGroup.get(g) ?? []) {
      out.push({ port: paramPort(p.id), label: p.label, ...(g ? { group: g } : {}) });
    }
  }
  return out;
}
