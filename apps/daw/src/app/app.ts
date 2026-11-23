// P11 app shell: wires every part together. Tech design: "Architecture", "Panels", "Walkthrough".
//
//   catalog → manifests → store; demo project → store
//   engine (loads plugins) · scheduler (clock) · router (cables, events) react to the store
//   canvas + panels read signals and call actions
//
// Layout (v1.2): the canvas fills the window; the top panel and the node panel float over it.

import { effect } from '@preact/signals-core';
import { mountCanvas, setCanvasServices, showToast } from '../canvas';
import type { IvanDawTestHook } from '../contracts/testHook';
import { createEngine, type LiveEngine } from '../engine/engine';
import { type Catalog, fetchCatalog, manifestsFrom } from '../model/catalog';
import { fetchProject } from '../model/project';
import { mountAddMenu, mountTransportBar, setPanelServices } from '../panels';
import { ensureW95 } from '../panels/w95';
import { createRouter, type LiveRouter } from '../router/router';
import { createScheduler, type LiveScheduler } from '../scheduler/scheduler';
import { loadProject, play, stop } from '../store/actions';
import { camera, mode, nodeStatus, project, provide, uiSlots } from '../store/store';
import { readMode } from './mode';
import { type Mounted, syncPluginUis } from './pluginUi';
import { projectPath } from './projectUrl';

/** Half a node box, so `+ Add` centres the new box rather than its corner. */
const NODE_HALF = { x: 90, y: 40 };

const CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; }
body { font: 13px/1.2 var(--w95-font); color: #000; background: var(--w95-desk); -webkit-font-smoothing: none; }
#ivd-shell { position: fixed; inset: 0; --ivd-top-h: 88px; }
#ivd-canvas { position: absolute; left: 0; right: 0; bottom: 0; top: var(--ivd-top-h); overflow: hidden; }
#ivd-top { position: absolute; left: 16px; right: 16px; top: 16px; height: calc(var(--ivd-top-h) - 24px); box-sizing: border-box; z-index: 50; display: flex; align-items: stretch;
  background: var(--w95-face); box-shadow: var(--w95-raised); padding: 2px; }
#app { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
#ivd-bar { flex: 1; min-width: 0; }
#ivd-bar .ivp-bar { background: transparent; }
.ivd-play-tag { margin-left: 8px; padding: 3px 6px; box-shadow: var(--w95-sunken); background: var(--w95-field); }
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
function layout(): { bar: HTMLElement; canvas: HTMLElement; menu: HTMLElement } {
  ensureW95();
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
  const menu = el('div', 'ivd-menu', document.body);
  return { bar, canvas, menu };
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
  mode.value = readMode(location);
  const ui = layout();
  const catalog = await loadCatalog();
  provide({ manifests: manifestsFrom(catalog) });

  try {
    loadProject(await fetchProject(`${import.meta.env.BASE_URL}${projectPath(location.search)}`));
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
      // The middle of what is on screen now, in world coordinates.
      const r = ui.canvas.getBoundingClientRect();
      const c = camera.peek();
      return {
        x: Math.round(c.x + r.width / (2 * c.z) - NODE_HALF.x),
        y: Math.round(c.y + r.height / (2 * c.z) - NODE_HALF.y),
      };
    },
  });

  setCanvasServices({
    parameters: (id) => engine.get(id)?.instance.parameters() ?? [],
    instance: (id) => engine.get(id)?.instance,
  });

  mountTransportBar(ui.bar);
  if (mode.value === 'play') {
    const tag = document.createElement('span');
    tag.className = 'ivd-play-tag';
    tag.textContent = 'Play only';
    ui.bar.querySelector('.ivp-spacer')?.before(tag);
  }
  mountCanvas(ui.canvas);
  mountAddMenu(ui.menu);
  // Plugins with a manifest.ui show their own UI inside their node box.
  const mountedUis = new Map<string, Mounted>();
  effect(() => {
    syncPluginUis(mountedUis, {
      slots: uiSlots.value,
      status: nodeStatus.value,
      instance: (id) => engine.get(id)?.instance,
      onError: notify,
    });
  });

  if (import.meta.env.DEV) {
    const hook: IvanDawTestHook = {
      play,
      stop,
      rms: () => engine.rms(),
      project: () => project.value,
      status: () => nodeStatus.value,
      camera: () => camera.value,
      mode: () => mode.value,
    };
    window.__ivandaw = hook;
  }

  return { engine, scheduler, router, catalog };
}
