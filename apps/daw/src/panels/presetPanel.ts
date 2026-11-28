// Development mode (?mode=dev, 2026-11-23): the preset panel, bottom right.
//   Name field + Mobile toggle · list of saved presets (a click puts that name and kind in the
//   fields) · Load · Save · Delete.
// A preset is a name plus the Mobile flag (2026-11-26): mobile ones show a MOBILE suffix in the list.
// Save writes the whole project, with each plugin's own state and the current zoom and scroll, to
// public/presets/ through the dev server (vite/presets.ts); the preset with that name and kind is
// replaced. Delete asks first. Load (2026-11-26) opens the chosen preset in place of the project now
// open, as ?preset= would, and puts ?preset=<name> in the address so a reload keeps it.
// A saved preset opens with ?preset=<Preset Name>; on the mobile version (?mobile=true, or a phone)
// the mobile one is preferred. The Mobile toggle starts as the page's own version.

import { captureState } from '../model/pluginState';
import { fetchPresets, type PresetEntry, presetSlug, samePreset } from '../model/presets';
import { fetchProject, MASTER_ID, type Project } from '../model/project';
import { loadProject, stop } from '../store/actions';
import { camera, isMobile, project } from '../store/store';
import { askYesNo } from './dialog';
import { ensureStyles, h } from './dom';
import { panelServices } from './services';
import { titleBar } from './w95';

const CSS = `
.ivp-presets { position: absolute; right: 53px; bottom: 53px; z-index: 60; width: 240px; display: flex; flex-direction: column; }
.ivp-presets-body { display: flex; flex-direction: column; gap: 6px; padding: 6px 4px 4px; }
.ivp-presets-top { display: flex; gap: 6px; align-items: center; }
.ivp-presets-name { flex: 1; min-width: 0; }
.ivp-presets-mobile { display: flex; gap: 3px; align-items: center; white-space: nowrap; cursor: pointer; }
.ivp-presets-mobile input { margin: 0; }
.ivp-presets-list .tag { margin-left: 4px; font-size: 11px; opacity: 0.75; }
.ivp-presets-list { list-style: none; margin: 0; padding: 2px; height: 120px; overflow-y: auto; background: var(--w95-field);
  box-shadow: var(--w95-sunken); }
.ivp-presets-list li { padding: 1px 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ivp-presets-list li[aria-selected="true"] { background: var(--w95-select); color: #fff; }
.ivp-presets-list .empty { color: var(--w95-shadow); cursor: default; }
.ivp-presets-row { display: flex; gap: 6px; justify-content: flex-end; }
.ivp-presets-row > :first-child { margin-right: auto; }
.ivp-presets-status { min-height: 15px; font-size: 12px; }
`;

let styled = false;

async function send(
  method: string,
  url: string,
  body?: BodyInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method, ...(body !== undefined ? { body } : {}) });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof out.error === 'string' ? out.error : `HTTP ${res.status}`);
  return out;
}

/** The project as it is now, with every loaded plugin's own state; state files go to the library. */
async function snapshot(): Promise<Project> {
  const p = project.peek();
  const store = async (blob: Blob): Promise<string> => {
    const { path } = await send('POST', '/__presets/file', blob);
    if (typeof path !== 'string') throw new Error('no file path');
    return path;
  };
  const nodes = [];
  for (const n of p.nodes) {
    const inst = n.id === MASTER_ID ? undefined : panelServices().instance(n.id);
    // Not loaded (still loading, or broken): keep whatever state it was opened with.
    nodes.push(inst ? { ...n, state: await captureState(await inst.getState(), store) } : n);
  }
  const { x, y, z } = camera.peek();
  return { ...p, nodes, view: { x, y, z } };
}

/** How a preset is named to people: `Drums` or `Drums MOBILE`. */
const label = (name: string, mobile: boolean): string => (mobile ? `${name} MOBILE` : name);

const presetQuery = (name: string, mobile: boolean): string =>
  `name=${encodeURIComponent(name)}${mobile ? '&mobile=1' : ''}`;

export function mountPresetPanel(root: HTMLElement): () => void {
  ensureStyles();
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    styled = true;
  }
  const base = import.meta.env.BASE_URL;
  const win = h('div', 'ivp-presets w95-window w95');
  win.setAttribute('aria-label', 'Presets');
  const { bar } = titleBar('Presets', []);
  const body = h('div', 'ivp-presets-body');
  const name = h('input', 'w95-field ivp-presets-name');
  name.type = 'text';
  name.placeholder = 'Preset name';
  name.setAttribute('aria-label', 'Preset name');
  const mobileBox = h('input', '');
  mobileBox.type = 'checkbox';
  mobileBox.checked = isMobile.peek();
  const mobileLabel = h('label', 'ivp-presets-mobile');
  mobileLabel.title = 'A preset for the mobile version (?mobile=true)';
  mobileLabel.append(mobileBox, 'Mobile');
  const top = h('div', 'ivp-presets-top');
  top.append(name, mobileLabel);
  const list = h('ul', 'ivp-presets-list w95-scroll');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Saved presets');
  const row = h('div', 'ivp-presets-row');
  const load = h('button', 'w95-btn', 'Load');
  load.type = 'button';
  const save = h('button', 'w95-btn', 'Save');
  save.type = 'button';
  const del = h('button', 'w95-btn', 'Delete');
  del.type = 'button';
  row.append(load, save, del);
  const status = h('div', 'ivp-presets-status');
  status.setAttribute('role', 'status');
  body.append(top, list, row, status);
  win.append(bar, body);
  // Clicks and keys here are the panel's, not the canvas's.
  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.append(win);

  let presets: PresetEntry[] = [];
  let busy = false;

  const match = (): PresetEntry | undefined =>
    presets.find((p) => samePreset(p, name.value, mobileBox.checked));
  const sync = (): void => {
    const hit = match();
    for (const li of list.querySelectorAll<HTMLLIElement>('li[data-file]')) {
      li.setAttribute('aria-selected', String(li.dataset.file === hit?.file));
    }
    save.disabled = busy || presetSlug(name.value) === '';
    del.disabled = busy || !hit;
    load.disabled = busy || !hit;
  };
  const render = (): void => {
    list.replaceChildren();
    if (presets.length === 0) list.append(h('li', 'empty', 'No presets yet'));
    for (const p of presets) {
      const li = h('li', '', p.name);
      if (p.mobile) li.append(h('span', 'tag', 'MOBILE'));
      li.dataset.file = p.file;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-label', label(p.name, p.mobile));
      li.title = `Open with ?preset=${p.name}&mobile=${p.mobile}`;
      li.addEventListener('click', () => {
        name.value = p.name;
        mobileBox.checked = p.mobile;
        sync();
      });
      list.append(li);
    }
    sync();
  };
  const reload = async (): Promise<void> => {
    presets = await fetchPresets(base);
    render();
  };
  const run = async (what: () => Promise<string>): Promise<void> => {
    busy = true;
    sync();
    try {
      status.textContent = await what();
    } catch (e) {
      status.textContent = `Failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
      await reload();
    }
  };

  name.addEventListener('input', sync);
  mobileBox.addEventListener('change', sync);
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !save.disabled) save.click();
  });
  save.addEventListener('click', () => {
    const n = name.value.trim();
    const mobile = mobileBox.checked;
    void run(async () => {
      status.textContent = 'Saving…';
      const doc = await snapshot();
      const replaced = match() !== undefined;
      await send('PUT', `/__presets/preset?${presetQuery(n, mobile)}`, JSON.stringify(doc));
      return `${replaced ? 'Replaced' : 'Saved'} "${label(n, mobile)}"`;
    });
  });
  load.addEventListener('click', () => {
    const hit = match();
    if (!hit) return;
    void run(async () => {
      const doc = await fetchProject(`${base}presets/${hit.file}`);
      // Made for the other kind of screen: keep the graph, not the view (as at boot).
      if (hit.mobile !== isMobile.peek()) delete doc.view;
      stop();
      // The engine keeps a plugin whose node id survives, so clear the graph first: every plugin
      // of the preset then loads fresh, with its saved state.
      loadProject({
        ...doc,
        nodes: doc.nodes.filter((n) => n.id === MASTER_ID),
        cables: [],
        arms: [],
      });
      loadProject(doc);
      const url = new URL(location.href);
      url.searchParams.delete('project');
      url.searchParams.set('preset', hit.name);
      history.replaceState(history.state, '', url);
      return `Loaded "${label(hit.name, hit.mobile)}"`;
    });
  });
  del.addEventListener('click', async () => {
    const hit = match();
    if (!hit) return;
    const shown = label(hit.name, hit.mobile);
    if (!(await askYesNo('Delete preset', `Delete preset "${shown}"?`))) return;
    void run(async () => {
      await send('DELETE', `/__presets/preset?${presetQuery(hit.name, hit.mobile)}`);
      name.value = '';
      return `Deleted "${shown}"`;
    });
  });

  void reload();
  return () => win.remove();
}
