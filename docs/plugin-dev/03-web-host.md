# 03 · Web host (IvanDAW build)

Turns the core into an IvanDAW Plugin API v2 plugin: a folder with `index.js` (the `PluginFactory`), `manifest.json`, `<name>.wasm`, and `processor.js` for instruments. Same build path as Beatality's `vite.daw.config.ts`.

Contract: ivandaw-core `src/api.ts` (types) and ivan-daw `docs/plugin-api.md` (rules). Read the rules section before writing an adapter.

## Output: `apps/web/dist-daw/`

| File | Required | What |
| --- | --- | --- |
| `index.js` | yes | ES module, default export `PluginFactory`. Everything bundled in (ivandaw-core, Preact, CSS). No bare imports. |
| `manifest.json` | yes | The `PluginManifest` as JSON. ivan-daw's catalog reads it without loading `index.js`. |
| `<name>.wasm` | yes | Standalone wasm from `hosts/web/boundary/api.cpp`. |
| `processor.js` | instruments | AudioWorklet script, one file, no imports. |
| other assets | optional | Samples, presets, fonts. Loaded with `new URL('./x', import.meta.url)` or `host.assetUrl('x')`. |

Rules for the folder:

- Works from any URL. No absolute paths, no `/` at the start of any asset URL. ivan-daw serves it at `/plugins/<id>/`.
- `manifest.id` equals `<id>` everywhere: `params.json` repo, ivan-daw `plugins/<name>/package.json` → `ivandaw.id`. The catalog skips a plugin whose ids differ.
- Styles are scoped (class prefix `<pfx>-` or a shadow root). `index.js` injects its own CSS; delete Vite's extracted `.css` in `writeBundle` (as Beatality does).

## Build commands

```
# repo root: wasm
emcmake cmake -S . -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm --target <name>

# web plugin
pnpm install
pnpm --filter @<name>/web build:daw     # → apps/web/dist-daw/
pnpm --filter @<name>/web dev           # dev page with keyboard, transport, scope
```

## CMake: the wasm target

Inside `CMakeLists.txt`, the `if(EMSCRIPTEN)` branch (JUCE goes in `else()`, see [04](04-vst-host.md)):

```cmake
if(EMSCRIPTEN)
    # Standalone module: instantiated directly, no Emscripten JS glue.
    add_executable(<name> hosts/web/boundary/api.cpp)
    target_include_directories(<name> PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/hosts/common)
    target_link_libraries(<name> PRIVATE <pfx>_engine)
    <pfx>_core_flags(<name>)
    set_target_properties(<name> PROPERTIES SUFFIX ".wasm")
    target_link_options(<name> PRIVATE
        -O2 --no-entry -sSTANDALONE_WASM -sALLOW_MEMORY_GROWTH -sFILESYSTEM=0
        -sEXPORTED_FUNCTIONS=_<pfx>_alloc,_<pfx>_free,_<pfx>_create,_<pfx>_destroy,_<pfx>_set_param,_<pfx>_transport,_<pfx>_midi,_<pfx>_all_off,_<pfx>_process,_<pfx>_out_count,_<pfx>_out_frame,_<pfx>_out_kind,_<pfx>_out_bytes,_<pfx>_out_slot,_<pfx>_out_value
    )
else()
    # JUCE, see 04-vst-host.md
endif()
```

## apps/web/package.json

```json
{
  "name": "@<name>/web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build:daw": "tsc --noEmit && vitest run && vite build --config vite.daw.config.ts"
  },
  "dependencies": {
    "ivandaw-core": "github:zhirnovcodes/ivan-daw-core#v0.2.0",
    "preact": "^11.0.1"
  },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vite": "^8.3.4",
    "vitest": "^5.1.0"
  }
}
```

Use the same ivandaw-core tag ivan-daw pins. TypeScript 7 has no compiler API on its main entry; compile `processor.ts` with the `tsc` binary as Beatality's `vite.processor.ts` does (copy that file unchanged, change the path to `hosts/web/audio-thread/processor.ts`).

## vite.daw.config.ts

Copy Beatality's `apps/web-widget/vite.daw.config.ts` and change:

| Beatality | New plugin |
| --- | --- |
| `build-wasm/beatality.wasm` | `build-wasm/<name>.wasm` |
| `src/daw-plugin.tsx` | `../../hosts/web/plugin.ts` |
| `dawManifest.ts` | `src/manifest.ts` |
| packs / samples emit | your own assets, or remove |
| `processorScript('processor.js')` | keep for instruments, remove for MIDI plugins |

Keep: the `buildStart` check that fails with the exact wasm command when the wasm is missing; `emitFile` for `manifest.json`; `publicDir: false`; `lib` with `formats: ['es']` and `fileName: () => 'index.js'`; `target: 'es2022'`.

## src/manifest.ts

Plain data, so the Vite config can write it out without loading the plugin.

```ts
import type { PluginManifest } from 'ivandaw-core';

export const ID = '<id>';
export const VERSION = '0.0.1';          // same as the JUCE VERSION in CMakeLists.txt

export const manifest: PluginManifest = {
  id: ID,
  name: '<Name>',
  vendor: 'zhirnovcodes',
  version: VERSION,
  apiVersion: 2,
  kind: 'midi',                          // or 'modulator' / 'instrument' — see the type doc
  ports: [/* see the type doc */],
  ui: { width: 480, height: 320, resizable: false },   // or null
  features: ['state'],
};
```

## Parameters from params.json

`hosts/web/params.ts`, shared by every type:

```ts
import raw from '../../params.json';
import type { ParameterInfo } from 'ivandaw-core';

export const PARAMS = raw.params as ParameterInfo[];
export const INDEX = new Map(PARAMS.map((p, i) => [p.id, i]));

/** normalized 0..1 → plain min..max. Same function as the JUCE side. */
export function toPlain(p: ParameterInfo, n: number): number {
  const c = Math.min(1, Math.max(0, n));
  let v = p.scale === 'log' ? p.min * (p.max / p.min) ** c : p.min + c * (p.max - p.min);
  if (p.kind === 'int' || p.kind === 'choice' || p.kind === 'boolean') v = Math.round(v);
  return v;
}
export function toNormalized(p: ParameterInfo, v: number): number {
  return p.scale === 'log'
    ? Math.log(v / p.min) / Math.log(p.max / p.min)
    : (v - p.min) / (p.max - p.min);
}
```

Every `automation` event with a known id: denormalize, call `<pfx>_set_param(index, plain)`, then tell `subscribe` listeners (`source: e.source === 'binding' ? 'binding' : 'host'`). Unknown id: ignore, never throw.

## Loading the wasm

Instruments load it inside the worklet (Beatality posts the bytes in an `init` message). MIDI plugins load it on the main thread:

```ts
const url = new URL(/* @vite-ignore */ './<name>.wasm', import.meta.url);
const { instance } = await WebAssembly.instantiateStreaming(fetch(url), {
  wasi_snapshot_preview1: { proc_exit() {}, fd_write() { return 0; }, fd_close() { return 0; }, fd_seek() { return 0; } },
});
const core = instance.exports as unknown as Core;   // Core = typed list of <pfx>_* exports
(core as { _initialize?: () => void })._initialize?.();
```

`STANDALONE_WASM` may import a few WASI stubs; list the imports with `wasm-objdump -x` once and stub exactly those.

## Adapter shape: MIDI plugins (main thread, lookahead)

Generators and controls have no audio, so they run on the main thread and render ahead of time. The host batches with a 100 ms lookahead; the plugin must emit events before they are due.

```ts
import { createTicker, LOOKAHEAD, TICK_MS, type PluginEvent } from 'ivandaw-core';

let rendered = ctx.currentTime;                      // engine time already rendered up to
const ticker = createTicker(TICK_MS, () => {
  const until = ctx.currentTime + LOOKAHEAD;
  if (until <= rendered) return;
  if (rendered < ctx.currentTime) rendered = ctx.currentTime;   // after a stall: skip, never burst
  const frames = Math.round((until - rendered) * ctx.sampleRate);
  if (frames <= 0) return;
  applyQueued(rendered, frames);                     // pending transport/midi → <pfx>_transport/_midi at their frame
  core.<pfx>_process(engine, frames, 0, 0);
  for (let k = 0; k < core.<pfx>_out_count(engine); k++) {
    const time = rendered + core.<pfx>_out_frame(engine, k) / ctx.sampleRate;
    emit(toEvent(k, time));                          // see the type doc
  }
  rendered += frames / ctx.sampleRate;
});
```

Rules:

- Use `createTicker`, never `setTimeout`/`setInterval` (ivan-daw rule).
- Incoming events with `time < rendered` are applied at frame 0 of the next window (up to 100 ms late). State this in the README as a known limit, as Beatality does for its gate.
- `transport` with `playing: false`, and CC 120/123 in: call `<pfx>_all_off` and emit the note-offs it returns *at the event time*. Every note-on emitted needs a matching note-off, including on `dispose()`.
- `dispose()`: stop the ticker, emit pending note-offs, `<pfx>_destroy`, drop listeners.

## Adapter shape: instruments (AudioWorklet)

Follow Beatality's `hosts/web/audio-thread/processor.ts` and `plugin-v2.ts`:

- `create()` → `audioWorklet.addModule(new URL('./processor.js', import.meta.url))`, `new AudioWorkletNode(ctx, '<name>', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })`, post `{ type: 'init', wasm: ArrayBuffer, seed }`, resolve only when the worklet answers `ready`.
- `schedule(events)` → post each event with its `time`. The worklet converts to `frame = Math.round(time * sampleRate)`, keeps a sorted queue, and splits `process()` at each event's frame (declare `sample-accurate` in `features` once it does).
- Worklet `process()`: render 128 frames with `<pfx>_process` into wasm memory, copy to `outputs[0]`.
- Port `out`: `{ info, node, index: 0 }`.

## UI

- `mount(container)` renders the skin from `apps/web/src/ui/` into `container`; `unmount()` removes it. Sound never changes on mount/unmount. `create(host, null)` must work headless.
- Controls carry `data-param="<id>"`. A drag sends a `ParameterChange` with `gesture: 'begin'` … `'end'` and `source: 'ui'`.
- The skin talks to a small bridge interface (`setParam(id, n)`, `onParam(cb)`, `onState(cb)`). The web adapter implements it with direct calls; the JUCE editor implements it over `WebBrowserComponent` native functions (see [04](04-vst-host.md)). The skin never knows which host it is in.
- Stop key propagation only for keys the focused control uses (space plays the DAW).

## State

```ts
async getState() {
  return { pluginId: ID, pluginVersion: VERSION,
           data: { v: 1, params: Object.fromEntries(PARAMS.map((p) => [p.id, current(p.id)])) } };
}
```

- Store params by `id`, not index. Unknown ids in `setState`: ignore. Missing ids: default.
- The JUCE build writes the same JSON in `getStateInformation`, so a preset string moves between hosts.
- `setState` releases held notes first and resolves when it sounds as saved.

## Dev page

`apps/web/index.html` + `src/dev.ts`: creates an `AudioContext` on a click, loads the factory from source, a Play/Stop button that sends `transport` events, a BPM field, a computer-keyboard piano (A–K) sending `midi`, and a log of every emitted event. Used for listening checks without ivan-daw. Beatality's `daw-test.html` is the model.
