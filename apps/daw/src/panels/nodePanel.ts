// The node panel: title and status, strip volume and pan, the generic parameter strip, Remove.
// Tech design: "Panels" → "Node panel".

import { computed, effect, untracked } from '@preact/signals-core';
import type { ParameterInfo, PluginInstance } from 'ivandaw-core';
import type { MountUi } from '../contracts/ui';
import { GAIN_MAX, MASTER_ID } from '../model/project';
import { removeNode, setGain, setPan, setParam } from '../store/actions';
import { deps, type NodeStatus, nodeErrors, nodeStatus, project, selection } from '../store/store';
import { ensureStyles, h } from './dom';
import { formatDb, formatPan } from './format';
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

/** Sends a normalized value to the plugin as an `automation` event at now. */
function sendAutomation(inst: PluginInstance | undefined, id: string, value: number, at = 0): void {
  if (!inst) return;
  inst.schedule([
    { type: 'automation', time: panelServices().now() + at, id, value, source: 'host' },
  ]);
}

function row(label: string): {
  el: HTMLDivElement;
  value: HTMLSpanElement;
  name: HTMLLabelElement;
} {
  const el = h('div', 'ivp-row');
  const name = h('label', '', label);
  const value = h('span', 'ivp-val');
  el.append(name, value);
  return { el, value, name };
}

function slider(min: number, max: number, step: number): HTMLInputElement {
  const s = h('input', '');
  s.type = 'range';
  s.min = String(min);
  s.max = String(max);
  s.step = String(step);
  return s;
}

export const mountNodePanel: MountUi = (root) => {
  ensureStyles();
  const panel = h('aside', 'ivp-node');
  panel.setAttribute('aria-label', 'Node panel');
  panel.hidden = true;
  root.appendChild(panel);

  // Rebuild only when the selected node, its plugin or its load status changes, never on a value
  // change, so a slider keeps the pointer while it is dragged.
  const key = computed(() => {
    const id = selection.value.node;
    const node = id ? project.value.nodes.find((n) => n.id === id) : undefined;
    return node ? `${node.id}|${node.plugin}|${nodeStatus.value[node.id] ?? 'loading'}` : '';
  });

  let disposers: Disposer[] = [];
  const clear = (): void => {
    for (const d of disposers) d();
    disposers = [];
    panel.replaceChildren();
  };

  function build(id: string): void {
    const node = project.peek().nodes.find((n) => n.id === id);
    if (!node) return;
    const status: NodeStatus = nodeStatus.peek()[id] ?? 'loading';
    const manifest = deps.peek().manifests.get(node.plugin);
    const inst = panelServices().instance(id);
    const own = (d: Disposer): void => {
      disposers.push(d);
    };

    // Title and status
    const title = h('div', 'ivp-title', manifest?.name ?? node.plugin);
    if (manifest) title.append(' ', h('span', 'ivp-kind', manifest.kind));
    const statusEl = h(
      'div',
      'ivp-status',
      status === 'ready' ? 'Ready' : status === 'error' ? 'Error' : 'Loading…',
    );
    statusEl.classList.toggle('error', status === 'error');
    panel.append(title, statusEl);
    if (status === 'error') {
      const err = h('div', 'ivp-err');
      err.setAttribute('role', 'alert');
      own(
        effect(() => {
          err.textContent = nodeErrors.value[id] ?? 'unknown error';
        }),
      );
      panel.append(err);
    }

    // Strip: volume and pan
    panel.append(h('div', 'ivp-sect', 'Strip'));
    const vol = row('Volume');
    const volIn = slider(0, GAIN_MAX, 0.01);
    volIn.setAttribute('aria-label', 'Volume');
    volIn.addEventListener('input', () => setGain(id, Number(volIn.value)));
    vol.el.append(volIn);
    own(
      effect(() => {
        const g = project.value.nodes.find((n) => n.id === id)?.gain ?? 1;
        if (Number(volIn.value) !== g) volIn.value = String(g);
        vol.value.textContent = formatDb(g);
      }),
    );

    const pan = row('Pan');
    const panIn = slider(-1, 1, 0.01);
    panIn.setAttribute('aria-label', 'Pan');
    panIn.addEventListener('input', () => setPan(id, Number(panIn.value)));
    panIn.addEventListener('dblclick', () => setPan(id, 0));
    pan.el.append(panIn);
    own(
      effect(() => {
        const p = project.value.nodes.find((n) => n.id === id)?.pan ?? 0;
        if (Number(panIn.value) !== p) panIn.value = String(p);
        pan.value.textContent = formatPan(p);
      }),
    );
    panel.append(vol.el, pan.el);

    // Parameter strip
    if (id !== MASTER_ID) {
      const params = inst?.parameters().filter((p) => p.automatable) ?? [];
      panel.append(h('div', 'ivp-sect', 'Parameters'));
      if (!inst) {
        panel.append(
          h(
            'div',
            'ivp-note',
            status === 'error'
              ? 'The plugin did not load.'
              : 'Parameters appear when the plugin has loaded.',
          ),
        );
      } else if (params.length === 0) {
        panel.append(h('div', 'ivp-note', 'No parameters.'));
      }
      if (inst) for (const p of params) panel.append(paramControl(id, p, inst, own));
    }

    if (id !== MASTER_ID) {
      const rm = h('button', 'ivp-remove', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', () => removeNode(id));
      panel.append(rm);
    }
  }

  const stopKey = effect(() => {
    const k = key.value;
    untracked(() => {
      clear();
      panel.hidden = k === '';
      if (k !== '') build(k.split('|')[0] ?? '');
    });
  });

  return () => {
    stopKey();
    clear();
    panel.remove();
  };
};

/** One control for one parameter. Every change: setParam (stored) + an automation event at now. */
function paramControl(
  nodeId: string,
  p: ParameterInfo,
  inst: PluginInstance,
  own: (d: Disposer) => void,
): HTMLElement {
  const r = row(p.label);
  r.el.dataset.param = p.id;
  const stored = (): number | undefined =>
    project.value.nodes.find((n) => n.id === nodeId)?.params[p.id];
  const change = (n: number): void => {
    setParam(nodeId, p.id, n);
    sendAutomation(inst, p.id, n);
  };

  switch (p.kind) {
    case 'float': {
      const s = slider(0, 1, 0.001);
      s.setAttribute('aria-label', p.label);
      s.addEventListener('input', () => change(Number(s.value)));
      r.el.append(s);
      own(
        effect(() => {
          const n = currentNormalized(p, stored());
          if (Number(s.value) !== n) s.value = String(n);
          r.value.textContent = valueLabel(p, n);
        }),
      );
      break;
    }
    case 'int': {
      const box = h('div', 'ivp-stepper');
      const minus = h('button', '', '−');
      const plus = h('button', '', '+');
      minus.type = plus.type = 'button';
      minus.setAttribute('aria-label', `${p.label} down`);
      plus.setAttribute('aria-label', `${p.label} up`);
      const num = h('span', '');
      minus.addEventListener('click', () =>
        change(stepNormalized(p, currentNormalized(p, stored()), -1)),
      );
      plus.addEventListener('click', () =>
        change(stepNormalized(p, currentNormalized(p, stored()), 1)),
      );
      box.append(minus, num, plus);
      r.el.append(box);
      own(
        effect(() => {
          const n = currentNormalized(p, stored());
          num.textContent = valueLabel(p, n);
          r.value.textContent = '';
        }),
      );
      break;
    }
    case 'boolean': {
      const cb = h('input', '');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', p.label);
      cb.addEventListener('change', () => change(normalize(p, cb.checked ? p.max : p.min)));
      r.el.append(cb);
      own(
        effect(() => {
          const n = currentNormalized(p, stored());
          cb.checked = denormalize(p, n) >= 0.5;
          r.value.textContent = valueLabel(p, n);
        }),
      );
      break;
    }
    case 'choice': {
      const sel = h('select', '');
      sel.setAttribute('aria-label', p.label);
      const count = Math.round(p.max - p.min) + 1;
      for (let i = 0; i < count; i++) {
        const o = h('option', '', p.choices?.[i] ?? String(p.min + i));
        o.value = String(p.min + i);
        sel.append(o);
      }
      sel.addEventListener('change', () => change(normalize(p, Number(sel.value))));
      r.el.append(sel);
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
      const b = h('button', '', p.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        for (const e of triggerPulse()) sendAutomation(inst, p.id, e.value, e.offset);
      });
      r.name.remove();
      r.value.remove();
      r.el.append(b);
      break;
    }
  }
  return r.el;
}
