# Type · Audio instrument

Makes sound from notes: synth, sampler, drum machine, loop slicer. Beatality is the reference implementation: read its repo when this doc is not enough.

Read first: [01-architecture.md](../01-architecture.md). Host details: [03](../03-web-host.md), [04](../04-vst-host.md).

## IvanDAW manifest

Same shape as Beatality's `apps/web-widget/src/dawManifest.ts`:

```ts
export const manifest: PluginManifest = {
  id: '<id>', name: '<Name>', vendor: 'zhirnovcodes', version: VERSION, apiVersion: 2,
  kind: 'instrument',
  ports: [
    { id: 'in',  label: 'Events', kind: 'events', direction: 'in',  accepts: ['midi', 'automation', 'tempo', 'transport'] },
    { id: 'out', label: 'Output', kind: 'audio',  direction: 'out', channels: 2, main: true },
  ],
  ui: { width: 640, height: 400, resizable: false },
  features: ['state'],      // add 'sample-accurate' once the worklet splits blocks at event frames
};
```

## JUCE

One target, `FORMATS AU VST3 Standalone`, `IS_SYNTH TRUE`, `AU_MAIN_TYPE kAudioUnitType_MusicDevice`, `VST3_CATEGORIES Instrument Synth`. Exact CMake in [04](../04-vst-host.md#audio-instrument-one-target-same-as-beatality). CI is Beatality's `mac.yml` with names swapped; `auval -strict -v aumu <CODE> <MFR>`.

Factory content (presets, samples) ships as files in `Contents/Resources/Factory` of every format, copied by a `POST_BUILD` command. Copy Beatality's `foreach(format IN ITEMS AU VST3 Standalone)` block and its "Factory files" check in `mac.yml`. Ship the same files in the web zip under `packs/` (Beatality's `vite.daw.config.ts` `dawFiles()` plugin).

## Core behaviour

`Engine::process(frames, left, right, out)` **adds** into `left` / `right` (the host clears first). `out` stays empty.

| Rule | Detail |
| --- | --- |
| Fades on every start, stop, change | Attack ≥ 1 ms, release ≥ 5 ms; parameter changes that affect level go through a one-pole smoother (`Smoother` in ivandaw-core is the TS model). No clicks. |
| Voices | Fixed pool allocated in the constructor. Voice stealing: oldest released, then oldest held, with a 5 ms fade on the stolen voice. |
| Note on velocity 0 | Note off. |
| CC 120 / 123 | Release every voice (with its release fade); drop queued events at or after that frame. |
| CC 64 (sustain) | Hold note-offs while down. |
| Pitch bend, other CCs | Optional. Map in the core only if a parameter needs it; IvanDAW maps knobs to `automation`, not CC. |
| Tail | Report release / reverb tail in seconds (`instance.tail`, `getTailLengthSeconds()`). |
| Denormals | `juce::ScopedNoDenormals` in JUCE; add a tiny DC offset or flush in the core for the wasm build. |
| Output | Hard clip at ±1 is the last step only as a guard; design gain staging so it never clips at default settings. |

## Web adapter

AudioWorklet. Copy Beatality's split:

| File | Beatality | Role |
| --- | --- | --- |
| `hosts/web/audio-thread/processor.ts` | same path | instantiates the wasm from posted bytes, keeps a frame-sorted event queue, calls `<pfx>_process` per 128-frame quantum (split at event frames), copies wasm memory to `outputs[0]` |
| `hosts/web/plugin.ts` | `hosts/web/plugin-v2.ts`, `apps/web-widget/src/daw-plugin.tsx` | `PluginFactory`: loads `processor.js`, fetches the wasm, creates the node, maps `schedule()` events to worklet messages, owns UI mount |
| `apps/web/vite.processor.ts` | same | compiles `processor.ts` to one import-free `processor.js` |

Audio memory: allocate two `Float32Array` views of 128 frames in wasm memory once (`<pfx>_alloc`), re-create the views if `memory.buffer` changed (`ALLOW_MEMORY_GROWTH`).

Samples: decode on the main thread (`ctx.decodeAudioData`), post planar `Float32Array`s to the worklet, copy into wasm memory there (Beatality's `bt_append` pattern: memory stays alive until the engine reports it released).

## State

`getState().data` = `{ v: 1, params: { id: value }, … }` plus anything the instrument owns (pattern, sample list). Samples the user loaded go in `files` (IvanDAW) and in the JUCE state as paths or embedded data. Beatality's `PackFile` / `.beatality` pack format is the model for a portable preset: one JSON text both hosts read and write.

## Done when

- [ ] Core test: note on → output RMS > 0.01 within 10 ms; note off → RMS < 0.001 after release + 10 ms; same samples for every block size.
- [ ] Core test: CC 123 while 8 voices sound → all silent after release, no voice left active.
- [ ] Core test: no NaN / Inf after 10 s of random notes and parameter changes (fuzz with a fixed seed).
- [ ] IvanDAW: Note hold → instrument → Master; Play sounds within 1.5 s, Stop silences within 0.5 s, no clicks on volume / pan moves.
- [ ] `pluginval --strictness-level 10` and `auval` pass in `mac.yml`.
- [ ] DAW checklist in [07](../07-checklists.md) for Logic, Ableton, FL Studio.
