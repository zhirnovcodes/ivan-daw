// v1.1 control inputs. Every node gets host-made control inputs; plugins do not declare them.
// Design: docs/v1.1-tech-design.md, "4. Control inputs".
//
//   ctl:gain          the node's strip volume   control 0..1 → 0..1.5
//   ctl:pan           the node's strip pan      control 0..1 → −1..1
//   ctl:param:<id>    plugin parameter <id>     control 0..1 → normalized 0..1, unchanged

import { clamp, GAIN_MAX } from './project';

export const CTL_GAIN = 'ctl:gain';
export const CTL_PAN = 'ctl:pan';
export const CTL_PARAM = 'ctl:param:';

export type ControlTarget = { kind: 'gain' } | { kind: 'pan' } | { kind: 'param'; id: string };

/** True for any host-made control input id. */
export const isControlPort = (port: string): boolean => port.startsWith('ctl:');

/** What a control input drives, or undefined for any other port id. */
export function parseControlPort(port: string): ControlTarget | undefined {
  if (port === CTL_GAIN) return { kind: 'gain' };
  if (port === CTL_PAN) return { kind: 'pan' };
  if (port.startsWith(CTL_PARAM) && port.length > CTL_PARAM.length) {
    return { kind: 'param', id: port.slice(CTL_PARAM.length) };
  }
  return undefined;
}

export const paramPort = (id: string): string => `${CTL_PARAM}${id}`;

/** A control value (0..1, clamped) as strip volume. */
export const controlToGain = (v: number): number => clamp(v, 0, 1) * GAIN_MAX;
/** A control value (0..1, clamped) as strip pan. */
export const controlToPan = (v: number): number => clamp(v, 0, 1) * 2 - 1;

/** Short label for a control input, for cable labels and the picker. */
export function controlLabel(
  port: string,
  paramLabel?: (id: string) => string | undefined,
): string {
  const t = parseControlPort(port);
  if (!t) return port;
  if (t.kind === 'gain') return 'Volume';
  if (t.kind === 'pan') return 'Pan';
  return paramLabel?.(t.id) ?? t.id;
}
