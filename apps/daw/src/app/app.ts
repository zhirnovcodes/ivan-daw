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
import { fetchPresets, isLocalHost } from '../model/presets';
import { fetchProject } from '../model/project';
import { mountAddMenu, mountPresetPanel, mountTransportBar, setPanelServices } from '../panels';
import { ensureW95 } from '../panels/w95';
import { createRouter, type LiveRouter } from '../router/router';
import { createScheduler, type LiveScheduler } from '../scheduler/scheduler';
import { loadProject, play, stop } from '../store/actions';
import { camera, mode, nodeStatus, project, provide, uiSlots } from '../store/store';
import { readMode } from './mode';
import { type Mounted, syncPluginUis } from './pluginUi';
import { openPath } from './projectUrl';

/** Half a node box, so `+ Add` centres the new box rather than its corner. */
const NODE_HALF = { x: 90, y: 40 };

const CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; }
body { font: 13px/1.2 var(--w95-font); color: #000; background: var(--w95-desk); -webkit-font-smoothing: none; }
/* Gaps from the window edges, shared by the top panel, the zoom panel and the scrollbars
   (canvas/styles.ts, canvas/scrollbars.ts), so the right scrollbar lines up with the panel's right wall. */
#ivd-shell { position: fixed; inset: 0; --ivd-left: 16px; --ivd-right: 16px; --ivd-top: 16px; --ivd-bottom: 16px;
  --ivd-panel-h: 64px; }
/* The canvas starts at the top panel's bottom edge, so the right scrollbar can touch it. */
#ivd-canvas { position: absolute; left: 0; right: 0; bottom: 0; top: calc(var(--ivd-top) + var(--ivd-panel-h)); overflow: hidden; }
#ivd-top { position: absolute; left: var(--ivd-left); right: var(--ivd-right); top: var(--ivd-top); height: var(--ivd-panel-h); box-sizing: border-box; z-index: 50; display: flex; align-items: stretch;
  background: var(--w95-face); box-shadow: var(--w95-raised); padding: 2px; }
#app { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
#ivd-bar { flex: 1; min-width: 0; }
#ivd-bar .ivp-bar { background: transparent; }
.ivd-play-tag { margin-left: 8px; padding: 3px 6px; box-shadow: var(--w95-sunken); background: var(--w95-field); }
/* Mobile mode (2026-11-26): a two-row top panel, 8 px side margins; the page itself never pans or zooms.
   Room at the top for the iPhone Dynamic Island / status bar, at the bottom for Android's buttons;
   more where the phone reports a bigger safe area (viewport-fit=cover). */
html.ivd-mobile, html.ivd-mobile body { touch-action: none; overscroll-behavior: none; }
.ivd-mobile #ivd-shell { --ivd-panel-h: 72px;
  --ivd-left: max(8px, env(safe-area-inset-left)); --ivd-right: max(8px, env(safe-area-inset-right));
  --ivd-top: max(44px, calc(env(safe-area-inset-top) + 8px));
  --ivd-bottom: max(48px, calc(env(safe-area-inset-bottom) + 8px)); }
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
function layout(): {
  shell: HTMLElement;
  bar: HTMLElement;
  canvas: HTMLElement;
  menu: HTMLElement;
} {
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
  return { shell, bar, canvas, menu };
}

/**
 * Mobile mode: tags the page for the mobile CSS and stops the browser zooming the page
 * (pinch zooms the canvas instead).
 */
function setupMobilePage(): void {
  document.documentElement.classList.add('ivd-mobile');
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.append(meta);
  }
  meta.content =
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
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
  // Development mode needs the dev server's preset routes and works only on localhost; anywhere
  // else ?mode=dev opens normal mode.
  const asked = readMode(location.search);
  const devRefused = asked === 'dev' && !(import.meta.env.DEV && isLocalHost(location.hostname));
  mode.value = devRefused ? 'edit' : asked;
  if (mode.value === 'mobile') setupMobilePage();
  const ui = layout();
  if (devRefused) showToast('Development mode works only on localhost');
  const catalog = await loadCatalog();
  provide({ manifests: manifestsFrom(catalog) });

  const base = import.meta.env.BASE_URL;
  try {
    const { path, missing, otherKind } = await openPath(
      location.search,
      () => fetchPresets(base),
      mode.value === 'mobile',
    );
    if (missing !== undefined) showToast(`No saved preset "${missing}"`);
    const doc = await fetchProject(`${base}${path}`);
    // A preset made for the other kind of screen keeps its graph but not its view: a desktop zoom
    // and scroll mean little on a phone (mobile mode fits all plugins instead), and the other way.
    if (otherKind) delete doc.view;
    loadProject(doc);
  } catch (e) {
    showToast(`Project failed to load: ${e instanceof Error ? e.message : String(e)}`);
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
  if (mode.value === 'play' || mode.value === 'dev') {
    const tag = document.createElement('span');
    tag.className = 'ivd-play-tag';
    tag.textContent = mode.value === 'play' ? 'Play only' : 'Development';
    ui.bar.querySelector('.ivp-spacer')?.before(tag);
  }
  if (mode.value === 'dev') mountPresetPanel(ui.shell);
  mountCanvas(ui.canvas);
  if (mode.value !== 'mobile') mountAddMenu(ui.menu);
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
