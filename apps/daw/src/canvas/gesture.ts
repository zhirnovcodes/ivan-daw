// The canvas gesture state machine, with no DOM. The view turns pointer events into
// GestureEvents; this returns the next state and the store actions to run.
// Tech design: "Canvas" → "Interactions".

import type { ArmEnd, PortRef } from '../model/project';
import { MASTER_ID } from '../model/project';
import { clampToWorld, type Pt, type Size } from './geometry';

export type Selection = { node?: string; cable?: string; arm?: string };

/** What the pointer went down on. */
export type Target =
  | { kind: 'header'; node: string; nodePos: Pt }
  | { kind: 'body'; node: string }
  | { kind: 'outPort'; ref: PortRef }
  | { kind: 'cable'; id: string }
  | { kind: 'cableX'; id: string }
  /** v1.2: an ARM OUT connector (starts an ARM link) and an ARM cable. */
  | { kind: 'armOut'; end: ArmEnd }
  | { kind: 'armCable'; id: string }
  | { kind: 'empty' };

export type GestureState =
  | { mode: 'idle' }
  | { mode: 'drag'; node: string; dx: number; dy: number }
  | { mode: 'connect'; from: PortRef; at: Pt }
  | { mode: 'armConnect'; from: ArmEnd; at: Pt };

export type GestureEvent =
  | { type: 'down'; target: Target; at: Pt }
  | { type: 'move'; at: Pt }
  /** `drop` is the input port under the pointer on release, if any. */
  | { type: 'up'; at: Pt; drop?: PortRef; dropArm?: ArmEnd }
  | { type: 'cancel' };

export type Effect =
  | { type: 'moveNode'; id: string; x: number; y: number }
  | { type: 'select'; sel: Selection }
  | { type: 'connect'; from: PortRef; to: PortRef }
  | { type: 'disconnect'; id: string }
  | { type: 'removeNode'; id: string }
  | { type: 'removeArm'; id: string }
  | { type: 'connectArm'; from: ArmEnd; to: ArmEnd };

export interface GestureCtx {
  sizeOf(node: string): Size;
}

export interface Step {
  state: GestureState;
  effects: Effect[];
}

export const IDLE: GestureState = { mode: 'idle' };

export function reduce(state: GestureState, ev: GestureEvent, ctx: GestureCtx): Step {
  switch (ev.type) {
    case 'down': {
      const t = ev.target;
      switch (t.kind) {
        case 'header':
          return {
            state: {
              mode: 'drag',
              node: t.node,
              dx: ev.at.x - t.nodePos.x,
              dy: ev.at.y - t.nodePos.y,
            },
            effects: [{ type: 'select', sel: { node: t.node } }],
          };
        case 'body':
          return { state: IDLE, effects: [{ type: 'select', sel: { node: t.node } }] };
        case 'outPort':
          return { state: { mode: 'connect', from: t.ref, at: ev.at }, effects: [] };
        case 'cable':
          return { state: IDLE, effects: [{ type: 'select', sel: { cable: t.id } }] };
        case 'armOut':
          return { state: { mode: 'armConnect', from: t.end, at: ev.at }, effects: [] };
        case 'armCable':
          return { state: IDLE, effects: [{ type: 'select', sel: { arm: t.id } }] };
        case 'cableX':
          return {
            state: IDLE,
            effects: [
              { type: 'disconnect', id: t.id },
              { type: 'select', sel: {} },
            ],
          };
        case 'empty':
          return { state: IDLE, effects: [{ type: 'select', sel: {} }] };
      }
      return { state, effects: [] };
    }
    case 'move': {
      if (state.mode === 'drag') {
        void ctx;
        const p = clampToWorld({ x: ev.at.x - state.dx, y: ev.at.y - state.dy });
        return { state, effects: [{ type: 'moveNode', id: state.node, x: p.x, y: p.y }] };
      }
      if (state.mode === 'connect' || state.mode === 'armConnect') {
        return { state: { ...state, at: ev.at }, effects: [] };
      }
      return { state, effects: [] };
    }
    case 'up': {
      if (state.mode === 'connect' && ev.drop) {
        return { state: IDLE, effects: [{ type: 'connect', from: state.from, to: ev.drop }] };
      }
      if (state.mode === 'armConnect' && ev.dropArm && ev.dropArm.node !== state.from.node) {
        return {
          state: IDLE,
          effects: [{ type: 'connectArm', from: state.from, to: ev.dropArm }],
        };
      }
      return { state: IDLE, effects: [] };
    }
    case 'cancel':
      return { state: IDLE, effects: [] };
  }
}

/** Delete / Backspace / Escape. A cable wins over a node; Master is never removed. */
export function keyEffects(key: string, sel: Selection): Effect[] {
  if (key === 'Escape') return [{ type: 'select', sel: {} }];
  if (key !== 'Delete' && key !== 'Backspace') return [];
  if (sel.cable) return [{ type: 'disconnect', id: sel.cable }];
  if (sel.arm) return [{ type: 'removeArm', id: sel.arm }];
  if (sel.node && sel.node !== MASTER_ID) return [{ type: 'removeNode', id: sel.node }];
  return [];
}
