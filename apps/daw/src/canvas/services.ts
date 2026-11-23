// What the canvas needs from outside the store: a node's live parameters (ARM In choices) and its
// instance (the in-window parameter strip). The app shell hands it over with setCanvasServices.

import type { ParameterInfo, PluginInstance } from 'ivandaw-core';

export interface CanvasServices {
  /** The loaded plugin's parameters, or [] while it loads (and for Master). */
  parameters(nodeId: string): ParameterInfo[];
  /** The loaded plugin instance, or undefined while it loads (and for Master). */
  instance(nodeId: string): PluginInstance | undefined;
}

let current: CanvasServices = { parameters: () => [], instance: () => undefined };

export function setCanvasServices(next: Partial<CanvasServices>): void {
  current = { ...current, ...next };
}

export const canvasServices = (): CanvasServices => current;
