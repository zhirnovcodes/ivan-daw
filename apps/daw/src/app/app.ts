// P11 app shell: wires every part together. Tech design: "Architecture", "Panels", "Walkthrough".
//
//   catalog → manifests → store; demo project → store
//   engine (loads plugins) · scheduler (clock) · router (cables, events) react to the store
//   canvas + panels read signals and call actions
//
// Layout: [IvanDAW | transport bar] on top, canvas below, node panel on the right when a node is selected.

import { mountCanvas, showToast } from '../canvas';
import type { IvanDawTestHook } from '../contracts/testHook';
import { createEngine, type LiveEngine } from '../engine/engine';
import { type Catalog, fetchCatalog, manifestsFrom } from '../model/catalog';
import { fetchProject } from '../model/project';
import { mountAddMenu, mountNodePanel, mountTransportBar, setPanelServices } from '../panels';
import { createRouter, type LiveRouter } from '../router/router';
import { createScheduler, type LiveScheduler } from '../scheduler/scheduler';
import { loadProject, play, stop } from '../store/actions';
import { nodeStatus, project, provide, selection } from '../store/store';

export const DEMO_PROJECT = 'projects/demo.json';
/** Half a node box, so `+ Add` centres the new box rather than its corner. */
const NODE_HALF = { x: 90, y: 40 };

const CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; }
body { font: 13px system-ui, sans-serif; color: #000; background: #fff; }
#ivd-shell { position: fixed; inset: 0; display: grid; grid-template-rows: 48px 1fr; grid-template-columns: 1fr auto; }
#ivd-top { grid-column: 1 / 3; display: flex; align-items: stretch; border-bottom: 1px solid #000; }
#app { display: flex; align-items: center; padding: 0 12px; font-weight: 700; border-right: 1px solid #000; }
#ivd-bar { flex: 1; min-width: 0; }
#ivd-bar .ivp-bar { border-bottom: 0; }
#ivd-canvas { position: relative; overflow: hidden; min-width: 0; }
#ivd-side { width: 260px; border-left: 1px solid #000; overflow-y: auto; }
#ivd-side.ivd-empty { display: none; }
`;

export interface App {
  engine: LiveEngine;
  scheduler: LiveScheduler;
  router: LiveRouter;
  catalog: Catalog;
}

function el(tag: string, id: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.id = id;
  parent.append(e);
  return e;
}

/** Builds the layout. `#app` keeps the plain "IvanDAW" title the smoke test looks for. */
function layout(): { bar: HTMLElement; canvas: HTMLElement; side: HTMLElement; menu: HTMLElement } {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const shell = el('div', 'ivd-shell', document.body);
  const top = el('div', 'ivd-top', shell);
  const app = document.getElementById('app') ?? el('div', 'app', top);
  app.textContent = 'IvanDAW';
  top.append(app);
  const bar = el('div', 'ivd-bar', top);
  const canvas = el('div', 'ivd-canvas', shell);
  const side = el('div', 'ivd-side', shell);
  const menu = el('div', 'ivd-menu', document.body);
  return { bar, canvas, side, menu };
}

async function loadCatalog(): Promise<Catalog> {
  try {
    return await fetchCatalog();
  } catch (e) {
    showToast(`Plugin catalog failed to load: ${e instanceof Error ? e.message : String(e)}`);
    return { plugins: [] };
  }
}

export async function boot(): Promise<App> {
  const ui = layout();
  const catalog = await loadCatalog();
  provide({ manifests: manifestsFrom(catalog) });

  try {
    loadProject(await fetchProject(`${import.meta.env.BASE_URL}${DEMO_PROJECT}`));
  } catch (e) {
    showToast(`Demo project failed to load: ${e instanceof Error ? e.message : String(e)}`);
  }

  const notify = (node: string, message: string): void => showToast(`${node}: ${message}`);
  const engine = createEngine({
    catalog,
    onNotify: (node, _level, message) => notify(node, message),
  });
  const click = new URLSearchParams(location.search).get('click') === '1';
  const scheduler = createScheduler({ engine, click });
  const router = createRouter({ engine, onNotify: notify });
  provide({ scheduler, router });

  scheduler.attach();
  router.attach();
  engine.attach();
  engine.installUnlock();

  setPanelServices({
    instance: (id) => engine.get(id)?.instance,
    now: () => engine.context.currentTime,
    catalog: async () => catalog,
    canvasCenter: () => {
      const r = ui.canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.round(r.width / 2 - NODE_HALF.x)),
        y: Math.max(0, Math.round(r.height / 2 - NODE_HALF.y)),
      };
    },
  });

  mountTransportBar(ui.bar);
  mountCanvas(ui.canvas);
  mountNodePanel(ui.side);
  mountAddMenu(ui.menu);
  // The side column takes no width while nothing is selected.
  selection.subscribe((s) => ui.side.classList.toggle('ivd-empty', !s.node));

  if (import.meta.env.DEV) {
    const hook: IvanDawTestHook = {
      play,
      stop,
      rms: () => engine.rms(),
      project: () => project.value,
      status: () => nodeStatus.value,
    };
    window.__ivandaw = hook;
  }

  return { engine, scheduler, router, catalog };
}
