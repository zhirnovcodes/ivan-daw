// The add-node menu. `+ Add` in the transport bar toggles it through `addMenuOpen`.
// Tech design: "Panels" → "Add-node menu".

import { effect, signal } from '@preact/signals-core';
import type { MountUi } from '../contracts/ui';
import type { Catalog } from '../model/catalog';
import { MASTER_PLUGIN } from '../model/project';
import { addNode } from '../store/actions';
import { project } from '../store/store';
import { ensureStyles, h } from './dom';
import { placeNode } from './placement';
import { panelServices } from './services';

/** True while the menu is showing. The transport bar's `+ Add` button flips it. */
export const addMenuOpen = signal(false);

export const mountAddMenu: MountUi = (root) => {
  ensureStyles();
  const menu = h('div', 'ivp-menu');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Add node');
  menu.hidden = true;
  root.appendChild(menu);

  let token = 0;
  let disposed = false;

  const note = (text: string): void => {
    menu.replaceChildren(h('div', 'ivp-note', text));
  };

  const pick = (id: string): void => {
    const at = placeNode(
      panelServices().canvasCenter(),
      project.peek().nodes.map((n) => ({ x: n.x, y: n.y })),
    );
    addNode(id, at.x, at.y);
    addMenuOpen.value = false;
  };

  const show = (catalog: Catalog): void => {
    const entries = catalog.plugins.filter((e) => e.id !== MASTER_PLUGIN);
    if (entries.length === 0) {
      note('No plugins in the catalog.');
      return;
    }
    menu.replaceChildren(
      ...entries.map((e) => {
        const b = h('button', '');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.dataset.plugin = e.id;
        b.append(h('span', '', e.name), h('span', 'ivp-kind', e.kind));
        b.addEventListener('click', () => pick(e.id));
        return b;
      }),
    );
  };

  const stopEffect = effect(() => {
    const open = addMenuOpen.value;
    menu.hidden = !open;
    if (!open) return;
    const mine = ++token;
    note('Loading…');
    panelServices()
      .catalog()
      .then(
        (c) => {
          if (mine === token && !disposed) show(c);
        },
        (err: unknown) => {
          if (mine === token && !disposed)
            note(`Could not load the catalog: ${err instanceof Error ? err.message : String(err)}`);
        },
      );
  });

  const onDown = (e: PointerEvent): void => {
    if (!addMenuOpen.peek()) return;
    const t = e.target as Element | null;
    if (menu.contains(t) || t?.closest('[data-ivp-add]')) return;
    addMenuOpen.value = false;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && addMenuOpen.peek()) addMenuOpen.value = false;
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey);

  return () => {
    disposed = true;
    stopEffect();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey);
    addMenuOpen.value = false;
    menu.remove();
  };
};
