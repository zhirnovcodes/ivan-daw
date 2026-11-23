// v1.2: the generic parameter strip inside a plugin window, for plugins without their own UI
// (LFO, Control sliders, Note hold…). It replaces the v1.1 right-hand node panel.
// Design: docs/v1.2-redesign.md, "4. Plugin windows". One row per automatable parameter, PARAM_ROW high.

import { effect } from '@preact/signals-core';
import type { ParameterInfo, PluginInstance } from 'ivandaw-core';
import { paramPort } from '../model/control';
import { armValid } from '../model/project';
import { setParam } from '../store/actions';
import { project } from '../store/store';
import { h } from './dom';
import {
  currentNormalized,
  denormalize,
  normalize,
  stepNormalized,
  triggerPulse,
  valueLabel,
} from './params';
import { panelServices } from './services';

type Disposer = () => void;

/** The parameters the strip shows: all of them (ARM links can drive only the automatable ones). */
export const stripParams = (inst: PluginInstance | undefined): ParameterInfo[] =>
  inst?.parameters() ?? [];

/** Sends a normalized value to the plugin as an `automation` event at now (+ `at`). */
function sendAutomation(inst: PluginInstance, id: string, value: number, at = 0): void {
  inst.schedule([
    { type: 'automation', time: panelServices().now() + at, id, value, source: 'host' },
  ]);
}

/**
 * Builds the strip into `root` and returns its disposer. A row whose parameter an ARM link drives
 * is disabled while the link is valid.
 */
export function mountParamStrip(
  root: HTMLElement,
  nodeId: string,
  inst: PluginInstance,
  params: readonly ParameterInfo[],
): Disposer {
  const disposers: Disposer[] = [];
  const own = (d: Disposer): void => {
    disposers.push(d);
  };
  for (const p of params) root.append(paramRow(nodeId, p, inst, own));
  // A plugin that moves its own parameter (Note hold's "Run next bar" switching itself off) updates its row.
  const shown = new Set(params.map((p) => p.id));
  own(
    inst.subscribe((c) => {
      if (c.source === 'internal' && shown.has(c.id)) setParam(nodeId, c.id, c.value);
    }),
  );
  return () => {
    for (const d of disposers) d();
    root.replaceChildren();
  };
}

function paramRow(
  nodeId: string,
  p: ParameterInfo,
  inst: PluginInstance,
  own: (d: Disposer) => void,
): HTMLElement {
  const row = h('div', 'ivp-prow');
  row.dataset.param = p.id;
  const name = h('label', 'ivp-pname', p.label);
  name.title = p.label;
  const value = h('span', 'ivp-pval');
  const ctl = h('div', 'ivp-pctl');
  row.append(name, ctl, value);

  const stored = (): number | undefined =>
    project.value.nodes.find((n) => n.id === nodeId)?.params[p.id];
  const change = (n: number): void => {
    setParam(nodeId, p.id, n);
    sendAutomation(inst, p.id, n);
  };

  switch (p.kind) {
    case 'float': {
      const s = h('input', 'w95-range');
      s.type = 'range';
      s.min = '0';
      s.max = '1';
      s.step = '0.001';
      s.setAttribute('aria-label', p.label);
      s.addEventListener('input', () => change(Number(s.value)));
      ctl.append(s);
      own(
        effect(() => {
          const n = currentNormalized(p, stored());
          if (Number(s.value) !== n) s.value = String(n);
          value.textContent = valueLabel(p, n);
        }),
      );
      break;
    }
    case 'int': {
      const minus = h('button', 'w95-btn ivp-step', '−');
      const plus = h('button', 'w95-btn ivp-step', '+');
      minus.type = plus.type = 'button';
      minus.setAttribute('aria-label', `${p.label} down`);
      plus.setAttribute('aria-label', `${p.label} up`);
      minus.addEventListener('click', () =>
        change(stepNormalized(p, currentNormalized(p, stored()), -1)),
      );
      plus.addEventListener('click', () =>
        change(stepNormalized(p, currentNormalized(p, stored()), 1)),
      );
      ctl.append(minus, plus);
      own(
        effect(() => {
          value.textContent = valueLabel(p, currentNormalized(p, stored()));
        }),
      );
      break;
    }
    case 'boolean': {
      const cb = h('input', 'w95-check');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', p.label);
      cb.addEventListener('change', () => change(normalize(p, cb.checked ? p.max : p.min)));
      ctl.append(cb);
      own(
        effect(() => {
          const n = currentNormalized(p, stored());
          cb.checked = denormalize(p, n) >= 0.5;
          value.textContent = valueLabel(p, n);
        }),
      );
      break;
    }
    case 'choice': {
      const wrap = h('div', 'w95-select');
      const sel = h('select', '');
      sel.setAttribute('aria-label', p.label);
      const count = Math.round(p.max - p.min) + 1;
      for (let i = 0; i < count; i++) {
        const o = h('option', '', p.choices?.[i] ?? String(p.min + i));
        o.value = String(p.min + i);
        sel.append(o);
      }
      sel.addEventListener('change', () => change(normalize(p, Number(sel.value))));
      wrap.append(sel);
      ctl.append(wrap);
      own(
        effect(() => {
          const v = String(denormalize(p, currentNormalized(p, stored())));
          if (sel.value !== v) sel.value = v;
        }),
      );
      break;
    }
    case 'trigger': {
      // Rises to 1, reads back 0 a moment later. Not stored: a stored 1 would fire again on load.
      const b = h('button', 'w95-btn ivp-trig', p.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        for (const e of triggerPulse()) sendAutomation(inst, p.id, e.value, e.offset);
      });
      ctl.append(b);
      break;
    }
  }

  // Driven by an ARM link: the row shows the resting value and waits.
  const port = paramPort(p.id);
  own(
    effect(() => {
      const bound = (project.value.arms ?? []).some(
        (a) => armValid(a) && a.to.node === nodeId && a.target === port,
      );
      row.classList.toggle('ivp-bound', bound);
      for (const c of row.querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLSelectElement
      >('input, button, select')) {
        c.disabled = bound;
      }
    }),
  );
  return row;
}
