# 01 · Architecture

One repo per plugin. One C++ core. Two host adapters. The same layout as Beatality (`zhirnovcodes/Beatality`).

## Repo layout

```
<name>/
├── .github/workflows/
│   ├── daw-plugin.yml          IvanDAW build → release daw-build-<n> (see 05)
│   └── mac.yml                 AU + VST3 + Standalone, universal, validated (see 05)
├── CMakeLists.txt              core libs, tests, wasm target, JUCE targets
├── params.json                 THE parameter list (both hosts read it)
├── core/
│   ├── domain/                 pure logic: patterns, scales, sequences, RNG
│   └── engine/                 Engine.h/.cpp: block processing, the only class hosts call
├── hosts/
│   ├── common/                 small headers both adapters share (e.g. NoteGate.h)
│   ├── web/
│   │   ├── boundary/api.cpp    C ABI over Engine → <name>.wasm
│   │   ├── audio-thread/processor.ts   AudioWorklet (instruments only)
│   │   └── plugin.ts           PluginFactory (IvanDAW Plugin API v2)
│   └── plugin/
│       ├── PluginProcessor.h/.cpp      juce::AudioProcessor
│       ├── PluginEditor.h/.cpp         WebBrowserComponent showing ui/
│       └── ui/index.html, plugin.js    JUCE side of the shared skin
├── apps/web/                   pnpm package: Vite build of the IvanDAW plugin + dev page
│   ├── package.json            name @<name>/web; scripts dev, typecheck, build:daw
│   ├── vite.daw.config.ts      → dist-daw/ (index.js, manifest.json, <name>.wasm, processor.js)
│   ├── src/manifest.ts         PluginManifest as plain data
│   └── src/ui/                 the skin (HTML/CSS/TS), used by both hosts
├── tests/                      C++ test executables, one per area
├── package.json                private root; "packageManager": "pnpm@10.x"
├── pnpm-workspace.yaml         packages: ["apps/*"]
├── .gitignore                  node_modules/ third_party/ build*/ dist/ dist-daw/ .emscripten
└── CLAUDE.md                   from templates/CLAUDE.md
```

Beatality's names, for reference: its web package is `apps/web-widget` (`@beatality/web-widget`). New plugins use `apps/web` (`@<name>/web`).

## Layers and what each may use

| Layer | Folder | May use | Must not use |
| --- | --- | --- | --- |
| core | `core/` | C++20 std headers that need no exceptions | JUCE, emscripten, files, threads, clocks, `new` on the audio path, exceptions, RTTI |
| web adapter | `hosts/web/`, `apps/web/` | core via C ABI, `ivandaw-core`, Web Audio | JUCE |
| JUCE adapter | `hosts/plugin/` | core directly, JUCE | anything in `hosts/web` |
| skin | `apps/web/src/ui/` | DOM, CSS, a tiny bridge interface | knowledge of which host runs it |

Compile the core with `-fno-exceptions -fno-rtti` (`/GR- /EHs-c-` on MSVC). JUCE needs both on, so the flags go on core targets only. Copy Beatality's `beatality_core_flags()` CMake function as `<pfx>_core_flags()`.

## The Engine: one shape for all three plugin types

Every core exposes one class. Hosts call nothing else.

```cpp
// core/engine/Engine.h
#pragma once
#include <cstdint>

namespace <pfx> {

struct Transport {
    bool playing = false;
    double bpm = 120;
    double beat = 0;        // beats from project start at the frame this is applied
    int numerator = 4;
    int denominator = 4;
};

// What the engine sends out. Generators and controls fill it; instruments leave it empty.
struct OutEvent {
    int frame;              // 0..frames-1 inside the current process() call
    enum Kind : std::uint8_t { Midi, Control } kind;
    std::uint8_t b0, b1, b2;    // Midi: raw channel message
    int slot;                   // Control: output index (0..n-1)
    float value;                // Control: 0..1
};

class OutBuffer {               // fixed capacity, no allocation while processing
public:
    static constexpr int kCapacity = 512;
    bool push(const OutEvent& e);    // false when full; drop, never grow
    int size() const;
    const OutEvent& operator[](int i) const;
    void clear();
};

class Engine {
public:
    Engine(double sampleRate, std::uint32_t seed);

    // index = position in params.json. value = plain (min..max). Out of range index: ignore.
    void setParam(int index, double value);
    double param(int index) const;

    // Apply at `frame` of the next process() call. Call in frame order.
    void transport(const Transport& t, int frame);
    void midi(int frame, std::uint8_t status, std::uint8_t d1, std::uint8_t d2);

    // Render `frames` frames. left/right may be nullptr for MIDI-only engines.
    // Instruments add audio; generators and controls push to `out`.
    void process(int frames, float* left, float* right, OutBuffer& out);

    // Release every held note, clear queued events. Generators push the matching note-offs.
    void allOff(int frame, OutBuffer& out);
};

} // namespace <pfx>
```

Why one shape: JUCE calls `process()` once per audio block. The web adapter calls it from the AudioWorklet (instruments) or from a lookahead ticker on the main thread (generators and controls). The core never knows which.

## params.json: one parameter list

Beatality keeps two lists (APVTS in C++, `dawParameters.ts` in TS) that must match by hand. New plugins keep one file both hosts read.

```json
{
  "version": 1,
  "params": [
    { "id": "rate",  "label": "Rate",  "kind": "choice", "min": 0, "max": 4, "default": 2,
      "choices": ["1/4", "1/8", "1/16", "1/32", "1/8T"], "group": "Timing", "automatable": true },
    { "id": "gate",  "label": "Gate",  "kind": "float",  "min": 0.05, "max": 1, "default": 0.5,
      "unit": "%", "group": "Timing", "automatable": true },
    { "id": "cutoff", "label": "Cutoff", "kind": "float", "min": 20, "max": 20000, "default": 2000,
      "unit": "Hz", "scale": "log", "group": "Filter", "automatable": true }
  ]
}
```

Fields match `ParameterInfo` in ivandaw-core `src/api.ts` (no `format`; each host formats).

Rules:

- Array index = C ABI index = `Engine::setParam` index. **Append only.** Never reorder, never delete; mark a dead one `"automatable": false, "hidden": true`.
- `id` is stable forever (IvanDAW projects, DAW automation lanes, presets).
- Normalized → plain is the same function in both hosts:
  - `linear`: `min + n * (max - min)`
  - `log`: `min * (max / min) ^ n` (min > 0)
  - `int`, `choice`, `boolean`: round after mapping
  - `trigger`: fires when n rises past 0.5, reads back 0
- The web build imports it (`import params from '../../params.json'`). The JUCE build embeds it with `juce_add_binary_data` and builds the `AudioProcessorValueTreeState` layout from it at startup (see [04](04-vst-host.md)).
- A CMake or Vitest check fails the build if an `id` repeats or `default` is outside `min..max`.

## Threads

| Thread | JUCE | IvanDAW |
| --- | --- | --- |
| Audio | `processBlock` owns the Engine | AudioWorklet `process()` owns the Engine (instruments) |
| Scheduling | – | main-thread ticker every `TICK_MS` (25 ms) renders up to `LOOKAHEAD` (100 ms) ahead (generators, controls) |
| UI | message thread; queues commands, never touches the Engine | main thread; posts messages to the worklet |

Rules (both hosts, same as Beatality's `PluginProcessor.h` comment "The message thread only queues commands. The audio thread owns the engine."):

- Only the thread that calls `process()` touches the Engine.
- UI → engine: lock-free queue (JUCE) or `port.postMessage` (web). Parameters go through the host's parameter system, not the queue.
- No allocation, locks, logging or file I/O inside `process()`.

## The C ABI (web boundary)

`hosts/web/boundary/api.cpp` wraps the Engine in plain C functions, exactly like Beatality's `engine_api.cpp`. Standalone wasm, no emscripten JS glue.

```cpp
#include "Engine.h"
#include <cstdlib>
#include <new>

#define PFX_EXPORT extern "C" __attribute__((used, visibility("default")))

struct Instance { <pfx>::Engine engine; <pfx>::OutBuffer out;
                  Instance(double r, std::uint32_t s) : engine(r, s) {} };

PFX_EXPORT void* <pfx>_alloc(int bytes) { return bytes > 0 ? std::malloc(bytes) : nullptr; }
PFX_EXPORT void  <pfx>_free(void* p) { std::free(p); }
PFX_EXPORT Instance* <pfx>_create(double rate, std::uint32_t seed) {
    if (!(rate > 0)) return nullptr;
    void* m = std::malloc(sizeof(Instance));
    return m ? new (m) Instance(rate, seed) : nullptr;
}
PFX_EXPORT void <pfx>_destroy(Instance* i) { if (i) { i->~Instance(); std::free(i); } }
PFX_EXPORT void <pfx>_set_param(Instance* i, int index, double value) { if (i) i->engine.setParam(index, value); }
PFX_EXPORT void <pfx>_transport(Instance* i, int playing, double bpm, double beat, int num, int den, int frame);
PFX_EXPORT void <pfx>_midi(Instance* i, int frame, int status, int d1, int d2);
PFX_EXPORT void <pfx>_all_off(Instance* i, int frame);
// Renders, then the caller reads events with <pfx>_out_*.
PFX_EXPORT void <pfx>_process(Instance* i, int frames, float* left, float* right);
PFX_EXPORT int   <pfx>_out_count(Instance* i);
PFX_EXPORT int   <pfx>_out_frame(Instance* i, int k);
PFX_EXPORT int   <pfx>_out_kind(Instance* i, int k);   // 0 midi, 1 control
PFX_EXPORT int   <pfx>_out_bytes(Instance* i, int k);  // b0 | b1<<8 | b2<<16
PFX_EXPORT int   <pfx>_out_slot(Instance* i, int k);
PFX_EXPORT float <pfx>_out_value(Instance* i, int k);
```

One generic `<pfx>_set_param` replaces Beatality's ~40 `bt_set_*` exports, so adding a parameter never touches the ABI or the `-sEXPORTED_FUNCTIONS` list.

## Tests

| Layer | Tool | Where | Runs in |
| --- | --- | --- | --- |
| core | plain C++ executables printing `FAIL ...` lines, exit code ≠ 0 on failure (Beatality style) | `tests/` | `mac.yml` "Run core tests" |
| params.json | Vitest | `apps/web/src/params.test.ts` | `daw-plugin.yml` (`build:daw` runs `vitest run`) |
| web adapter | Vitest for pure TS; dev page for listening | `apps/web` | local + `daw-plugin.yml` |
| JUCE | `auval`, `pluginval --strictness-level 10` | – | `mac.yml` |

Test the core by feeding a fixed `Transport` and MIDI, calling `process()` in blocks of different sizes (1, 64, 128, 512, 4096), and checking the output is the same for every block size. Block-size independence is what makes the same core correct in both hosts.
