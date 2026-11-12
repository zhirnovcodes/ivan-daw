// Boot from P2: load the demo project into the store and install the test hook.
// The engine, scheduler and router are stubs until P3, P4 and P8; P11 replaces this with the real app shell.

import { createStubEngine } from './contracts/stubs';
import type { IvanDawTestHook } from './contracts/testHook';
import { fetchProject } from './model/project';
import { loadProject, play, stop } from './store/actions';
import { nodeStatus, project } from './store/store';

const engine = createStubEngine();

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (app) app.textContent = 'IvanDAW';

  const info = document.createElement('p');
  info.id = 'boot';
  document.body.append(info);
  try {
    loadProject(await fetchProject(`${import.meta.env.BASE_URL}projects/demo.json`));
    const p = project.value;
    info.textContent = `Project loaded: ${p.nodes.length} nodes, ${p.cables.length} cables, ${p.transport.bpm} BPM`;
  } catch (e) {
    info.textContent = `Project failed to load: ${e instanceof Error ? e.message : String(e)}`;
    console.error(e);
  }

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
}

void boot();
