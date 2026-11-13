// What the canvas needs from outside the store (v1.1): a node's live parameters, for the control-input
// picker and cable labels. The app shell hands it over with setCanvasServices.

import type { ParameterInfo } from 'ivandaw-core';

export interface CanvasServices {
  /** The loaded plugin's parameters, or [] while it loads (and for Master). */
  parameters(nodeId: string): ParameterInfo[];
}

let current: CanvasServices = { parameters: () => [] };

export function setCanvasServices(next: Partial<CanvasServices>): void {
  current = { ...current, ...next };
}

export const canvasServices = (): CanvasServices => current;
