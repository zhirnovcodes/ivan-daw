// Pure helpers for control cables on the canvas (v1.1). Design: "4. Control inputs" → Canvas.
// Each node shows one dotted `ctl` input; a control cable dropped on it picks which control input
// (Volume, Pan, or a parameter) it drives. Its real port id is ctl:gain / ctl:pan / ctl:param:<id>.

import type { ParameterInfo } from 'ivandaw-core';
import { CTL_GAIN, CTL_PAN, isControlPort, paramPort } from '../model/control';

/** The one canvas spot for all of a node's control inputs. */
export const CTL_SPOT = 'ctl';

/** The canvas port a cable end is drawn at: every ctl:* input shares the ctl spot. */
export const spotOf = (port: string): string => (isControlPort(port) ? CTL_SPOT : port);

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
