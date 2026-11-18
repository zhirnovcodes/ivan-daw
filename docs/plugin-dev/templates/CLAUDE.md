# <Name>: rules for agents

<Name> is a <MIDI note generator | MIDI control | audio instrument> built two ways from one C++ core:
an IvanDAW web plugin (wasm, Plugin API v2) and a JUCE plugin (VST3, AU<, AU MIDI FX>, Standalone).

Guide: ivan-daw `docs/plugin-dev/` (README, 01-architecture, types/<type>.md, 03-web-host, 04-vst-host, 05-ci-cd).
Reference implementation: zhirnovcodes/Beatality.

## Names

| Thing | Value |
| --- | --- |
| Repo / wasm / zip | `<name>` / `<name>.wasm` / `<name>-daw.zip` |
| IvanDAW id | `<id>` |
| JUCE target | `<Name>`<, `<Name>MidiFx`> |
| C ABI prefix / namespace | `<pfx>_` / `<pfx>::` |
| AU codes | manufacturer `<MFR>`, plugin `<CODE>`<, MIDI FX `<CODEFX>`> |

## Folder map

| Folder | Holds | Uses |
| --- | --- | --- |
| `core/` | all logic and DSP, `Engine` | C++20 std only; no exceptions, RTTI, I/O, allocation in `process` |
| `hosts/common/` | headers both hosts share | core |
| `hosts/web/` | C ABI (`boundary/api.cpp`), worklet, `PluginFactory` | core via C ABI, ivandaw-core |
| `hosts/plugin/` | JUCE processor and editor | core, JUCE |
| `apps/web/` | Vite build of the IvanDAW plugin, dev page, the skin in `src/ui/` | – |
| `tests/` | C++ test executables | core |
| `params.json` | the only parameter list | both hosts |

## Commands

```
# wasm
emcmake cmake -S . -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm --target <name>
# IvanDAW plugin → apps/web/dist-daw/
pnpm install
pnpm --filter @<name>/web build:daw
pnpm --filter @<name>/web dev
# JUCE + core tests
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build --target <Name>_VST3 <Name>_Standalone <AU target> <pfx>_tests
./build/<pfx>_tests
```

## Rules

- All behaviour lives in `core/`. Hosts translate; they never decide musical behaviour.
- `params.json` is append-only. Ids and indexes never change.
- The same input gives the same output for any block size. Core tests check sizes 1, 64, 128, 512, 4096.
- Every note-on gets a note-off (stop, CC 120/123, `setState`, dispose, bypass).
- Every sound start, stop or change gets a fade.
- Web: musical timing uses `createTicker` / `LOOKAHEAD` from ivandaw-core, never `setTimeout` / `setInterval`.
- JUCE: the message thread only queues work; the audio thread owns the Engine.
- The release contract (tag `daw-build-<n>`, asset `<name>-daw.zip`, `index.js` at zip root) never changes without a matching ivan-daw change.
- You cannot hear. Every check says exactly what Ivan should listen for.

## Workflow

- Branch, PR to `master`. CI: `daw-plugin.yml` (PR artifact; release on `master`), `mac.yml` (desktop zip, auval, pluginval, core tests).
- Before pushing: core tests and `build:daw` pass locally.
- PR description ends with a **Ready for IvanDAW** section (release, port / param / state changes, what to listen for).
- ivan-daw is changed only in its own session (pin bump in `plugins/<name>/package.json`).
